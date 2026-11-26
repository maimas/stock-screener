'use strict';
/**
 * Starts the Claude Code that is installed on this computer for one fixed job (a "recipe"), without a terminal,
 * and gives back its answer. It signs in the way `claude` does in a terminal: with your login, or with an API key
 * when one is set in the environment the app was started from.
 *
 * A run started from a web page must not be able to do more than its recipe says, so this is strict:
 *  - it gets only the tools the recipe names, no connectors, and nobody to ask for more ("dontAsk": anything
 *    else is refused, not prompted for);
 *  - it runs in a new, empty folder outside the project, with memory, project instructions, skills and hooks off;
 *  - the question is typed in, never put on the command line;
 *  - before any answer is accepted, the run must report that it was started exactly like that. If a newer Claude
 *    Code starts it differently (another tool, a connector, another permission mode), the run is stopped at once
 *    and nothing is shown: better no answer than one from a run that could do more than intended.
 *
 * What Claude Code itself tells every run cannot be switched off from here: the email of the signed-in account,
 * today's date and the path of the temporary folder. A recipe that may only search the web has nowhere to send
 * them but a search.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');

/** Set by a Claude Code session for the programs it starts. A run of its own must not inherit them. */
const OF_A_SESSION = new Set([
  'CLAUDECODE', 'CLAUDE_EFFORT', 'CLAUDE_PID', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_BRIDGE_SESSION_ID', 'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_CHILD_NOTES_DIR', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_EXECPATH', 'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_SESSION_ATTENDED',
]);

/** Claude Code adds this tool itself when an answer must have a given shape. */
const ANSWER_TOOL = 'StructuredOutput';

function lookUp(name, platform = process.platform) {
  const found = spawnSync(platform === 'win32' ? 'where.exe' : 'which', [name], {encoding: 'utf8', windowsHide: true});
  return found.status === 0 ? found.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean) : [];
}

/**
 * Where the Claude Code program is, or undefined when it is not installed. CLAUDE_BIN names it outright.
 * On Windows `claude` is a command file in front of the real program; only the program itself can be started with
 * arguments passed exactly as written, so that is what is looked for.
 */
