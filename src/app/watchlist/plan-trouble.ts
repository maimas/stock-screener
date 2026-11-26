/**
 * What the Portfolio view says where the plan is looked for when the plan cannot be worked out. Each is said in
 * place, with a way to try again: the bar at the top says it too, but far from where the reader is looking, and
 * the boxes used to stay on "Working it out from today's prices." for good.
 */

/** Not one price arrived on the first load. */
export const NO_PRICES = "Today's prices could not be loaded: the data source did not answer. Without them there is no plan to show.";

/** The same in the box under the plan, which has no plan to speak of. */
export const NO_PRICES_SHORT = "Today's prices could not be loaded: the data source did not answer.";

/**
 * The database did not answer and this browser holds nothing of its own: the empty portfolio on the screen is
 * not news about the reader's money, and the page must not read like a first run.
 */
export const PORTFOLIOS_UNREAD = 'Your saved portfolios could not be read: the database is not answering. ' +
  'Start the app with "docker compose up -d", then try again. What is shown here is an empty portfolio kept in this browser only.';
