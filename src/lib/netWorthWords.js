// src/lib/netWorthWords.js
// -----------------------------------------------------------------------------
// THE WORDS FOR THE PLUS ADD-ON, BANK LOGIN LIMITS AND NET WORTH (2026-11-10). Every line the app shows for them.
// docs/product/NET-WORTH-WORDS.md lists each id: where it shows, the facts it must state, the line and its limit.
//
// EVERY LINE IS WORD FOR WORD AS APPROVED 2026-11-20 (ChatGPT 100, Grok 100, Amanda). Do not reword one here. The
// records: docs/review/PLUS-COPY-APPROVED-2026-11-20.md (the first 45 here and the server's 3) and
// docs/review/PLUS-BUY-COPY-APPROVED-2026-11-20.md (the last section, BUYING FLOURISH PLUS, plus-buy-*, 20 lines). A line changed later goes back to a "[WORDS: …]"
// placeholder until it is approved again, and nothing ships with one: scripts/check-pending-words.mjs refuses the
// production web build (netlify.toml) and every store build (npm run build:native), and tests/_pendingWords.cjs
// allows a placeholder only here, only for an id the words doc lists with its own placeholder as its line.
//
// A line may carry {used}, {limit} and {count}: whole numbers of bank logins, from the server's answer only, never
// worked out on the phone. While a line is a placeholder the values follow it in brackets, so a screen and a test
// can still see which numbers it is about.
// -----------------------------------------------------------------------------

/**
 * "THESE HOLDINGS ARE FROM {date}" (round 3 of the Plus review, NEW-4): shown next to one bank's holdings when they
 * could not be refreshed. Its words were approved on 2026-11-23 and are in NET_WORTH_WORDS below. This fills in the
 * date ("November 21, 2026"), and answers "" when there is no date to give (the bank answered, or no time is known).
 */
