# AI visibility pages and the store rating prompt (2026-11-24)

Branch `ai-pages-ratings`, from main af0f7ff (Free v1 on the website, live). Not merged, not deployed.
Words: docs/product/AI-VISIBILITY-WORDS.md (approved round 4), word for word.

1. Pages, plain static HTML built after vite (like /guides/): /best-budgeting-apps-canada, /compare/ynab,
   /compare/monarch, /compare/waypoint, /press. Own title, description, canonical, a visible "Last updated" date,
   FAQ headings and FAQPage JSON-LD only for the FAQ block, store links, real tables. All five in sitemap.xml, linked
   from the home page's footer. An unknown path still gets the SPA fallback (app.html).
2. /press downloads: the existing logo, app icon and landing screenshots. No new art.
3. llms.txt: "Where to use it", "Pricing" and "Compare", everything already there kept.
4. Store rating prompt (src/lib/reviewRules.js, src/lib/reviewPrompt.js): two more moments, native only, same limits:
   about 3 seconds after the first safe-to-spend number (once per install) and the 3rd different day the app is
   opened (once per install). The meeting-done ask stays.
5. Store listing: the repo keeps no listing doc or fastlane metadata (docs/ops/TRIAL-FIRST-GO-LIVE.md D), so the
   approved listing words are only recorded in docs/product/AI-VISIBILITY-WORDS.md. Consoles untouched.
6. "About AI in Flourish": FlourishMark in place of the robot; the onboarding bank step's emoji icons become line
   icons in the app's colours. No word changes.
