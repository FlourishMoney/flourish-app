# Store privacy answers for 1.1.6 (draft, 2026-11-10)

For iOS 1.1.6 (526911) and Android 1.1.6 (versionCode 27), built from release-1.1.6 517a2d4. That build's code is main 00ed1f0, which is 126fd82 plus the version bump and the approved What's New (no data change).

Nothing in either store has been changed. "Now" is what was read on 2026-11-10:
- App Store Connect > App Privacy (published Oct 16);
- the Data safety section of Play's public listing, which shows the published Play Console answers. Play Console has no unpublished draft.

**Tracking stays No on both stores.**
- The 526911 bundle has no ad or analytics SDK.
- The website's Plausible, Clarity and Meta tags are compiled out of it.
- There is no tracking-permission string, and the vc27 manifest has no AD_ID permission.
- Plaid uses device data for fraud prevention and its own services, with no advertising use stated. Fraud prevention is not tracking under Apple's definition.

**Sharing on Play.** Anthropic, Sentry and RevenueCat each call themselves our processor in their own terms (see Evidence 1). Supabase, Netlify and Resend are our hosting and email providers. None of these counts as sharing.
- **Plaid's device data is shared.** Plaid's policy makes Plaid the controller of the device data it collects and uses it for its own purposes. So Device or other IDs and Approximate location are marked Shared: Yes on Play.
- **Bank data stays not shared.** The person starts the bank connection after our consent screen names Plaid ("Flourish connects through Plaid", src/App.jsx:15038), and Play's user-initiated exception covers it.

## App Store Connect: App Privacy

In the form's order. Every type is collected, and "linked" means linked to the user's identity. Tracking is No on every line.

