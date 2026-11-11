# Store privacy answers for 1.1.6 (draft, 2026-11-10)

For iOS 1.1.6 (526911) and Android 1.1.6 (versionCode 27), built from release-1.1.6 517a2d4. That build's code is main 00ed1f0, which is 126fd82 plus the version bump and the approved What's New (no data change).

Nothing in either store has been changed. "Now" is what was read on 2026-11-10:
- App Store Connect > App Privacy (published Oct 16);
- the Data safety section of Play's public listing, which shows the published Play Console answers.

**Tracking stays No on both stores.** The 526911 bundle has no ad or analytics SDK, the website's Plausible, Clarity and Meta tags are compiled out, there is no tracking-permission string, and the vc27 manifest has no AD_ID permission. No data goes to another company for ads.

**Sharing (Play) stays No.** Plaid, Anthropic, Sentry, RevenueCat, Resend, Supabase and Netlify process data for us as service providers. The bank connection is started by the user.

**Plaid Link (checked 2026-11-10).**

How it runs:
- Neither build has Plaid's native SDK. There is no LinkKit framework in 526911 and nothing from Plaid in the vc27 AAB.
- Link is Plaid's web script, `https://cdn.plaid.com/link/v2/stable/link-initialize.js` (src/App.jsx:1019), loaded into the app's own web view and opened with `Plaid.create`.
- So no Plaid privacy manifest ships in 526911. The app's only privacy manifests are RevenueCat's (Purchase History) and Capacitor's (none).

What Plaid's docs say:
- The Link pages (web, webview, iOS, Android) give no guidance on Apple's privacy labels, privacy manifests or Play's Data safety form.
- The webview page says presenting Link in a web view is deprecated.

What Plaid's End User Privacy Policy (effective Dec 8, 2025) says it collects from the device:
- IP address;
- timezone setting and location, and device location;
- hardware model and operating system;
- browser data, network data and other technical data;
- the features used.

What Plaid uses that data for:
- providing the service, including recognising the device on return visits;
- fraud prevention and identity checks;
- developing its own services.

It doesn't say the data is used for advertising.

Rows added because of this:
- Apple: Device ID (linked, App Functionality).
- Play: Device or other IDs, and the fraud purpose on Diagnostics.

Not added:
- **Tracking** stays No. Plaid states no advertising use, and it is not a data broker.
- **Device location:** the app has no location permission on either platform, so the web view can't read it.
- **Location inferred from the IP address** is under Still open.

## App Store Connect: App Privacy

In the form's order. Every type is collected, and "linked" means linked to the user's identity. Tracking is No on every line.

