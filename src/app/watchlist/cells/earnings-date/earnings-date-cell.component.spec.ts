import {EarningsDateCellComponent} from "./earnings-date-cell.component";

const cell = (o: Partial<EarningsDateCellComponent>) => Object.assign(new EarningsDateCellComponent(), o);

describe('EarningsDateCellComponent (when a company next reports its results)', () => {
  // The owner: "Is there opportunity to reduce some of the verbosity to condense the info in the table? ... for
  // example the next results column". A far report is its day; one within two weeks also says how soon.
  it('shows the day of a report that is weeks away, and how soon one is that is within two weeks', () => {
    const far = cell({date: new Date('2027-02-02T12:00:00'), days: 72});
    expect([far.dateText, far.subText]).toEqual(['Feb 2', '']);
    expect(cell({date: new Date('2026-12-01T12:00:00'), days: 9}).subText).toBe('in 9 days');
    expect(cell({date: new Date('2026-11-23T12:00:00'), days: 1}).subText).toBe('tomorrow');
    expect(cell({date: new Date('2026-11-22T12:00:00'), days: 0}).subText).toBe('today');
  });

  it('explains a coming report without the trade\'s words, and warns when it is close', () => {
    const far = cell({date: new Date('2027-02-02T12:00:00'), days: 72}).tooltip;
    expect(far).withContext('how far off it is, now on the hover').toMatch(
      /^Next quarterly results expected .*2027, in 72 days\.\nThe report changes the growth numbers, so the mark may change afterwards\.$/);
    const soon = cell({date: new Date('2026-12-01T12:00:00'), days: 9}).tooltip;
    expect(soon).toContain('\nPrices often swing sharply around a report: look at the mark again after it.\n');
  });

  it('says how the last report compared with what analysts expected, when no next date is known', () => {
    const reported = (surprisePercent?: number) => cell({reported: {date: new Date('2026-11-17T12:00:00'), daysAgo: 5, surprisePercent}});
    expect([reported(8.5).dateText, reported(8.5).subText]).withContext('the day, then the result in whole percent').toEqual(['Nov 17', 'beat 9%']);
    expect(reported(-3).subText).toBe('missed 3%');
    expect(reported(160.7).subText).toBe('beat 161%');
    expect(reported().subText).toBe('reported');
    expect(reported(8.5).tooltip).toBe(
      'Last reported 5 days ago; profit per share beat what analysts expected by 8.5%.\nThe next date is not announced yet.');
    expect(reported(-3).tooltip).toBe(
      'Last reported 5 days ago; profit per share missed what analysts expected by 3.0%.\nThe next date is not announced yet.');
    expect(reported().tooltip).toBe('Last reported 5 days ago; how it compared with what analysts expected is not known.\nThe next date is not announced yet.');
  });

  it('says so when no date is known at all', () => {
    expect(cell({}).dateText).toBe('—');
    expect(cell({}).tooltip).toBe('No date for the next results is known.');
  });
});
