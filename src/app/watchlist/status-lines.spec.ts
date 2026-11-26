import {copyLine, evidenceLine, joinNotes, recorderLine} from "./status-lines";

const TODAY = '2026-11-24';

describe('recorderLine (what the page says about the daily recorder)', () => {
  it('says nothing when the recorder has never run', () => {
    [undefined, null, 'text', {}, {ok: true}].forEach(status => expect(recorderLine(status, TODAY)).withContext(JSON.stringify(status)).toBe(''));
  });

  it('says when it last recorded, and how many stocks', () => {
    expect(recorderLine({ranAt: '2026-11-23T21:30:05.000Z', ok: true, day: '2026-11-23', recorded: 31}, TODAY))
      .toBe('Also recorded automatically: last on Nov 23 (31 stocks).');
  });

  it('says so when its last run failed, with the reason', () => {
    expect(recorderLine({ranAt: '2026-11-23T21:30:05.000Z', ok: false, day: '2026-11-23', message: 'the data source did not answer'}, TODAY))
      .toBe('The automatic recording failed on Nov 23: the data source did not answer. That day is in the log only if this page was opened.');
  });

  it('says to check that Docker is started when it has not recorded for more than four days', () => {
    expect(recorderLine({ranAt: '2026-11-17T21:30:05.000Z', ok: true, day: '2026-11-17', recorded: 31}, TODAY))
      .toBe('The automatic recording last ran on Nov 17. It runs every weekday while the app is running: check that Docker is started.');
  });

  it('does not call a long weekend a stopped schedule', () => {
    expect(recorderLine({ranAt: '2026-11-20T21:30:05.000Z', ok: true, day: '2026-11-20', recorded: 31}, TODAY)).toContain('last on Nov 20');
  });
});

describe('evidenceLine (what the page says about the last re-run of the backtests)', () => {
  const ran = {ranAt: '2026-12-21T18:00:00.000Z', refreshed: true, changes: []};

  it('says nothing when the backtests were never re-run, or the re-run went through', () => {
    expect(evidenceLine(undefined)).toBe('');
    expect(evidenceLine({...ran, ok: true, updated: true, blocking: [], notes: []})).toBe('');
  });

  it('says why the tested numbers were not updated', () => {
    const blocking = ['The app says a 20% stop-loss lowered the average result (pre-registered H3). H3 is now FAIL.'];
    expect(evidenceLine({...ran, ok: false, updated: false, blocking, notes: []})).toBe(
      'The backtests were re-run on Dec 21 and the tested numbers were NOT updated: ' +
      'The app says a 20% stop-loss lowered the average result (pre-registered H3). H3 is now FAIL.');
  });

  it('mentions how many more reasons there are', () => {
    const line = evidenceLine({...ran, ok: false, updated: false, blocking: ['First reason.', 'Second.', 'Third.'], notes: []});
    expect(line).toContain('First reason.');
    expect(line).toContain(' (and 2 more)');
    expect(line).not.toContain('data/');
  });

  it('says so when the re-run gave no reason, without naming a file', () => {
    expect(evidenceLine({...ran, ok: false, updated: false, blocking: [], notes: []})).toBe(
      'The backtests were re-run on Dec 21 and the tested numbers were NOT updated: no reason was recorded');
  });

  it('passes on a note from a re-run that went through', () => {
    expect(evidenceLine({...ran, ok: true, updated: true, blocking: [], notes: ['H4 (a 20% dip threshold) now passes on the newest list.']}))
      .toBe('From the re-run of the backtests on Dec 21: H4 (a 20% dip threshold) now passes on the newest list.');
  });
});

describe('copyLine (what the page says about the daily copy of the records)', () => {
  it('says when the copy could not be made, and what to check', () => {
    expect(copyLine({triedAt: '2026-11-23T22:00:00.000Z', ok: false, message: 'the folder is not writable'})).toBe(
      'The daily copy of your records could not be made on Nov 23. Check that Docker can write to the folder that holds your data.');
  });

  it('says nothing when the copy was made', () => {
    expect(copyLine({triedAt: '2026-11-23T22:00:00.000Z', ok: true, file: 'copy-2026-11-23.json'})).toBe('');
  });

  it('says nothing when there is no record of a copy yet, or it cannot be read as one', () => {
    [undefined, null, 'text', 7, [], {}, {ok: false}, {triedAt: 5, ok: false}].forEach(status =>
      expect(copyLine(status)).withContext(JSON.stringify(status)).toBe(''));
  });
});

describe('joinNotes (the notes that need attention, said one after the other)', () => {
  it('ends each note with a full stop before the next, adding one only where it is missing', () => {
    expect(joinNotes(['The backtests were NOT updated: no reason was recorded', 'The daily copy could not be made.']))
      .toBe('The backtests were NOT updated: no reason was recorded. The daily copy could not be made.');
    expect(joinNotes(['Done.', 'Really?', 'Yes!', 'And more'])).toBe('Done. Really? Yes! And more');
  });

  it('leaves a single note as it is, and passes over the empty ones', () => {
    expect(joinNotes(['', 'Only this one'])).toBe('Only this one');
    expect(joinNotes(['Only this one.', ''])).toBe('Only this one.');
  });

  it('says nothing when there is nothing to say', () => {
    expect(joinNotes([])).toBe('');
    expect(joinNotes(['', ''])).toBe('');
  });
});
