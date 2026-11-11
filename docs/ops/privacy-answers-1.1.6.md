# Store privacy answers for 1.1.6 (draft, 2026-11-10)

For iOS 1.1.6 (526911) and Android 1.1.6 (versionCode 27), built from release-1.1.6 517a2d4. That build's code is main 00ed1f0, which is 126fd82 plus the version bump and the approved What's New (no data change).

Nothing in either store has been changed. "Now" is what was read on 2026-11-10:
- App Store Connect > App Privacy (published Oct 16);
- the Data safety section of Play's public listing, which shows the published Play Console answers.

**Tracking stays No on both stores.** The 526911 bundle has no ad or analytics SDK, the website's Plausible, Clarity and Meta tags are compiled out, there is no tracking-permission string, and the vc27 manifest has no AD_ID permission. No data goes to another company for ads.

**Sharing (Play) stays No.** Plaid, Anthropic, Sentry, RevenueCat, Resend, Supabase and Netlify process data for us as service providers. The bank connection is started by the user.

## App Store Connect: App Privacy

In the form's order. Every type is collected, and "linked" means linked to the user's identity. Tracking is No on every line.

| # | Data type | Linked | Purposes | Mark | What it covers in 1.1.6 |
|---|---|---|---|---|---|
| 1 | Contact Info > Name | Yes | App Functionality | same as now | Your name, your partner's name, and your children's names and age ranges (Kids zone). All are synced to your account. |
| 2 | Contact Info > Email Address | Yes | App Functionality, **Developer's Advertising or Marketing** | **change** (add Developer's Advertising or Marketing) | Your sign-in email, the partner invite email, and the weekly newsletter email (Settings). |
| 3 | Financial Info > Credit Info | Yes | App Functionality | **add** | The credit score you can enter in your profile (optional). |
| 4 | Financial Info > Other Financial Info | Yes | App Functionality | same as now | Bank balances and transactions through Plaid, statement imports, balances you enter, bills, goals and the registered-account room you enter. |
| 5 | User Content > Customer Support | Yes | App Functionality, **Analytics** | **change** (add Analytics) | "Send feedback" and the day-7 check-in question. Both are used to improve the app. |
| 6 | User Content > Other User Content | Yes | App Functionality, **Analytics** | **change** (add Analytics) | <ul><li>Coach messages, and the document text sent for parsing. Both go to Anthropic through our server, with names turned into roles, and are not stored by us.</li><li>What the money meeting decided (meeting_records).</li><li>Tester answers.</li></ul> |
| 7 | Identifiers > User ID | Yes | App Functionality, **Analytics** | **change** (add Analytics) | Your account id. The usage counters and funnel milestones are kept by account id. |
| 8 | Purchases > Purchase History | Yes | App Functionality, Analytics | **add** | In-app subscriptions through RevenueCat (Purchases.logIn uses your account id; RevenueCat's own privacy manifest declares Purchase History), plus the paid, cancelled and refunded milestones. |
| 9 | Usage Data > Product Interaction | **Yes** (now: not linked) | Analytics, **App Functionality** | **change** (linked Yes, add App Functionality) | <ul><li>account_attribution: every signup, with platform and activation time.</li><li>account_milestones and account_days (0042).</li><li>The coach and AI usage counts per account, which also enforce the limits.</li></ul> |
| 10 | Diagnostics > Crash Data | **Yes** (now: not linked) | App Functionality | **change** (linked Yes) | Sentry errors. See the note below the table. |
| 11 | Diagnostics > Other Diagnostic Data | **Yes** (now: not linked) | App Functionality | **change** (linked Yes) | Sentry's device, OS and browser context, and breadcrumbs. |
| 12 | Other Data > Other Data Types | Yes | App Functionality, Analytics | **add** | <ul><li>Birth year, life stages and homeowner, from your profile (App Functionality).</li><li>A tester code and the date it was entered (App Functionality and Analytics).</li></ul> |

Not collected on iPhone (leave unticked):
- phone number, physical address;
- health, location, sensitive info, contacts;
- emails or texts, photos or videos, audio, gameplay;
- browsing or search history, device ID;
- advertising data, other usage data, performance data;
- surroundings, body.

The iPhone app reads no campaign or attribution value: an iPhone account's account_attribution row is always "direct".

**Why crash data is linked.** Nothing calls Sentry's setUser, and sendDefaultPii is false. But console.error lines become Sentry breadcrumbs, and some of them print an id:
- src/lib/persistence.js:191 prints the account id;
- src/App.jsx:19247, 19269 and 19652 print Plaid item ids, which our database ties to an account.

console.log is stripped from builds, but console.error is not. 1.1.6 must say linked. A later build could drop those ids and go back to "not linked".

Summary for Apple: **3 add, 7 change, 2 same as now.**

## Play Console: Data safety

In the form's order. No type is shared. "Ephemeral" stays as it is now on every type.

| # | Section > Data type | Collected | Shared | Required or optional | Purposes | Mark |
|---|---|---|---|---|---|---|
| 1 | Personal info > Name | Yes | No | Optional | App functionality, Personalization | same as now (now also covers your partner's and children's names) |
| 2 | Personal info > Email address | Yes | No | Required | App functionality, Account management, **Advertising or marketing** | **change** (add Advertising or marketing, for the newsletter; also covers the partner invite email) |
| 3 | Personal info > User IDs | Yes | No | Required | App functionality, Account management, **Analytics** | **change** (add Analytics) |
| 4 | Personal info > Other info | Yes | No | Optional | App functionality, **Analytics** | **change** (add Analytics; birth year, life stages, tester code) |
| 5 | Financial info > Purchase history | Yes | No | Optional | App functionality, **Analytics** | **change** (add Analytics) |
| 6 | Financial info > Credit score | Yes | No | Optional | App functionality | **add** |
| 7 | Financial info > Other financial info | Yes | No | Required | App functionality | same as now |
| 8 | Messages > Other in-app messages | Yes | No | Optional | App functionality | same as now (coach messages) |
| 9 | App activity > App interactions | Yes | No | Required | Analytics, **App functionality** | **change** (add App functionality: the coach and AI limits use the counts) |
| 10 | App activity > Other user-generated content | Yes | No | Optional | App functionality, **Analytics** | **change** (add Analytics; feedback, tester answers, meeting decisions) |
| 11 | App activity > Other actions | Yes | No | Required | Analytics, Advertising or marketing | **add** (the Google Play Install Referrer campaign code, kept on the account) |
| 12 | App info and performance > Crash logs | Yes | No | Required | App functionality, Analytics | same as now |
| 13 | App info and performance > Diagnostics | Yes | No | Required | App functionality, Analytics | same as now |

Security practices, same as now:
- data is encrypted in transit: Yes;
- users can ask for their data to be deleted: Yes.

Account deletion removes everything listed above:
- account_attribution, account_milestones, account_days, the tester code and tester answers all go with the account (on delete cascade);
- the newsletter is separate by design and ends with its own unsubscribe.

Not collected on Android (leave unticked):
- location; address, phone, race, beliefs, orientation; user payment info;
- health, fitness; emails, SMS; photos, videos, audio; files and docs;
- calendar, contacts; in-app search history, installed apps; web browsing;
- other app performance data; device or other IDs.

Summary for Play: **2 add, 6 change, 5 same as now.**

## The Nov 8 list, checked

| Item | Finding |
|---|---|
| Crash data (Sentry) linked to the account | **Confirmed**, but through error breadcrumbs, not setUser (see above). |
| Usage data linked through account_attribution and 0042/0043 | **Confirmed.** Every signup gets a row (src "direct" on the web and iPhone), and 0042's tables are keyed by account. 0043 is counts only. |
| The PostHog line | **Confirmed false.** PostHog isn't in the app. Apple's Product Interaction "not linked" came from that plan and must change. |
| The activation "aggregate" also writing a linked time | **Confirmed.** /api/activation calls markActivated, which writes account_attribution.activated_at, and the milestones and days. activation_daily and onboarding_counts themselves hold no id. |
| Feedback purposes should include Analytics | **Confirmed.** |
| The review note mentions camera or photos | **Ruled out for 1.1.6.** The 1.1.6 review notes in ASC don't mention either. The line is only in the old draft in docs/ops/LEGAL-PACKET.md. |
| Names | Already declared on both stores. They now also cover your partner's and children's names. |
| Purchases | Missing on Apple (add). Already on Play. |
| Coach messages and statement text | Covered by Other User Content (Apple) and Other in-app messages (Play). |
| Partner invite email | Covered by Email Address. |
| Account-keyed usage counters | Confirmed: coach usage, AI usage per day, account_days, account_milestones. |
| Newsletter email | Apple Email Address and Play Email address: add the marketing purpose. |
| Install Referrer code | Android only: Play Other actions (add). |
| Tester code and tester answers | Apple Other Data Types and Other User Content. Play Other info and Other user-generated content. |

## Unsure

1. **Province and country.** These are entered or taken from the device's region setting, never from location services. I left Location unticked on both stores.
2. **Document text for parsing.** It is sent to Anthropic through our server and isn't kept by us, but Anthropic may hold API data for a limited time. I put it under Other User Content (Apple) and in-app messages (Play). If you'd rather, it could be Play's "Files and docs" instead.
3. **Developer communications (Play) on Email address.** Account emails such as policy notices and founding emails could count. Not added.
4. **Tester codes are off.** The tester code and answers are still declared (optional), because a server row can switch them on without a new build.
5. **Creator codes are not declared.** The flag is unset and 0035 isn't run. Declare them before switching them on.
6. **The published Play listing.** If Play Console holds unpublished Data safety edits, compare them with this list first.
7. **Outside this brief, the 1.1.6 review notes in ASC** still say "Flourish Plus is an auto-renewing subscription" and "There is no free trial or introductory offer on the subscriptions". Check them before submitting.
