import {isPromotional, parseHeadlines} from "./drop-news";

describe('isPromotional', () => {
  const promotional = [
    'Nvidia Stock Falls to $150 Per Share. Is it a Buy Now?',
    'Nvidia Stock Is Down 35% From Its High. History Suggests a $5,000 Investment Now Will Be Worth This Much by 2028.',
    'Should You Buy the Dip in Micron Stock?',
    '3 Top AI Stocks to Buy Right Now',
    'Prediction: This Chip Stock Could Soar 80% in 2027',
  ];
  const explanatory = [
    'Nvidia stock plunges 14%, wraps up longest weekly losing streak since 2008 financial crisis',
    'Micron shares tumble after memory prices fall for a third month',
    'Marvell cuts guidance as data-center orders slow',
  ];

  promotional.forEach(title => it(`treats "${title.slice(0, 48)}..." as promotion`, () => {
    expect(isPromotional(title)).toBe(true);
  }));

  explanatory.forEach(title => it(`keeps "${title.slice(0, 48)}..."`, () => {
    expect(isPromotional(title)).toBe(false);
  }));
});

describe('parseHeadlines', () => {
  const item = (title: string, source: string, link: string) =>
    `<item><title>${title} - ${source}</title><link>${link}</link><pubDate>Fri, 20 Nov 2026 21:00:00 GMT</pubDate><source url="https://example.com">${source}</source></item>`;
  const xml = `<?xml version="1.0"?><rss><channel>
    ${item('Nvidia Stock Falls to $150 Per Share. Is it a Buy Now?', 'The Motley Fool', 'https://news.example/1')}
    ${item('Nvidia stock plunges 14%, wraps up longest weekly losing streak since 2008', 'CNBC', 'https://news.example/2')}
    ${item('3 Top AI Stocks to Buy Right Now', 'Zacks', 'https://news.example/3')}
    ${item('Chip stocks slide as export rules tighten', 'Reuters', 'https://news.example/4')}
  </channel></rss>`;

  it('skips promotional articles and keeps the ones that explain the fall', () => {
    expect(parseHeadlines(xml).map(h => h.source)).toEqual(['CNBC', 'Reuters']);
  });

  it('returns the article link so the headline can be opened', () => {
    expect(parseHeadlines(xml)[0].link).toBe('https://news.example/2');
  });

  it('strips the trailing " - Source" from the title', () => {
    expect(parseHeadlines(xml)[1].title).toBe('Chip stocks slide as export rules tighten');
  });

  it('returns at most the requested number of headlines', () => {
    expect(parseHeadlines(xml, 1).length).toBe(1);
  });
});