export const HOLDINGS_AS_OF_ID = "networth-plus-holdings-as-of";
export function holdingsAsOfLine(iso, words = NET_WORTH_WORDS, locale = "en-CA") {
  const line = words ? words[HOLDINGS_AS_OF_ID] : null;
  const at = Date.parse(iso);
  if (typeof line !== "string" || !line || /^\[WORDS:/.test(line) || !Number.isFinite(at)) return "";
  return line.replace("{date}", new Date(at).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" }));
}

export const NET_WORTH_WORDS = Object.freeze({
  // Any Plus screen, and the bank-login line, when the server could not read the household's plan.
  "plus-status-unavailable": "We couldn't check your plan just now. Nothing has changed. Please try again.",
  // Adding a bank: this person has used every bank login their plan includes ({used} of {limit}).
  "banks-limit-person": "You've connected {used} of the {limit} banks included for you. Your partner has their own bank limit. flourish Plus allows more banks for the household. Nothing you've connected changes.",
  // Adding a bank with Plus: the household has reached the fair-use limit ({used} of {limit}).
  "banks-limit-household": "Your household has connected {used} of the {limit} banks flourish Plus allows under its fair use limit. Nothing you've connected changes.",
  // Settings, banks: more banks connected than the plan includes ({count} connected, {limit} included). All stay.
  "banks-over-limit-kept": "You have {count} banks connected and your plan includes {limit}. They all stay connected and keep updating. You can add another once you're under the limit.",
  // Today's net worth card, with nothing entered or linked yet.
  "networth-empty-title": "No net worth to show yet",
  "networth-empty-body": "Add an account, a debt or a balance, or connect a bank, to start building your net worth here.",
  // Today's net worth card, before there are two months of the household's own figures to draw a line between.
  "networth-trend-not-yet": "Your trend line starts after two months of your own figures.",

  // NET WORTH BEHIND PLUS (Amanda, 2026-11-10): the locked state, and the Plus net worth screen (private by default).
  "networth-locked-title": "Net worth and investments come with flourish Plus",
  "networth-locked-body": "Net worth and investment holdings are part of the flourish Plus add-on. Your bank, card and loan balances stay where they are today.",
  "networth-locked-short": "With flourish Plus",
  "networth-locked-unavailable": "We couldn't check your plan just now, so net worth isn't shown. Nothing has changed. Please try again.",
  "networth-plus-title": "Net worth",
  "networth-plus-household-total": "Your household's net worth, by currency",
  "networth-plus-your-total": "Your own net worth. Anything your partner keeps private isn't included.",
  "networth-plus-no-total": "No total yet. It shows once every part below is complete. Each part says what's missing.",
  "networth-plus-part-missing": "Missing a balance, currency, type, or answer about whether a card is counted twice.",
  "networth-plus-yours": "Yours",
  "networth-plus-partner": "Shared by your partner",
  "networth-plus-household": "Household",
  "networth-plus-share": "Share this with my partner",
  "networth-plus-share-sensitive": "This account's type can reveal something about health or disability. Your partner doesn't see it unless you turn this on.",
  "networth-plus-registered": "Registered",
  "networth-plus-non-registered": "Non-registered",
  // Under one investment account's holdings, when that bank could not be refreshed ({date}: when they are from).
  // Approved 2026-11-23, word for word (ChatGPT 100 AGREE, Grok 100 AGREE; round 4 of the Plus review, R4-3). Its record
  // is its own: docs/review/PLUS-HOLDINGS-AS-OF-APPROVED-2026-11-23.md (tests/netWorthPlus.test.cjs 7n, 7o).
  "networth-plus-holdings-as-of": "We couldn't reach this bank just now. These holdings are from {date}.",
  "networth-plus-add": "Add a home, car or pension",
  "networth-plus-kind-home": "Home",
  "networth-plus-kind-car": "Car",
  "networth-plus-kind-pension": "Pension",
  "networth-plus-entry-label": "A short name. Your partner sees it only if you share this entry.",
  "networth-plus-entry-value": "Your own figure. Nothing is estimated.",
  "networth-plus-entry-currency": "CAD or USD",
  "networth-plus-save": "Done",
  "networth-plus-delete": "Delete",
  "networth-plus-error": "That change didn't go through. Nothing changed. Please try again.",

  // THE MAIN PLAN'S NAME (Amanda, 2026-11-10): to households the main paid plan is "flourish" (monthly, annual,
  // founding); "flourish Plus" is only the add-on. Every place a household saw "Flourish Plus" or "Plus" for the main
  // plan takes one of these. Product and entitlement ids never change. docs/product/PLAN-NAMES.md lists each place.
  // plan-adds-lead no longer says "every flourish feature": with the add-on, the main plan is not everything. The
  // store apps' paywall lead (lib/storeOffer.js PAYWALL_COPY.lead) is the same sentence, word for word.
  "plan-name": "flourish",
  "plan-get-cta": "Subscribe to flourish",
  "plan-upgrade-cta": "Subscribe to flourish →",
  "plan-on": "You're subscribed to flourish",
  "plan-includes-title": "A flourish subscription includes:",
  "plan-adds-title": "What's included with a subscription",
  "plan-adds-lead": "A flourish subscription includes Credit and the coach-run meeting, with no limits on the coach or What-If.",
  "plan-sim-limit": "You've used today's free What-If simulations. A flourish subscription has unlimited What-If, or come back tomorrow.",
  "plan-sim-cta": "Unlimited What-If with a subscription →",
  "plan-terms-web-label": "flourish subscription:",
  "plan-terms-lifts-limits": "A flourish subscription lifts these limits.",
  "plan-household-extra-stripe": "Your partner's subscription already includes you. Cancel yours where you bought it: Settings > flourish > Manage subscription.",

  // BUYING FLOURISH PLUS (2026-11-20, 1.1.8): the purchase screen on the website (Stripe) and in the store apps (the
  // store's own purchase), and Manage once bought (src/PlusAddonScreen.jsx, src/lib/plusBuy.js). APPROVED 2026-11-20,
  // word for word (docs/review/PLUS-BUY-COPY-APPROVED-2026-11-20.md, numbered 1 to 20 in this order). A store app never
  // names the website, so plus-buy-manage-elsewhere says only "where it was bought"; plus-buy-web-note,
  // plus-buy-manage-app-store and plus-buy-manage-play show on the website only.
  "plus-buy-open": "See flourish Plus",
  "plus-buy-title": "flourish Plus",
  "plus-buy-lead": "An optional add-on to any flourish plan: net worth, investments and more connected banks.",
  "plus-buy-includes-networth": "Your net worth, by currency, with sharing you control",
  "plus-buy-includes-investments": "Your investment holdings, from your linked accounts",
  "plus-buy-includes-banks": "Up to {limit} connected banks for your household (fair use limit)",
  "plus-buy-separate": "flourish Plus is billed separately. If you also have a flourish subscription, cancelling one doesn't cancel the other.",
  "plus-buy-web-note": "Stripe handles the payment. flourish Plus starts after Stripe confirms it and renews until you cancel.",
  "plus-buy-not-available": "flourish Plus isn't available to buy here yet. Nothing was charged.",
  "plus-buy-already": "Your household already has flourish Plus, so nothing was bought.",
  "plus-buy-pending": "The store is still waiting on this purchase. flourish Plus starts after the store confirms it.",
  "plus-buy-web-failed": "That didn't open. Nothing was charged. Please try again.",
  "plus-buy-started": "Thanks. flourish Plus appears here after Stripe confirms the payment.",
  "plus-buy-web-cancelled": "Checkout was closed. Nothing was charged.",
  "plus-buy-charged-twice": "You already had flourish Plus, and the store took this purchase as well. flourish Plus stays on. You can ask the store that charged you for a refund of this purchase: Apple at reportaproblem.apple.com, or Google Play from your order history.",
  "plus-buy-have": "Your household has flourish Plus.",
  "plus-buy-have-partner": "Your partner's flourish Plus includes you.",
  "plus-buy-manage-app-store": "To change or cancel flourish Plus, open Settings on your iPhone, tap your name, then Subscriptions.",
  "plus-buy-manage-play": "To change or cancel flourish Plus, open Google Play, tap your profile, then Payments & subscriptions, then Subscriptions.",
  "plus-buy-manage-elsewhere": "flourish Plus on this account is managed where it was bought.",
});

/** The words for an id. {used}, {limit} and {count} are filled in; a placeholder carries them after it. */
export function netWorthWords(id, values = {}) {
  const w = NET_WORTH_WORDS[id];
  if (typeof w !== "string") throw new Error(`no such words: ${id}`);
  const keys = ["used", "limit", "count"].filter((k) => values[k] !== undefined);
  if (/^\[WORDS:/.test(w)) return keys.length ? `${w} [${keys.map((k) => `${k} ${values[k]}`).join(", ")}]` : w;
  return keys.reduce((s, k) => s.split(`{${k}}`).join(String(values[k])), w);
}
