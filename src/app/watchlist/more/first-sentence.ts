/** An explanation cut after its first sentence: what is shown, and what "more" opens. Together they are the text. */
export type Cut = { first: string, rest: string };

/**
 * The rest has to be worth a click: a second sentence of a few words stays in sight with the first.
 */
const WORTH_HIDING = 60;
/** From this many characters a first sentence is long enough to be cut at a colon inside it. */
const LONG_SENTENCE = 180;
/** A colon this early is a lead-in ("How many: ...") and not a place to cut. */
const SHORTEST_START = 40;

/**
 * Where a sentence ends: a full stop, a question mark or an exclamation mark (with a bracket or a quotation mark
 * that closes right after it), followed by a space and the start of another sentence (a capital, a figure, a sign,
 * an opening bracket or quotation mark). A decimal point ("+9.3%") is followed by a figure, not by a space, and
 * a lead-in ("How many: ...") ends in a colon: neither ends a sentence.
 */
const SENTENCE_END = /[.!?][)"”’']*(?=\s+[("“‘']*[A-Z0-9$+−-])/;

/**
 * Cuts an explanation after its first sentence, every character kept: `first + rest` is the text again, the space
 * between the two sentences at the start of `rest`. The whole text is `first` when it is one sentence, or when what
 * follows the first is too short to be worth hiding.
 */
export function firstSentence(text: string): Cut {
  const end = SENTENCE_END.exec(text);
  if (!end) {
    return {first: text, rest: ''};
  }
  let at = end.index + end[0].length;
  // A first sentence that runs on after a colon (what two columns are: a list of what each holds) is cut at the
  // colon, which stays: one sentence of fifty-five words was all that showed of a note.
  const colon = text.indexOf(': ');
  if (at > LONG_SENTENCE && colon >= SHORTEST_START && colon < at) {
    at = colon + 1;
  }
  const rest = text.slice(at);
  return rest.trim().length < WORTH_HIDING ? {first: text, rest: ''} : {first: text.slice(0, at), rest};
}