| # | Data type | Linked | Purposes | Mark | What it covers in 1.1.6 |
|---|---|---|---|---|---|
| 1 | Contact Info > Name | Yes | App Functionality | same as now | Your name, your partner's name, and your children's names and age ranges (Kids zone). All are synced to your account. |
| 2 | Contact Info > Email Address | Yes | App Functionality, **Developer's Advertising or Marketing** | **change** (add Developer's Advertising or Marketing) | Your sign-in email, the partner invite email, and the weekly newsletter email (Settings). |
| 3 | Financial Info > Credit Info | Yes | App Functionality | **add** | The credit score you can enter in your profile (optional). |
| 4 | Financial Info > Other Financial Info | Yes | App Functionality | same as now | Bank balances and transactions through Plaid, statement imports, balances you enter, bills, goals and the registered-account room you enter. |
| 5 | User Content > Customer Support | Yes | App Functionality, **Analytics** | **change** (add Analytics) | "Send feedback" and the day-7 check-in question. Both are used to improve the app. |
| 6 | User Content > Other User Content | Yes | App Functionality, **Analytics** | **change** (add Analytics) | <ul><li>Coach messages, and the statement and document text sent for parsing. Both go to Anthropic through our server, with names turned into roles, and are not stored by us. The transactions parsed from a statement are under Other Financial Info.</li><li>What the money meeting decided (meeting_records).</li><li>Tester answers.</li></ul> |
| 7 | Identifiers > User ID | Yes | App Functionality, **Analytics** | **change** (add Analytics) | Your account id. The usage counters and funnel milestones are kept by account id. |
| 8 | Identifiers > Device ID | Yes | App Functionality | **add** | Plaid Link's device data, used to recognise the device and prevent fraud (Plaid's End User Privacy Policy). Linked, because the bank connection belongs to the account. Tracking No. |
| 9 | Purchases > Purchase History | Yes | App Functionality, Analytics | **add** | In-app subscriptions through RevenueCat (Purchases.logIn uses your account id; RevenueCat's own privacy manifest declares Purchase History), plus the paid, cancelled and refunded milestones. |
| 10 | Usage Data > Product Interaction | **Yes** (now: not linked) | Analytics, **App Functionality** | **change** (linked Yes, add App Functionality) | <ul><li>account_attribution: every signup, with platform and activation time.</li><li>account_milestones and account_days (0042).</li><li>The coach and AI usage counts per account, which also enforce the limits.</li></ul> |
| 11 | Diagnostics > Crash Data | **Yes** (now: not linked) | App Functionality | **change** (linked Yes) | Sentry errors. See the note below the table. |
| 12 | Diagnostics > Other Diagnostic Data | **Yes** (now: not linked) | App Functionality | **change** (linked Yes) | Sentry's device, OS and browser context, and breadcrumbs. Also Plaid Link's hardware, OS, browser and network data, used for fraud prevention, which Apple counts as App Functionality. |
| 13 | Other Data > Other Data Types | Yes | App Functionality, Analytics | **add** | <ul><li>Birth year, life stages and homeowner, from your profile (App Functionality).</li><li>A tester code and the date it was entered (App Functionality and Analytics).</li></ul> |

Not collected on iPhone (leave unticked):
- phone number, physical address;
- health, location, sensitive info, contacts;
- emails or texts, photos or videos, audio, gameplay;
- browsing or search history;
- advertising data, other usage data, performance data;
- surroundings, body.

The iPhone app reads no campaign or attribution value: an iPhone account's account_attribution row is always "direct".

**Why crash data is linked.** Nothing calls Sentry's setUser, and sendDefaultPii is false. But console.error lines become Sentry breadcrumbs, and some of them print an id:
- src/lib/persistence.js:191 prints the account id;
- src/App.jsx:19247, 19269 and 19652 print Plaid item ids, which our database ties to an account.

console.log is stripped from builds, but console.error is not. 1.1.6 must say linked. A later build could drop those ids and go back to "not linked".

Summary for Apple: **4 add, 7 change, 2 same as now.**

## Play Console: Data safety

In the form's order. No type is shared. "Ephemeral" stays as it is now on every type that is already declared.

| # | Section > Data type | Collected | Shared | Required or optional | Purposes | Mark |
|---|---|---|---|---|---|---|
| 1 | Personal info > Name | Yes | No | Optional | App functionality, Personalization | same as now (now also covers your partner's and children's names) |
| 2 | Personal info > Email address | Yes | No | Required | App functionality, Account management, **Advertising or marketing**, **Developer communications**, **Fraud prevention, security, and compliance** | **change** (add Fraud prevention, security, and compliance, because sign-ups and newsletter sign-ups are rate-limited by the email, kept hashed; add Advertising or marketing for the newsletter, and Developer communications for the trial and account emails; also covers the partner invite email) |
| 3 | Personal info > User IDs | Yes | No | Required | App functionality, Account management, **Analytics** | **change** (add Analytics) |
| 4 | Personal info > Other info | Yes | No | Optional | App functionality, **Analytics** | **change** (add Analytics; birth year, life stages, tester code) |
| 5 | Financial info > Purchase history | Yes | No | Optional | App functionality, **Analytics** | **change** (add Analytics) |
| 6 | Financial info > Credit score | Yes | No | Optional | App functionality | **add** |
| 7 | Financial info > Other financial info | Yes | No | Required | App functionality | same as now |
| 8 | Messages > Other in-app messages | Yes | No | Optional | App functionality | **change**: **Processed ephemerally: No**, the same as Files and docs. Coach messages go through our server to Anthropic, which keeps API data for a limited time. The published listing doesn't show the current answer; if the Console already says No, this row is the same as now. |
| 9 | Files and docs > Files and docs | Yes | No | Optional | App functionality | **add**. The statement text (at most 7,000 characters, emails, household names and full account numbers removed) is sent through our server to Anthropic for parsing. The file never leaves the phone, and neither we nor our server keep the text. **Processed ephemerally: No**, because Anthropic, as our service provider, keeps API data for a limited time; Play's "ephemeral" means held only in memory for the request. |
| 10 | App activity > App interactions | Yes | No | Required | Analytics, **App functionality** | **change** (add App functionality: the coach and AI limits use the counts) |
| 11 | App activity > Other user-generated content | Yes | No | Optional | App functionality, **Analytics** | **change** (add Analytics; feedback, tester answers, meeting decisions) |
| 12 | App activity > Other actions | Yes | No | Required | Analytics, Advertising or marketing | **add** (the Google Play Install Referrer campaign code, kept on the account) |
| 13 | App info and performance > Crash logs | Yes | No | Required | App functionality, Analytics | same as now |
| 14 | App info and performance > Diagnostics | Yes | No | Required | App functionality, Analytics, **Fraud prevention, security, and compliance** | **change** (add Fraud prevention, security, and compliance, for Plaid Link's device data) |
| 15 | Device or other IDs > Device or other IDs | Yes | No | Optional | App functionality, Fraud prevention, security, and compliance | **add**. Plaid Link's device data, collected only when someone connects a bank. Not ephemeral. Not shared: the person starts the bank connection, the app's consent screen names Plaid first, and Plaid states no advertising use. |

Security practices, same as now:
- data is encrypted in transit: Yes;
- users can ask for their data to be deleted: Yes.

Account deletion removes everything listed above:
- account_attribution, account_milestones, account_days, the tester code and tester answers all go with the account (on delete cascade);
- the newsletter is separate by design and ends with its own unsubscribe.

Not collected on Android (leave unticked):
- location; address, phone, race, beliefs, orientation; user payment info;
- health, fitness; emails, SMS; photos, videos, audio;
- calendar, contacts; in-app search history, installed apps; web browsing;
- other app performance data.

Summary for Play: **4 add, 8 change, 3 same as now.** If the Console already says "not ephemeral" on Other in-app messages, it is 7 change and 4 same.

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

## Decisions (Amanda, 2026-11-10)

1. **Location stays off on both stores.** Province and country are typed in or come from the device's region setting, never from location services.
2. **Statement and document text.**
   - Play: Files and docs is added (above). It is not shared, because Anthropic is our service provider. It is marked "not ephemeral", for the reason in the row.
   - Apple: the text stays under Other User Content.
   - Parsed transactions stay under the financial info types.
3. **Play Email address** gets Developer communications, for the trial and account emails.
4. **Tester codes stay declared** (optional), because a server row can switch them on without a new build.
   - **Creator codes must be declared on both stores before they are switched on.** That means the creator code on the account, and what it is used for (Analytics, and Advertising or marketing on Play). Today the flag is unset and 0035 is not run.
5. **Play Console has no unpublished Data safety draft.** Read-only on 2026-11-10, the Publishing overview showed nothing waiting to be sent for review and nothing ready to publish (last published Nov 7). The published listing is therefore the "now" above.

## Still open

- **Location Plaid may infer from the IP address.** Plaid's policy says it "may infer your geolocation" from data it collects, which includes the IP address. Play counts location inferred from an IP address as Approximate location, and Apple counts it as Coarse Location. Your decision kept Location off, but that decision was about province and country. Decide whether Plaid's inference changes it.
- **Plaid deprecates Link in a web view.** If Link moves to Hosted Link (PR #76) or to the native SDK, check these rows again. The native SDK ships its own privacy manifest.
- **Ephemeral on Files and docs and Other in-app messages.** If Anthropic keeps no API data for our account (zero data retention), this can be "Yes". I have not seen that confirmed.
- **Apple's subscription display names were not read.** I couldn't open the groups ("Flourish" with 2 subscriptions, "Flourish Founding" with 1). Apple shows those names on the purchase sheet, so check that none says "Flourish Plus" before submitting.
- **Some text the reviewer can read still says "Flourish Plus" or "free plan".** The in-app Terms (section 7) in 526911, and the store listing's FLOURISH PLUS section, are items 1–4 in docs/ops/PLUS-AND-FREE-PLAN-CLEANUP.md. The review notes below no longer say it.

## Apple review notes for 1.1.6 (draft, not entered in App Store Connect)

These match build 526911 with today's production flags: TRIAL_PLAN_FIRST and PLUS_ENABLED off, and the free plan still in place.
- Paragraphs 1 to 3 and the 3.1.3(b) paragraph are unchanged from the 1.1.6 notes in ASC.
- The subscription paragraph drops "Flourish Plus" and says what the free plan keeps.
- The 1.1.3 paragraph becomes a household paragraph.
- A 1.1.6 paragraph is added.

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
Review flourish 1.1.6 store privacy answers (iOS 526911, Android 27; Canadian budgeting app). Reply AGREE or exact fixes, with a score out of 100.

Collected, linked to the account:
- names (yours, partner's, children's, plus children's age ranges)
- emails (sign-in, partner invite, optional newsletter)
- entered credit score; bank data via Plaid; statements, balances, bills, goals
- birth year, life stages; tester code and answers; feedback; meeting decisions
- coach messages and redacted statement text, sent via our server to Anthropic (our provider), not stored by us
- in-app purchases (RevenueCat); usage counters keyed by account
- Sentry crash and diagnostic data (breadcrumbs can carry the account id)
- Plaid Link (Plaid's web script in our web view): device, browser and network data, for device recognition and fraud prevention
- Android only: the Play Install Referrer campaign code

No ad SDKs, advertising ID, location permission or data sales.

Apple (all linked, tracking No):
- Name, Credit Info, Other Financial Info, Device ID, Crash Data, Other Diagnostic Data: App Functionality
- Email Address: App Functionality; Developer's Advertising or Marketing
- Customer Support, Other User Content, User ID, Purchase History, Product Interaction, Other Data Types: App Functionality; Analytics

Play (nothing shared; encrypted in transit; deletion available):
- Name (optional): App functionality; Personalization
- Email address: App functionality; Account management; Advertising or marketing; Developer communications; Fraud prevention
- User IDs: App functionality; Account management; Analytics
- Other info, Purchase history, Other user-generated content (optional): App functionality; Analytics
- Credit score, Other in-app messages, Files and docs (optional; last two not ephemeral): App functionality
- Other financial info: App functionality
- App interactions, Crash logs: App functionality; Analytics
- Diagnostics: App functionality; Analytics; Fraud prevention
- Device or other IDs (optional): App functionality; Fraud prevention
- Other actions: Analytics; Advertising or marketing
```
