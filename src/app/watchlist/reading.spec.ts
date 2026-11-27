import {
  failureText, NOT_TESTED_NOTE, parseState, READ_AGAIN, READ_BUTTON, readByLine, Reading, READING_NOW, readingSentences, shownFor, siteOf, sourceTitle
} from "./reading";

const reading: Reading = {
  day: '2026-11-03', what: 'The company lowered its sales forecast for next quarter.', about: 'company', readAt: '2026-11-22T12:00:00.000Z',
  sources: [
    {title: 'Example Corp lowers its sales forecast', url: 'https://news.example.com/forecast'},
    {title: 'example shares fall after results', url: 'https://www.example.org/markets/results?ref=home'},
    {title: 'Chip makers slide', url: 'https://example.net/chips'},
  ],
};

describe('a reading (what Claude Code found in the news about a fall)', () => {
  describe('its words', () => {
    it('names what the button does and what is going on while it works', () => {
      expect(READ_BUTTON).toBe('Read it for me');
      expect(READ_AGAIN).toBe('Read again');
      expect(READING_NOW).toBe('The AI is searching the news about this fall. This takes up to a minute.');
    });

    it('says what happened in the words of the reading, then what kind of news it was in words of its own', () => {
      expect(readingSentences(reading)).toBe('The company lowered its sales forecast for next quarter. This is about the company itself, not the whole market.');
      expect(readingSentences({...reading, what: 'Chip makers fell together after new export rules.', about: 'industry'}))
        .toBe('Chip makers fell together after new export rules. This is about its whole industry, not only this company.');
      expect(readingSentences({...reading, what: 'The whole stock market fell after new import taxes were announced.', about: 'market'}))
        .toBe('The whole stock market fell after new import taxes were announced. This is about the whole market, not only this company.');
    });

    it('says so plainly when the news gave no clear reason', () => {
      expect(readingSentences({...reading, what: '', about: 'unclear', sources: []})).toBe('The AI found no clear reason for this fall in the news.');
    });

    it('says who read it, when, that it is not tested, and how many pages it rests on', () => {
      expect(readByLine(reading)).toBe('Read by the AI on Nov 22 · not tested · 3 sources');
      expect(readByLine({...reading, sources: reading.sources.slice(0, 1)})).toBe('Read by the AI on Nov 22 · not tested · 1 source');
      expect(readByLine({...reading, about: 'unclear', sources: []})).toBe('Read by the AI on Nov 22 · not tested');
    });

    it('explains "not tested" in one place, for whoever asks', () => {
      expect(NOT_TESTED_NOTE).toBe('The AI searched the news and wrote this. No test shows that it helps to choose ' +
        'stocks, so it is context only: it changes neither the mark nor the plan.');
    });

    it('shows where a page is from, and starts its title with a capital', () => {
      expect(siteOf('https://www.example.org/markets/results?ref=home')).toBe('example.org');
      expect(siteOf('https://news.example.com/forecast')).toBe('news.example.com');
      expect(siteOf('not an address')).toBe('');
      expect(sourceTitle('example shares fall after results')).toBe('Example shares fall after results');
      expect(sourceTitle('Chip makers slide')).toBe('Chip makers slide');
      expect(sourceTitle('')).toBe('');
    });
  });

  describe('when it did not work', () => {
    it('names the problem and what to do about it, in plain words', () => {
      expect(failureText('busy')).toBe('The AI is reading another stock. Try again in a minute.');
      expect(failureText('timeout')).toBe('The AI took too long and was stopped. Try again.');
      expect(failureText('failed')).toBe('The AI did not answer. Try again.');
      expect(failureText('no-answer')).toBe('The AI did not give a usable answer. Try again.');
      expect(failureText('no-source')).toBe('The AI named no page for its answer, so it is not shown. Try again.');
      expect(failureText('signed-out')).toBe('Claude Code is not signed in. In the project folder, run "docker compose exec reader claude" and type /login.');
      expect(failureText('not-installed')).toBe('Claude Code is not running. Start the app again with "docker compose up -d".');
      expect(failureText('wrong-start')).toBe('This version of Claude Code did not start the way this page expects, so nothing was read.');
      expect(failureText('not-saved')).toBe('The reading could not be saved, so it is not shown. Try again.');
      expect(failureText('no-server')).toBe('The page could not reach Claude Code. Start the app again with "docker compose up -d" and try once more.');
    });
  });

  describe('what the server said, read with care', () => {
    const server = (body: object) => ({store: 'watchlist', ...body});

    it('understands each state', () => {
      expect(parseState(server({state: 'none'}))).toEqual({state: 'none'});
      expect(parseState(server({state: 'reading'}))).toEqual({state: 'reading'});
      expect(parseState(server({state: 'done', reading}))).toEqual({state: 'done', reading});
      expect(parseState(server({state: 'failed', reason: 'timeout'}))).toEqual({state: 'failed', reason: 'timeout'});
      expect(parseState(server({state: 'failed', reason: 'failed', reading}))).toEqual({state: 'failed', reason: 'failed', reading});
      expect(parseState(server({state: 'busy'}))).toEqual({state: 'failed', reason: 'busy'});
    });

    it('treats an answer that is not the store\'s as no Claude Code at all', () => {
      for (const body of [undefined, null, '<html></html>', 42, {state: 'done', reading}, {store: 'other', state: 'none'}]) {
        expect(parseState(body)).toEqual({state: 'failed', reason: 'no-server'});
      }
    });

    it('does not trust a state or a reason it does not know', () => {
      expect(parseState(server({state: 'flying'}))).toEqual({state: 'failed', reason: 'failed'});
      expect(parseState(server({error: 'That is not a day.'}))).toEqual({state: 'failed', reason: 'failed'});
      expect(parseState(server({state: 'failed', reason: 'gremlins'}))).toEqual({state: 'failed', reason: 'failed'});
    });

    it('shows no reading that is not whole, and no page that is not a web address', () => {
      expect(parseState(server({state: 'done', reading: {...reading, about: 'aliens'}}))).toEqual({state: 'none'});
      expect(parseState(server({state: 'done', reading: {...reading, what: 7}}))).toEqual({state: 'none'});
      expect(parseState(server({state: 'done'}))).toEqual({state: 'none'});
      const odd = {...reading, sources: [{title: 'Bad', url: 'javascript:alert(1)'}, reading.sources[0], {title: 7, url: 'https://example.net/x'}, 'x']};
      expect(parseState(server({state: 'done', reading: odd}))).toEqual({state: 'done', reading: {...reading, sources: [reading.sources[0]]}});
    });
  });

  describe('which reading belongs to the fall on the page', () => {
    it('is the one read for that day', () => {
      expect(shownFor({state: 'done', reading}, '2026-11-03')).toEqual(reading);
      expect(shownFor({state: 'failed', reason: 'timeout', reading}, '2026-11-03')).toEqual(reading);
    });

    it('is none when the stock has since had a bigger fall on another day, or was never read', () => {
      expect(shownFor({state: 'done', reading}, '2026-11-17')).toBeUndefined();
      expect(shownFor({state: 'none'}, '2026-11-03')).toBeUndefined();
      expect(shownFor({state: 'reading'}, '2026-11-03')).toBeUndefined();
      expect(shownFor(undefined, '2026-11-03')).toBeUndefined();
    });
  });
});