function findClaude({env = process.env, platform = process.platform, exists = fs.existsSync, lookUp: find = name => lookUp(name, platform)} = {}) {
  if (env.CLAUDE_BIN) {
    return exists(env.CLAUDE_BIN) ? env.CLAUDE_BIN : undefined;
  }
  const found = find('claude');
  if (platform !== 'win32') {
    const own = env.HOME && path.posix.join(env.HOME, '.local', 'bin', 'claude');
    return found[0] ?? (own && exists(own) ? own : undefined);
  }
  const candidates = [
    ...found.filter(file => /\.exe$/i.test(file)),
    ...found.map(file => path.win32.join(path.win32.dirname(file), 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')).filter(exists),
    ...(env.USERPROFILE ? [path.win32.join(env.USERPROFILE, '.local', 'bin', 'claude.exe')].filter(exists) : []),
  ];
  return candidates[0];
}

function argsFor(recipe) {
  const tools = recipe.tools.join(',');
  return [
    '-p', '--output-format', 'stream-json', '--verbose',
    '--json-schema', JSON.stringify(recipe.schema),
    '--system-prompt', recipe.system,
    '--tools', tools,
    '--allowedTools', tools,
    '--disallowedTools', 'mcp__*',
    '--strict-mcp-config',
    '--permission-mode', 'dontAsk',
    '--permission-prompts', 'none',
    '--no-session-persistence',
    '--max-budget-usd', String(recipe.maxUsd),
    '--effort', recipe.effort,
    '--safe-mode',
  ];
}

function envFor(env) {
  return {
    ...Object.fromEntries(Object.entries(env).filter(([name]) => !OF_A_SESSION.has(name))),
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
  };
}

const oneLine = text => String(text ?? '').replace(/\s+/g, ' ').trim();

/** Why a run must not be trusted, from how it says it was started; undefined when it started as the recipe says. */
function startProblem(recipe, event) {
  if (!Array.isArray(event.tools)) {
    return 'the run did not say which tools it has';
  }
  const extra = event.tools.filter(tool => tool !== ANSWER_TOOL && !recipe.tools.includes(tool));
  if (extra.length) {
    return `the run was given more tools than the recipe names: ${extra.join(', ')}`;
  }
  if (Array.isArray(event.mcp_servers) && event.mcp_servers.length) {
    return `the run has connectors attached: ${event.mcp_servers.map(server => server?.name ?? server).join(', ')}`;
  }
  if (event.permissionMode !== 'dontAsk') {
    return `the run is in permission mode "${event.permissionMode}"`;
  }
  return undefined;
}

/** The pages a search returned, as Claude Code reports them beside the search's result. */
function linksIn(event) {
  const results = event.tool_use_result?.results;
  return (Array.isArray(results) ? results : [])
    .flatMap(result => Array.isArray(result?.content) ? result.content : [])
    .filter(link => typeof link?.url === 'string')
    .map(link => ({title: typeof link.title === 'string' ? link.title : '', url: link.url}));
}

/**
 * Runs the recipe on one question. Resolves with {ok: true, output, links, model, version, costUsd, seconds}, or
 * with {ok: false, reason, detail?} where reason is one of: not-installed, wrong-start, signed-out, timeout, failed.
 * It never rejects.
 */
function runRecipe(recipe, prompt, options = {}) {
  const {spawnProcess = spawn, env = process.env, tmp = os.tmpdir()} = options;
  const claude = 'claude' in options ? options.claude : findClaude({env});
  if (!claude) {
    return Promise.resolve({ok: false, reason: 'not-installed'});
  }
  const cwd = fs.mkdtempSync(path.join(tmp, 'claude-run-'));
  const startedAt = Date.now();
  return new Promise(resolve => {
    let child, timer, settled = false, startedRight = false, model, version, pending = '', complaints = '';
    const links = [];

    const finish = outcome => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      try {
        child?.kill();
      } catch {
        // already gone
      }
      // The folder can stay busy for a moment while the program ends; the answer waits for it to be removed.
      fs.rm(cwd, {recursive: true, force: true, maxRetries: 5, retryDelay: 200}, () => resolve(outcome));
    };

    const handle = line => {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;                                     // not one of its reports: nothing to learn from it
      }
      if (event?.type === 'system' && event.subtype === 'init') {
        const problem = startProblem(recipe, event);
        if (problem) {
          return finish({ok: false, reason: 'wrong-start', detail: problem});
        }
        startedRight = true;
        model = event.model;
        version = event.claude_code_version;
      } else if (event?.type === 'user') {
        links.push(...linksIn(event));
      } else if (event?.type === 'result') {
        if (!startedRight) {
          return finish({ok: false, reason: 'wrong-start', detail: 'the run answered without saying how it was started'});
        }
        if (event.is_error || event.subtype !== 'success') {
          const detail = oneLine(event.result ?? event.subtype).slice(0, 200);
          return finish({ok: false, reason: /log ?in|sign ?in|authenticat|api key/i.test(detail) ? 'signed-out' : 'failed', detail});
        }
        if (event.structured_output === undefined || event.structured_output === null) {
          return finish({ok: false, reason: 'failed', detail: 'Claude Code gave no answer in the required shape.'});
        }
        finish({
          ok: true, output: event.structured_output, links, model, version,
          costUsd: event.total_cost_usd, seconds: Math.round((Date.now() - startedAt) / 100) / 10,
        });
      }
    };

    try {
      child = spawnProcess(claude, argsFor(recipe), {cwd, env: envFor(env), windowsHide: true});
    } catch (error) {
      return finish({ok: false, reason: 'failed', detail: oneLine(error.message)});
    }
    timer = setTimeout(() => finish({ok: false, reason: 'timeout'}), recipe.timeoutMs);
    child.on('error', error => finish({ok: false, reason: 'failed', detail: oneLine(error.message)}));
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', text => {
      pending += text;
      for (let at = pending.indexOf('\n'); at >= 0; at = pending.indexOf('\n')) {
        const line = pending.slice(0, at).trim();
        pending = pending.slice(at + 1);
        if (line) {
          handle(line);
        }
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', text => { complaints = (complaints + text).slice(-2000); });
    child.on('close', () => {
      if (pending.trim()) {
        handle(pending.trim());
      }
      const last = complaints.split(/\r?\n/).map(oneLine).filter(Boolean).pop();
      finish({ok: false, reason: 'failed', detail: (last ?? 'Claude Code ended without an answer.').slice(0, 200)});
    });
    child.stdin.on('error', () => {});               // it ended before reading the question; "close" reports that
    child.stdin.end(prompt);
  });
}

module.exports = {findClaude, argsFor, envFor, runRecipe};
