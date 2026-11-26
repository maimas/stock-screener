"""
The figures the app quotes, recorded by the scripts that compute them.

Each script ends with quoted.put('<its section>', {...}). The sections are kept together in quoted_figures.json,
next to the scripts, and `npm run evidence` turns that file into src/app/watchlist/evidence.generated.ts.
Nothing in the app's texts is typed in by hand: to change a number, re-run its script.
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
# `npm run evidence` points this at a scratch file, so the real one is only replaced when every script succeeded.
FILE = os.environ.get('QUOTED_FIGURES_FILE') or os.path.join(HERE, 'quoted_figures.json')


def put(section, figures):
    """Replaces one script's section, leaving the other scripts' sections as they are."""
    data = {}
    if os.path.exists(FILE):
        with open(FILE, encoding='utf-8') as f:
            data = json.load(f)
    data[section] = _clean(figures)
    with open(FILE, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, indent=2, sort_keys=True)
        f.write('\n')


def _clean(value):
    """Floats to 4 decimals, so the file does not change on the last bits of a float."""
    if isinstance(value, bool):
        return value
    if isinstance(value, float):
        return round(value, 4)
    if isinstance(value, dict):
        return {k: _clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_clean(v) for v in value]
    return value
