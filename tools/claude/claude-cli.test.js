'use strict';
// Run with: npm run test:tools
const {test, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {EventEmitter} = require('node:events');
const {PassThrough, Writable} = require('node:stream');
const {findClaude, argsFor, envFor, runRecipe} = require('./claude-cli');

const recipe = {
  name: 'sample', tools: ['WebSearch'], effort: 'medium', maxUsd: 1, timeoutMs: 5_000,
  system: 'Answer in the required format.',
  schema: {type: 'object', required: ['what'], properties: {what: {type: 'string'}}},
};

/** Stands in for the Claude Code program: records how it was started and answers as `script` says. */
function fakeClaude(script) {
  const calls = [];
  const spawnProcess = (file, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.typed = '';
    child.killed = false;
    child.stdin = new Writable({
      write(chunk, _encoding, done) { child.typed += chunk; done(); },
      final(done) { done(); setImmediate(() => script(child)); },
    });
    child.kill = () => {
      if (!child.killed) {
        child.killed = true;
        finish(child, null);
      }
      return true;
    };
    calls.push({file, args, options, child});
    return child;
  };
  return {spawnProcess, calls};
}

const say = (child, ...events) => events.forEach(event => !child.ended && child.stdout.write(JSON.stringify(event) + '\n'));

/** The program ends: like a real one, it reports that only after everything it printed has been read. */
function finish(child, code = 0) {
  if (child.ended) {
    return;
  }
  child.ended = true;
  let open = 2;
  const closed = () => {
    if (--open === 0) {
      child.emit('close', code);
    }
  };
  child.stdout.once('end', closed);
  child.stderr.once('end', closed);
  child.stdout.end();
  child.stderr.end();
}

const started = (changes = {}) => ({
  type: 'system', subtype: 'init', tools: ['StructuredOutput', 'WebSearch'], mcp_servers: [], permissionMode: 'dontAsk',
  model: 'claude-example-1', claude_code_version: '9.9.9', ...changes,
});
const searched = links => ({type: 'user', tool_use_result: {query: 'q', results: [{tool_use_id: 't1', content: links}, 'a summary in words']}});
const answered = (output, changes = {}) => ({type: 'result', subtype: 'success', is_error: false, structured_output: output, total_cost_usd: 0.1, ...changes});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-cli-test-'));
const run = (script, options = {}) => {
  const fake = fakeClaude(script);
  return runRecipe(recipe, 'Why did it fall?', {claude: 'C:/programs/claude.exe', spawnProcess: fake.spawnProcess, env: {PATH: '/bin'}, tmp, ...options})
    .then(outcome => ({outcome, call: fake.calls[0], calls: fake.calls}));
};

test('starts Claude Code with nothing but the tools of the recipe, and nobody to ask for more', () => {
  assert.deepEqual(argsFor(recipe), [
    '-p', '--output-format', 'stream-json', '--verbose',
    '--json-schema', JSON.stringify(recipe.schema),
    '--system-prompt', 'Answer in the required format.',
    '--tools', 'WebSearch',
    '--allowedTools', 'WebSearch',
    '--disallowedTools', 'mcp__*',
    '--strict-mcp-config',
    '--permission-mode', 'dontAsk',
    '--permission-prompts', 'none',
    '--no-session-persistence',
    '--max-budget-usd', '1',
    '--effort', 'medium',
    '--safe-mode',
  ]);
});

test('hands the run a clean environment: no memory, and nothing of the session that started the app', () => {
  assert.deepEqual(envFor({
    PATH: '/bin', HOME: '/home/me', CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'abc', CLAUDE_CODE_ENTRYPOINT: 'cli', CLAUDE_EFFORT: 'max', CLAUDE_PID: '7',
    CLAUDE_CODE_MESSAGING_TOKEN: 'of-that-session', CLAUDE_CODE_CHILD_SESSION: '1',
  }), {PATH: '/bin', HOME: '/home/me', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1'});
});

test('signs in the way a terminal would: what says how to sign in is passed on untouched', () => {
  const env = envFor({ANTHROPIC_API_KEY: 'made-up-key', CLAUDE_CODE_OAUTH_TOKEN: 'made-up-token', CLAUDE_CODE_USE_BEDROCK: '1'});
  assert.equal(env.ANTHROPIC_API_KEY, 'made-up-key');
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, 'made-up-token');
  assert.equal(env.CLAUDE_CODE_USE_BEDROCK, '1');
});

test('finds the program: where it is said to be, beside the Windows command, or on the path', () => {
  const none = () => false;
  assert.equal(findClaude({env: {CLAUDE_BIN: 'D:/tools/claude.exe'}, platform: 'win32', exists: file => file === 'D:/tools/claude.exe', lookUp: () => []}),
    'D:/tools/claude.exe');
  const beside = path.win32.join('C:\\node', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
  assert.equal(findClaude({env: {}, platform: 'win32', exists: file => file === beside, lookUp: () => ['C:\\node\\claude', 'C:\\node\\claude.cmd']}), beside);
  assert.equal(findClaude({env: {}, platform: 'win32', exists: none, lookUp: () => ['C:\\bin\\claude.exe']}), 'C:\\bin\\claude.exe');
  assert.equal(findClaude({env: {}, platform: 'linux', exists: none, lookUp: () => ['/usr/local/bin/claude']}), '/usr/local/bin/claude');
  assert.equal(findClaude({env: {}, platform: 'win32', exists: none, lookUp: () => ['C:\\node\\claude.cmd']}), undefined,
    'a command file alone cannot be started safely with a question in its arguments');
  assert.equal(findClaude({env: {}, platform: 'linux', exists: none, lookUp: () => []}), undefined);
  assert.equal(findClaude({env: {CLAUDE_BIN: 'D:/gone/claude.exe'}, platform: 'win32', exists: none, lookUp: () => []}), undefined);
});

test('gives back the answer, with the pages its searches returned', async () => {
  const {outcome, call} = await run(child => {
    say(child, started(), searched([{title: 'First', url: 'https://example.com/1'}, {title: 'Second', url: 'https://example.com/2'}]),
      searched([{title: 'Third', url: 'https://example.com/3'}]), answered({what: 'It fell.'}));
    finish(child);
  });
  assert.equal(outcome.ok, true);
  assert.deepEqual(outcome.output, {what: 'It fell.'});
  assert.deepEqual(outcome.links, [
    {title: 'First', url: 'https://example.com/1'}, {title: 'Second', url: 'https://example.com/2'}, {title: 'Third', url: 'https://example.com/3'},
  ]);
  assert.equal(outcome.model, 'claude-example-1');
  assert.equal(outcome.version, '9.9.9');
  assert.equal(outcome.costUsd, 0.1);
  assert.equal(typeof outcome.seconds, 'number');
  assert.equal(call.file, 'C:/programs/claude.exe');
  assert.deepEqual(call.args, argsFor(recipe));
  assert.equal(call.child.typed, 'Why did it fall?', 'the question is typed in, never put on the command line');
  assert.deepEqual(call.options.env, {PATH: '/bin', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1'});
  assert.notEqual(call.options.shell, true);
});

test('the folder it runs in is new, empty, outside the project, and gone when the run is over', async () => {
  const fake = fakeClaude(child => {
    child.listing = fs.readdirSync(child.cwd);
    say(child, started(), answered({what: 'It fell.'}));
    finish(child);
  });
  const spawnProcess = (file, args, options) => Object.assign(fake.spawnProcess(file, args, options), {cwd: options.cwd});
  const outcome = await runRecipe(recipe, 'Why?', {claude: 'claude', spawnProcess, env: {}, tmp});
  const {cwd, listing} = fake.calls[0].child;
  assert.equal(outcome.ok, true);
  assert.deepEqual(listing, []);
  assert.equal(path.dirname(cwd), tmp);
  assert.ok(!path.resolve(cwd).startsWith(path.resolve(__dirname, '..', '..')), 'not inside the project');
  assert.equal(fs.existsSync(cwd), false);
});

test('stops at once when the run was given a tool the recipe does not name', async () => {
  const {outcome, call} = await run(child => {
    say(child, started({tools: ['StructuredOutput', 'WebSearch', 'Bash']}));
    setTimeout(() => { say(child, answered({what: 'Too late.'})); finish(child); }, 20);
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'wrong-start');
  assert.match(outcome.detail, /Bash/);
  assert.equal(call.child.killed, true);
});

test('stops at once when a connector is attached, or when it could ask for more permissions', async () => {
  for (const change of [{mcp_servers: [{name: 'docs', status: 'connected'}]}, {permissionMode: 'auto'}, {tools: undefined}]) {
    const {outcome, call} = await run(child => say(child, started(change)));
    assert.equal(outcome.reason, 'wrong-start', JSON.stringify(change));
    assert.equal(call.child.killed, true);
  }
});

test('does not accept an answer that arrives before the run said how it was started', async () => {
  const {outcome} = await run(child => { say(child, answered({what: 'It fell.'})); finish(child); });
  assert.deepEqual({ok: outcome.ok, reason: outcome.reason}, {ok: false, reason: 'wrong-start'});
});

test('says so when Claude Code reports an error, and tells a missing sign-in apart', async () => {
  const failed = await run(child => { say(child, started(), answered(undefined, {is_error: true, subtype: 'error_during_execution', result: 'Usage limit\nreached.'})); finish(child); });
  assert.deepEqual(failed.outcome, {ok: false, reason: 'failed', detail: 'Usage limit reached.'});
  const signedOut = await run(child => { say(child, started(), answered(undefined, {is_error: true, result: 'Invalid API key · Please run /login'})); finish(child); });
  assert.equal(signedOut.outcome.reason, 'signed-out');
});

test('says so when the run ends without an answer, or without one in the required shape', async () => {
  const silent = await run(child => { say(child, started()); child.stderr.write('something went wrong\n'); finish(child, 1); });
  assert.deepEqual(silent.outcome, {ok: false, reason: 'failed', detail: 'something went wrong'});
  const shapeless = await run(child => { say(child, started(), answered(undefined)); finish(child); });
  assert.equal(shapeless.outcome.reason, 'failed');
});

test('stops a run that takes too long', async () => {
  const {outcome, call} = await runWith({...recipe, timeoutMs: 30}, child => say(child, started()));
  assert.deepEqual(outcome, {ok: false, reason: 'timeout'});
  assert.equal(call.child.killed, true);
});

function runWith(changed, script) {
  const fake = fakeClaude(script);
  return runRecipe(changed, 'Why?', {claude: 'claude', spawnProcess: fake.spawnProcess, env: {}, tmp}).then(outcome => ({outcome, call: fake.calls[0]}));
}

test('reads an answer that arrives in pieces', async () => {
  const {outcome} = await run(child => {
    const text = [started(), answered({what: 'It fell — sharply.'})].map(event => JSON.stringify(event)).join('\n') + '\n';
    const bytes = Buffer.from(text, 'utf8');
    const cut = bytes.indexOf(Buffer.from('—', 'utf8')) + 1;      // in the middle of a character
    child.stdout.write(bytes.subarray(0, 40));
    child.stdout.write(bytes.subarray(40, cut));
    child.stdout.write(bytes.subarray(cut));
    finish(child);
  });
  assert.deepEqual(outcome.output, {what: 'It fell — sharply.'});
});

test('does not start anything when Claude Code is not installed', async () => {
  const fake = fakeClaude(() => {});
  assert.deepEqual(await runRecipe(recipe, 'Why?', {claude: undefined, spawnProcess: fake.spawnProcess, env: {}, tmp}), {ok: false, reason: 'not-installed'});
  assert.equal(fake.calls.length, 0);
});

test('says so when the program cannot be started', async () => {
  const outcome = await runRecipe(recipe, 'Why?', {claude: 'claude', spawnProcess: () => { throw new Error('spawn EACCES'); }, env: {}, tmp});
  assert.deepEqual(outcome, {ok: false, reason: 'failed', detail: 'spawn EACCES'});
});

after(() => fs.rmSync(tmp, {recursive: true, force: true}));
