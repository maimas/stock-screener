/**
 * What the page says about the two jobs that run without it: the daily recorder of the log (tools/recorder) and
 * the re-run of the backtests (tools/evidence). Each leaves a small status record in the database, and so does
 * the daily copy of the records. A job that failed, was stopped by a check or has gone quiet is said on the page,
 * so it does not go unnoticed.
 */

/** A weekday schedule can be quiet over a long weekend; longer than this means it has stopped. */
const QUIET_DAYS = 4;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** One line about the daily recorder, or '' when it has never run. `today` is YYYY-MM-DD. */
export function recorderLine(status: unknown, today: string): string {
  const s = status as any;
  if (!s || typeof s !== 'object' || typeof s.ranAt !== 'string' || typeof s.day !== 'string') {
    return '';
  }
  const day = shortDay(s.day);
  if (!s.ok) {
    return `The automatic recording failed on ${day}: ${s.message ?? 'no reason was given'}. ` +
      'That day is in the log only if this page was opened.';
  }
  if (daysBetween(s.day, today) > QUIET_DAYS) {
    return `The automatic recording last ran on ${day}. It runs every weekday while the app is running: check that Docker is started.`;
  }
  const count = typeof s.recorded === 'number' ? ` (${s.recorded} stock${s.recorded === 1 ? '' : 's'})` : '';
  return `Also recorded automatically: last on ${day}${count}.`;
}

/** One line about the last re-run of the backtests when it needs the user's attention, or ''. */
export function evidenceLine(status: unknown): string {
  const s = status as any;
  if (!s || typeof s !== 'object' || typeof s.ranAt !== 'string') {
    return '';
  }
  const day = shortDay(s.ranAt.slice(0, 10));
  const blocking: string[] = Array.isArray(s.blocking) ? s.blocking : [];
  const notes: string[] = Array.isArray(s.notes) ? s.notes : [];
  if (!s.ok) {
    const more = blocking.length > 1 ? ` (and ${blocking.length - 1} more)` : '';
    return `The backtests were re-run on ${day} and the tested numbers were NOT updated: ` +
      `${blocking[0] ?? 'no reason was recorded'}${more}`;
  }
  return notes.length ? `From the re-run of the backtests on ${day}: ${notes[0]}` : '';
}

/** "Nov 23" for a day written YYYY-MM-DD. */
function shortDay(day: string): string {
  return `${MONTHS[Number(day.slice(5, 7)) - 1] ?? ''} ${Number(day.slice(8, 10))}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** One line about the daily copy of the records, or '' when it worked or there is no record of one. */
export function copyLine(status: unknown): string {
  const s = status as any;
  if (!s || typeof s !== 'object' || s.ok !== false || typeof s.triedAt !== 'string') {
    return '';
  }
  return `The daily copy of your records could not be made on ${shortDay(s.triedAt.slice(0, 10))}. ` +
    'Check that Docker can write to the folder that holds your data.';
}

/** The notes that need attention, one after the other: each ends with a full stop before the next, unless it has one. */
export function joinNotes(notes: string[]): string {
  const said = notes.filter(Boolean);
  return said.map((note, i) => i < said.length - 1 && !/[.!?]$/.test(note) ? `${note}.` : note).join(' ');
}