| # | Data type | Linked | Purposes | Mark | What it covers in 1.1.6 |
|---|---|---|---|---|---|
| 1 | Contact Info > Name | Yes | App Functionality | same as now | Your name, your partner's name, and your children's names and age ranges (Kids zone). All optional and synced to your account. |
| 2 | Contact Info > Email Address | Yes | App Functionality, **Developer's Advertising or Marketing** | **change** (add Developer's Advertising or Marketing) | Your sign-in email, the partner invite email, and the weekly newsletter email (Settings). |
| 3 | Financial Info > Credit Info | Yes | App Functionality | **add** | The credit score you can enter in your profile (optional). |
| 4 | Financial Info > Other Financial Info | Yes | App Functionality | same as now | Bank balances and transactions through Plaid, statement imports, balances you enter, bills, goals and the registered-account room you enter. |
| 5 | Location > Coarse Location | Yes | App Functionality | **add** | Plaid infers location from the IP address during Link, for fraud prevention ("we may derive location from IP address", Plaid's End User Privacy Policy). The app itself reads no location. Added so the two stores match. |
| 6 | User Content > Customer Support | Yes | App Functionality, **Analytics** | **change** (add Analytics) | "Send feedback" and the day-7 check-in question (Evidence 5). |
| 7 | User Content > Other User Content | Yes | App Functionality, **Analytics** | **change** (add Analytics) | <ul><li>Coach messages, and statement text sent for parsing. Both go to Anthropic through our server, with names turned into roles, and are not stored by us. Parsed transactions are under Other Financial Info.</li><li>What the money meeting decided.</li><li>Tester answers.</li></ul> |
| 8 | Identifiers > User ID | Yes | App Functionality, **Analytics** | **change** (add Analytics) | Your account id, which keys the usage counters and funnel milestones. |
| 9 | Purchases > Purchase History | Yes | App Functionality, Analytics | **add** | In-app subscriptions through RevenueCat (Purchases.logIn uses your account id; RevenueCat's own privacy manifest in 526911 declares Purchase History), plus the paid, cancelled and refunded milestones. |
| 10 | Usage Data > Product Interaction | **Yes** (now: not linked) | Analytics, **App Functionality** | **change** (linked Yes, add App Functionality) | <ul><li>account_attribution, account_milestones and account_days.</li><li>The coach and AI usage counts per account, which also enforce the limits.</li></ul> |
| 11 | Diagnostics > Crash Data | **Yes** (now: not linked) | App Functionality | **change** (linked Yes) | Sentry errors. See the note below the table. |
| 12 | Diagnostics > Other Diagnostic Data | **Yes** (now: not linked) | App Functionality | **change** (linked Yes) | Sentry's device, OS and browser context, and breadcrumbs. |
| 13 | Other Data > Other Data Types | Yes | App Functionality | **add** | Birth year, life stages and homeowner from your profile, and a tester code and the date it was entered. No Analytics: no code measures the tester code (Evidence 5). |

**Device ID is not declared.** Plaid's End User Privacy Policy names no device identifier. It lists IP address, hardware model and OS, browser data, network data and other technical data, but never a "device identifier", "device ID", "unique identifier" or advertising ID. Apple's Device ID means an advertising identifier or another device-level ID. The app itself reads neither IDFV nor IDFA.

Not collected on iPhone (leave unticked):
- phone number, physical address;
- health, precise location, sensitive info, contacts;
- emails or texts, photos or videos, audio, gameplay;
- browsing or search history, device ID;
- advertising data, other usage data, performance data;
- surroundings, body.

The iPhone app reads no campaign or attribution value: an iPhone account's account_attribution row is always "direct".

**Why crash data is linked.** Nothing calls Sentry's setUser, and sendDefaultPii is false (src/lib/errorReporting.js:133). But console.error lines become Sentry breadcrumbs, and some of them print an id:
- src/lib/persistence.js:191 prints the account id;
- src/App.jsx:19247, 19269 and 19652 print Plaid item ids, which our database ties to an account.

console.log is stripped from builds (vite.config.js:46), but console.error is not. 1.1.6 must say linked. A later build could drop those ids and go back to "not linked".

Summary for Apple: **4 add, 7 change, 2 same as now.**

## Play Console: Data safety

In the form's order. "Ephemeral" stays as it is now on every type already declared, except where a row says otherwise.

| # | Section > Data type | Collected | Shared | Required or optional | Purposes | Mark |
|---|---|---|---|---|---|---|
| 1 | Location > Approximate location | Yes | **Yes** | Optional (only when connecting a bank) | Collected and shared for Fraud prevention, security, and compliance | **add**. Plaid derives location from the IP address during Link. Google: location "inferred, such as via IP address ... must be disclosed here". Not ephemeral. |
| 2 | Personal info > Name | Yes | No | Optional | App functionality, Personalization | same as now (now also covers your partner's and children's names) |
| 3 | Personal info > Email address | Yes | No | Required | App functionality, Account management, **Advertising or marketing**, **Developer communications**, **Fraud prevention, security, and compliance** | **change**. Added: the newsletter (Advertising or marketing), the trial and account emails (Developer communications), and sign-up rate limits keyed by the hashed email (Fraud prevention). Also covers the partner invite email. |
| 4 | Personal info > User IDs | Yes | No | Required | App functionality, Account management, **Analytics** | **change** (add Analytics) |
| 5 | Personal info > Other info | Yes | No | Optional | App functionality | same as now (now covers birth year, life stages and tester code; no Analytics, Evidence 5) |
| 6 | Financial info > Purchase history | Yes | No | Optional | App functionality, **Analytics** | **change** (add Analytics) |
| 7 | Financial info > Credit score | Yes | No | Optional | App functionality | **add** |
| 8 | Financial info > Other financial info | Yes | No | Required | App functionality | same as now |
| 9 | Messages > Other in-app messages | Yes | No | Optional | App functionality | **change**: Processed ephemerally: **No**. Coach messages go to Anthropic, which deletes API inputs and outputs within 30 days. If the Console already says No, this row is the same as now. |
| 10 | Files and docs > Files and docs | Yes | No | Optional | App functionality | **add**. The statement's text content is sent for parsing (Evidence 3). Processed ephemerally: **No**, for the same 30-day reason. |
| 11 | App activity > App interactions | Yes | No | Required | Analytics, **App functionality** | **change** (add App functionality: the coach and AI limits use the counts) |
| 12 | App activity > Other user-generated content | Yes | No | Optional | App functionality, **Analytics** | **change** (add Analytics; feedback, tester answers, meeting decisions) |
| 13 | App activity > Other actions | Yes | No | Required | Analytics, Advertising or marketing | **add** (the Google Play Install Referrer campaign code, kept on the account; Evidence 4) |
| 14 | App info and performance > Crash logs | Yes | No | Required | App functionality, Analytics | same as now |
| 15 | App info and performance > Diagnostics | Yes | No | Required | App functionality, Analytics | same as now |
| 16 | Device or other IDs > Device or other IDs | Yes | **Yes** | Optional (only when connecting a bank) | Collected and shared for Fraud prevention, security, and compliance | **add**. Plaid's device and browser data, which Plaid uses "to remember you or your device when you return". Google's definition: "Identifiers that relate to an individual device, browser or app." Not ephemeral. |

The store listing will no longer say "No data shared with third parties": rows 1 and 16 are shared with Plaid.

Security practices, same as now:
- data is encrypted in transit: Yes (Evidence 6);
- users can ask for their data to be deleted: Yes (Evidence 6).

Not collected on Android (leave unticked):
- precise location; address, phone, race, beliefs, orientation; user payment info;
- health, fitness; emails, SMS; photos, videos, audio;
- calendar, contacts; in-app search history, installed apps; web browsing;
- other app performance data.

Summary for Play: **5 add, 6 change, 5 same as now.** If the Console already says "not ephemeral" on Other in-app messages, it is 5 change and 6 same.

## Evidence (for the 2026-11-10 review)

**1. Service providers.**
- Anthropic's DPA, B.1: "Customer is the controller and Anthropic is Customer's processor" (https://www.anthropic.com/legal/data-processing-addendum). API retention: inputs and outputs are deleted "within 30 days of receipt or generation" (https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data).
- Sentry's DPA, 2.1.2: "Sentry is a Processor of Personal Data and Customer is the Controller" (https://sentry.io/legal/dpa/).
- RevenueCat's DPA: "RevenueCat is its Data Processor in relation to Customer Personal Data" (https://www.revenuecat.com/dpa/). Its App Privacy page lists Purchase History, and User ID when a custom app user id is used (https://www.revenuecat.com/docs/platform-resources/apple-platform-resources/apple-app-privacy).
- Plaid is not a processor for this data: "Plaid is the controller of the personal data collected", except for Identity Verification, which we don't use (https://plaid.com/legal/#end-user-privacy-policy).

**2. Optional on Play.** Each item can be skipped and the app still works:
- **Name:** onboarding starts with an empty name (src/App.jsx:4243). It is entered only in Settings (src/App.jsx:12164), and the partner's name likewise (src/App.jsx:12394).
- **Credit score:** the 680 in the profile is a placeholder with creditKnown false. The app shows a score only when the household entered one (creditScoreEntered, src/App.jsx:6788).
- **Coach:** it has an on/off switch (src/App.jsx:12661) and an AI notice before first use.
- **Statement import:** one of three ways to add money data. The others are a bank connection and typing numbers by hand.
- **Bank connection:** it opens only from the consent screen (src/App.jsx:4278, 4613). Plaid's device data and location are collected only then.
- **Purchases:** the app runs on the 14-day trial and then the free plan.
- **Other info:** birth year starts empty. Life stages has a default that the person can change.

Required: email address, user IDs, app interactions, crash logs, diagnostics and other financial info, as now; and the Install Referrer code, which is read automatically on Android.

**3. Statement import.**
- The file is picked on the phone (`accept=".pdf,.csv"`, src/App.jsx:4635).
- A CSV is parsed on the phone and never sent anywhere (parseCSVStatement, src/App.jsx:3774 and 4451).
- A PDF is read on the phone with pdf.js (src/App.jsx:3818). Up to 7,000 characters of its text are redacted and sent to /api/coach, type "document", and on to Anthropic (src/App.jsx:3866–3886).

The file itself never leaves the phone, but its content does. Play's "Files and docs" covers the content of files, so it stays declared.

**4. Install Referrer.** Google's Data safety help names no category for install referrer or campaign data. "Other actions" is "Any other user activity or actions in-app not listed here" (https://support.google.com/googleplay/android-developer/answer/10787469). It stays there: the code records the link the person followed to install, and it is not a device ID, a location or anything else the form lists.

**5. Analytics, type by type.**
- User ID / User IDs: account_milestones and account_days are keyed by account id (netlify/functions/_lib/funnel.js:46, 70), as is account_attribution (netlify/functions/_lib/attribution.js:71).
- Product Interaction / App interactions: /api/activation records the milestones and active days (netlify/functions/activation.js:133–148).
- Purchase History / Purchase history: the paid, cancelled and refunded milestones come from the store and Stripe webhooks (netlify/functions/revenuecat-webhook.js:98, netlify/functions/stripe-webhook.js:295).
- Other actions: the campaign code feeds funnel_by_source (migration 0043).
- Crash logs and Diagnostics: Sentry starts with its default integrations (src/lib/errorReporting.js:123), which report errors and release health per build.
- Customer Support, Other User Content and Other user-generated content:
  - The day-7 question asks how the app helped (src/lib/feedback.js:17).
  - Tester answers are saved per question (netlify/functions/tester.js:40).
  - Both are read to judge and improve the app, which is Apple's and Google's meaning of Analytics. A person reads them; no code counts them.
- **Removed:** Analytics on Apple Other Data Types and Play Other info. No funnel table, migration or report uses the tester code: a search of 0042, 0043, MEASUREMENT.md and _lib/funnel.js finds none.

**6. Encryption in transit and deletion.**
- Every flow uses HTTPS:
  - the app's API is `https://flourishmoney.app` (src/App.jsx:139);
  - Supabase is an `https://` host in the bundle;
  - Plaid's script is loaded over https (src/App.jsx:1019), and the server calls Plaid's https API (netlify/functions/plaid.js:23);
  - Anthropic is called at `https://api.anthropic.com` (netlify/functions/coach.js:33);
  - Sentry sends to an https ingest host;
  - RevenueCat's SDK uses HTTPS.
- The platforms allow nothing else:
  - iOS has no NSAllowsArbitraryLoads, so App Transport Security requires HTTPS.
  - Android targets SDK 36 with no usesCleartextTraffic or network security config, so cleartext is off.
  - The 526911 bundle's only http:// strings are XML namespaces and localhost.
- Delete account (netlify/functions/plaid.js:679–880):
  - removes every Plaid item at Plaid (/item/remove, line 821) and our plaid_items rows;
  - deletes meeting_records, subscriptions, feedback and plaid_account_owners (line 810), and user_data, coach_usage and profiles (line 842 on);
  - deletes the auth user (line 872), which cascades to every other per-account table: account_attribution, account_milestones, account_days, ai_usage_daily, tester_accounts, tester_answers, household membership, trial reminders and policy-notice records.
- What stays after deletion, by design:
  - billing_events keeps payment ids with the account id set to null, and no event payload (0010);
  - founding_seats keeps the seat's account id with no link to an account (0032, "a deleted account keeps its seat");
  - tester_free_months sets the account id to null (0039);
  - a partner's shared household data stays with that partner;
  - the newsletter is separate and ends with its own unsubscribe;
  - Sentry and Anthropic delete on their own schedules (Anthropic within 30 days).
- Plaid's /item/remove is best effort: if Plaid is down, the account is still deleted and the item is logged.

## The Nov 8 list, checked

| Item | Finding |
|---|---|
| Crash data (Sentry) linked to the account | **Confirmed**, through error breadcrumbs, not setUser (see above). |
| Usage data linked through account_attribution and 0042/0043 | **Confirmed.** Every signup gets a row (src "direct" on the web and iPhone), and 0042's tables are keyed by account. 0043 is counts only. |
| The PostHog line | **Confirmed false.** PostHog isn't in the app. |
| The activation "aggregate" also writing a linked time | **Confirmed.** markActivated writes account_attribution.activated_at. |
| Feedback purposes should include Analytics | **Confirmed** (Evidence 5). |
| The review note mentions camera or photos | **Ruled out for 1.1.6.** The line is only in the old draft in docs/ops/LEGAL-PACKET.md. |
| Names, purchases, coach messages and statement text, partner invite email, account-keyed counters | Covered in the tables above. |
| Newsletter, Install Referrer, tester code and answers | Covered in the tables above. |

## Decisions (Amanda, 2026-11-10)

1. **Province and country** are typed in or come from the device's region, so they are not location. The only location declared is the one Plaid infers from the IP address.
2. **Statement text** is on Play as Files and docs, and under Other User Content on Apple. Parsed transactions are under financial info. Coach messages and statement text are not ephemeral.
3. **Play Email address** gets Developer communications.
4. **Tester codes stay declared.**
   - **Creator codes must be declared on both stores before they are switched on.** That means the creator code on the account, and what it is used for. Today the flag is unset and 0035 is not run.
5. **Plaid on Play:** Device or other IDs and Approximate location are Shared: Yes, for Fraud prevention, security, and compliance. Bank data is not shared.
6. **Apple Tracking stays No.** Device ID is dropped, because Plaid's policy names no device identifier.

## Still open

- **Apple Coarse Location was added for consistency.** Play declares the location Plaid infers from the IP address, and the same collection applies on iPhone. Remove it if you decide otherwise.
- **Plaid deprecates Link in a web view.** If Link moves to Hosted Link (PR #76) or to the native SDK, check these rows again.
- **Apple's subscription display names were not read.** Check that none says "Flourish Plus" before submitting.
- **Some text the reviewer can read still says "Flourish Plus" or "free plan".** That means the in-app Terms (section 7) in 526911 and the Play listing's FLOURISH PLUS section (docs/ops/PLUS-AND-FREE-PLAN-CLEANUP.md, items 1–4).

## Apple review notes for 1.1.6 (draft, not entered in App Store Connect)

These match build 526911 with today's production flags: TRIAL_PLAN_FIRST and PLUS_ENABLED off, and the free plan still in place.

```
Flourish is a budgeting and cash-flow forecasting app for Canadian households. It does not offer cash advances, loans, credit, wage access or any money movement. Bank connection is read-only through Plaid and is optional; statements can be imported or numbers entered by hand. The AI coach explains figures the app calculates, does not tell users what to do, and shows an AI notice before first use.

Review account: the sign-in details above are for an email-confirmed account that opens with a populated sample household (example data, not a real person), so no bank login is needed.

Account deletion: Settings > Delete account deletes the account and its data from our servers and revokes any bank connection. It works end to end on the review account; we recreate the account after review.

The flourish subscription is auto-renewing and sold through in-app purchase, monthly or annual. There is no free trial or introductory offer on the subscriptions. Every new account has every feature for its first 14 days, then the free plan, which keeps safe to spend, bills and paydays and the weekly agenda, with limits on the coach (weekly) and What-If (daily). A subscription adds Credit and the coach-run meeting and lifts those limits. The founding annual is offered until the first 50 households subscribe to it. While it is offered, the plans show Founding annual and Monthly; after that, Monthly and Annual.

To test a purchase: sign in with the review account. The plans screen ("Subscribe to flourish") may open by itself once, after the intro tips; it is also under Settings, then Subscription, then See plans (on the free plan the locked Credit screen also has See plans). The plans show the App Store's own prices. Tap Subscribe on any plan and confirm with your sandbox account. When the purchase is confirmed the plans screen closes and Settings reads "Your subscription is through the App Store." Restore purchases, Terms of Use (Apple's standard EULA) and the Privacy Policy are under the plans; Restore purchases is also in Settings. Sandbox purchases are accepted for the review account.

Household sharing: in Settings, then Household, the account holder can invite a partner by email. The partner signs in with their own account, and both see and edit the same household under one subscription. Testing it needs a second email address and is optional; everything else works on the review account alone.

New in 1.1.6: the weekly money meeting opens with a recap of what was decided last time and can ask about bill changes it finds in the accounts. Settings has an optional sign-up for a weekly email of Canadian money dates; it asks for consent, and the address is added only after it is confirmed from the email we send.

A subscription bought on our website also counts in the app (Guideline 3.1.3(b)); the same plans are sold in the app through in-app purchase. The app does not link to or mention any way of paying outside the App Store.
```

## Review block for ChatGPT and Grok

```
Review flourish 1.1.6 privacy answers (iOS 526911, Android 27). Reply AGREE or exact fixes, score /100.

Collected (linked): optional names (own, partner, children); emails (sign-in, partner invite, newsletter); optional credit score; Plaid bank data; statements, balances, bills, goals; birth year, life stages, tester code; tester answers, feedback, meeting decisions; coach messages and redacted PDF statement text via our server to Anthropic (processor, deletes within 30 days); RevenueCat purchases; account-keyed usage counters; Sentry crash and diagnostics (breadcrumbs carry ids); Plaid Link web script (Plaid is controller): device and browser data, IP-derived location, for fraud prevention; Android Install Referrer code. No ad SDKs or advertising ID; HTTPS only; deletion removes account tables and the Plaid item.

Apple (all linked, tracking No):
- App Functionality: Name, Credit Info, Other Financial Info, Coarse Location, Crash Data, Other Diagnostic Data, Other Data Types
- also Developer's Advertising or Marketing: Email Address
- also Analytics: Customer Support, Other User Content, User ID, Purchase History, Product Interaction

Play (* optional):
- Approximate location*, Device or other IDs* (shared with Plaid): Fraud prevention
- Name*: App functionality, Personalization
- Email: App functionality, Account management, Advertising or marketing, Developer communications, Fraud prevention
- User IDs, Purchase history*, Other user-generated content*: App functionality, Analytics
- Other info*, Credit score*, In-app messages*, Files and docs* (last two not ephemeral): App functionality
- Other financial info: App functionality
- App interactions, Crash logs, Diagnostics: App functionality, Analytics
- Other actions: Analytics, Advertising or marketing
```
