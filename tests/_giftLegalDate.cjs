// tests/_giftLegalDate.cjs
// -----------------------------------------------------------------------------
// The gift words' day (src/lib/giftReturn.js GIFT_LEGAL_DATE: the Terms' Gifts section and the Privacy Policy's Gifts
// entry, approved 2026-11-20), read from the source because that module reads import.meta.env and plain Node cannot load
// it. On the WEBSITE both pages are dated the later of their own date and this day; a store app's dates do not move.
// The tests that render those pages ask here, so setting the real deploy day (docs/ops/GIFT-GO-LIVE.md, step 1) breaks none.
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");

const SRC = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "giftReturn.js"), "utf8");
const GIFT_LEGAL_DATE = (/export const GIFT_LEGAL_DATE = NATIVE_BUILD \? null : "(\d{4}-\d{2}-\d{2})";/.exec(SRC) || [])[1] || null;
/** "2026-11-20" to "November 20, 2026", as the pages write it. */
const label = (iso) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
/** The day a page's own date (YYYY-MM-DD) becomes on the website. */
const webDay = (own) => (GIFT_LEGAL_DATE && GIFT_LEGAL_DATE > own ? GIFT_LEGAL_DATE : own);
/** The same, as the page's words. */
const webLabel = (own) => label(webDay(own));
/** A date-time's day where these tests run (the Terms page dates the trial-plan-first switch in local time). */
const localDay = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

module.exports = { GIFT_LEGAL_DATE, label, webDay, webLabel, localDay };
