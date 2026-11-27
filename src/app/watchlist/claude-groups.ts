import {Stock} from "../api/microsoft-money.service";
import {factsFor, GroupRequest, ViewRequest} from "./claude-view";
import {ReadingAbout} from "./reading";
import {TiedGroups} from "./tied-groups";

/**
 * What goes to Claude with the stocks that are asked about, so that it can compare the ones that move together: the
 * groups those stocks are in (the letters of the "Group" column), each with its stocks that are in any of the
 * reader's own lists. Used by a list's button and by the button in a stock's details, so both ask in the same way.
 *
 * Only stocks of the reader's lists are ever named: a stock held outside every list is in no list's button, so it
 * is not among `listed`, and nothing says what is owned.
 */

/** As many groups, and stocks a group, as the server takes to compare (tools/claude/claude-compare.js). */
export const MOST_GROUPS = 8;
export const MOST_MEMBERS = 10;

/** A stock as it is sent: its symbol, its name and its figures. */
export function requestFor(stock: Stock, now: Date, about?: ReadingAbout): ViewRequest {
  return {symbol: stock.quote!.symbol!, name: stock.quote?.displayName || stock.quote!.symbol!, facts: factsFor(stock, now, about)};
}

/**
 * The groups to compare after the stocks in `asked`: each group one of them is in, with its stocks that are in any
 * of the reader's lists, the asked ones first. A group with one such stock has nothing to be compared with.
 */
export function groupsFor(asked: ViewRequest[], tied: TiedGroups, listed: Stock[], now: Date): GroupRequest[] {
  const mine = new Map(asked.map(it => [it.symbol, it]));
  const others = new Map(listed.filter(stock => !!stock.quote?.symbol).map(stock => [stock.quote!.symbol!, stock]));
  return tied.groups.filter(group => group.symbols.some(symbol => mine.has(symbol)))
    .map((group): GroupRequest => ({
      letter: group.letter,
      members: [...group.symbols.filter(symbol => mine.has(symbol)), ...group.symbols.filter(symbol => !mine.has(symbol) && others.has(symbol))]
        .slice(0, MOST_MEMBERS)
        .map(symbol => mine.get(symbol) ?? requestFor(others.get(symbol)!, now)),
    }))
    .filter(group => group.members.length >= 2)
    .slice(0, MOST_GROUPS);
}
