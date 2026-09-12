# Flourish Money: legal packet for the fixed-fee review (assembled September 10, 2026)

Send with the lawyer email in BEFORE-MONDAY.md section 7, together with TRADEMARK-KNOCKOUT.md. Sections 2 and 3 are the exact text now in the app (src/App.jsx, both dated April 28, 2026), converted from screen layout to plain text. Section 5 is a draft, not yet in the app.

## 1. What we are asking for, and the questions

Fixed-fee Review and Edit (tracked changes) of the privacy policy, the terms of service and the App Store review notes; a quote for filing FLOURISH MONEY in Canada, classes 9, 36 and 42.

Facts the reviewer needs: GrowSmart Inc., Ontario corporation. Users in Canada first, US eligibility kept in the Terms. Bank data through Plaid, read-only; credentials never touch our servers. Financial calculations run in the app's own code; the AI coach (Anthropic's Claude API) explains figures the app calculated and is blocked by server-side guards from stating any figure not present in the user's data. Coach conversations are not stored server-side. The AI notice screen is shown and accepted before the first coach use; a bank-connect consent modal is shown before Plaid Link; account deletion in Settings erases server data including bank items. Analytics (PostHog) is about to be added: counts, flags and durations only, no amounts, no merchant names. Billing: Stripe on the web (monthly 11.99, annual 99.99, founding annual 79.99 for the first 100, locked while continuously subscribed), Apple in-app purchase on iOS later; 14-day free trial without a card.

Questions:
0. Analytics consent: pseudonymous product analytics (PostHog, United States, counts and flags only, a Settings opt-out defaulting on, events from September 18): sufficient under PIPEDA, or is opt-in required?
1. Privacy policy section 3 (PIPEDA legal basis): is the wording sufficient, and should it be drafted now to the express-consent and automated-decision standard in Bill C-36 (second reading, House returns September 16)?
2. AI processing disclosure: Anthropic as processor; is the current section 5 wording enough, and does the Anthropic Usage Policy's financial-advice clause (disclosure that AI was involved plus review by a qualified professional) apply to a coach that only explains calculated figures and carries "Not investment, legal or tax advice" on every reply?
3. Analytics disclosure (PostHog, hosted in the United States, counts and flags only, a Settings opt-out defaulting on; one sentence ships in the policy on September 17 because events start September 18): is opt-out sufficient for pseudonymous product analytics under PIPEDA, or is opt-in required? Plus a written retention schedule (delete on request within 30 days; statement uploads not retained after import; coach conversations not stored server-side; Plaid items removed on disconnect or deletion).
4. Terms section 7: as of September 17 it says prices are plus applicable taxes and states the founding lock (decision 16, answered by the founder; the text in section 3 below is the pre-September 17 version, and the shipped sentences are quoted in section 6). Please review that wording together with Stripe and Apple billing (annual renewal notices, cancellation effective at period end, no partial-period refunds except where required by law) under Ontario's Consumer Protection Act rules for online subscriptions.
5. Founding price lock clause (section 4 of this packet): enforceability, and what happens on a lapse or a regular price change.
6. Terms section 3 "Not a Licensed Adviser": is it sufficient for an Ontario company offering budgeting, debt and savings projections and RRSP, TFSA and FHSA explanations to consumers, and should any wording reference securities or financial-planning title rules in Ontario?
7. Terms section 2 eligibility: Canada outside Quebec, or the United States (decision 17 excludes Quebec at signup until French-language copy and Law 25 basics exist; "outside Quebec for now" ships September 17). Please confirm the wording and what Quebec re-entry requires.
8. The iOS line in section 7 ("Flourish is currently provided free of charge on iOS") will need replacing when in-app purchase ships; please give us the Apple-compatible version now so it is ready.
9. App Store review notes (section 5): anything that would draw a reviewer's objection or a legal exposure.
10. Trademark: file FLOURISH MONEY word mark, classes 9, 36, 42, per TRADEMARK-KNOCKOUT.md; advise on the logo mark and on watching pending application 2455859.

## 2. Privacy Policy (current text in the app, last updated April 28, 2026)

Flourish Money is operated by GrowSmart Inc. ("we", "us", or "our"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use the Flourish Money application ("App"), available at flourishmoney.app.

1. Information We Collect

Information you provide directly: First name, country and province/state, relationship status, income sources, account balances, bills, debts, savings goals, and financial transactions you enter manually or via bank connections (Plaid; one or more institutions). We also collect an email address and password when you create an account.

Information collected automatically: Device type, operating system, app version, usage patterns (screens viewed, features used), and crash reports. We do not collect your IP address for tracking purposes.

Bank connection data (Plaid): If you connect your bank, Plaid Inc. retrieves account balances and transaction history on our behalf. We receive read-only access to this data. We do not store your banking credentials. Plaid's privacy policy applies to that connection.

2. How We Use Your Information

We use your financial data solely to provide the Flourish Money service, including your Financial Health Score, spending insights, AI coaching, budgeting, debt tracking, and goals. Specifically we use it to: power your personalized AI Coach (via Anthropic's Claude API), calculate your financial health metrics, surface relevant opportunities and warnings, and improve the App. We do not sell your personal information to third parties. We do not use your financial data for advertising profiling.

3. Legal Basis for Processing (Canada, PIPEDA)

For users in Canada, we collect and process your personal information with your knowledge and consent in accordance with the Personal Information Protection and Electronic Documents Act (PIPEDA) and applicable provincial privacy laws. You may withdraw consent at any time by deleting your account. We retain data only as long as necessary to provide the service or as required by law.

4. Legal Basis for Processing (United States)

For US residents, we comply with applicable state and federal privacy laws. California residents have rights under the CCPA/CPRA including the right to know, delete, and opt out of sale of personal information. We do not sell personal information. To exercise your rights, contact us at privacy@flourishmoney.app.

5. Data Storage and Security

Your data is stored on your device (locally via localStorage) and, if you create an account, in our secure cloud database provided by Supabase (hosted in data centres compliant with SOC 2 Type II). Data transmitted between your device and our servers is encrypted using TLS 1.2+. AI coaching queries are processed by Anthropic's API and are subject to Anthropic's data-handling policies; no conversation history is stored server-side by Flourish.

Important: financial calculations (balances, safe-to-spend, debt payoff projections, investment growth) are computed in JavaScript on your device. Anthropic only generates plain-language explanations of numbers we calculate ourselves. Anthropic does not train AI models on data sent through their API. You can turn the AI coach off in Settings. When it is off, no financial data is sent to Anthropic.

6. Data Sharing

We share data with the following service providers solely to operate the App: Anthropic (AI coaching responses; transaction summaries sent as context); Plaid (bank account connectivity and transaction history); Plaid Enrich (transaction description cleanup: sends merchant text to receive cleaner names, logos, and category labels); Anthropic Statement Parser (when you upload a bank statement (CSV/PDF), the document text is sent to Anthropic to extract transactions); Supabase (account authentication and encrypted cloud data storage); Netlify (app hosting and serverless function processing). We do not share your data with advertisers, data brokers, or any other third parties.

7. Your Rights

You have the right to access, correct, or delete your personal information at any time. You can delete your account and all associated data from Settings, Delete Account. For data requests or questions, contact us at privacy@flourishmoney.app. We will respond within 30 days.

8. Children's Privacy

The App is not intended for individuals under the age of 18. We do not knowingly collect personal information from minors. If we learn that we have collected personal information from a minor, we will promptly delete it.

9. Changes to This Policy

We may update this Privacy Policy periodically. We will notify you of material changes via the App or by email. Continued use of the App after changes constitutes your acceptance of the updated policy.

10. Contact Us

GrowSmart Inc. / Flourish Money. Website: flourishmoney.app. privacy@flourishmoney.app

Known gaps for the reviewer: no analytics provider named yet (PostHog is coming); no retention schedule; section 1 says "we do not collect your IP address for tracking purposes" while the coach function keeps a per-IP daily abuse counter (not for tracking, but the sentence should be accurate); section 5 says calculations run "on your device" while some run in serverless functions on our servers for the coach guards; "SOC 2 Type II" and "TLS 1.2+" are vendor claims to confirm before they stay.

## 3. Terms of Service (current text in the app, last updated April 28, 2026)

Please read these Terms of Service carefully before using Flourish Money. By accessing or using the App, you agree to be bound by these Terms. If you do not agree, do not use the App.

1. About Flourish Money

Flourish Money ("App") is a personal finance management tool operated by GrowSmart Inc. ("Company", "we", "us"). The App provides budgeting, forecasting, spending tracking, a financial health score, AI coaching that works from figures the App calculates, and goal-setting tools. The App is read-only and cannot initiate payments or transfers.

2. Eligibility

You must be at least 18 years old and a resident of Canada or the United States to use Flourish Money. By using the App, you represent and warrant that you meet these requirements.

3. Not a Licensed Adviser

Important: Flourish Money is an educational financial tool, not a licensed financial advisor. The AI Coach, insights, scores, and all content in the App are for informational purposes only and do not constitute financial, investment, tax, or legal advice. Always consult a qualified financial professional before making significant financial decisions. The coach explains and helps you weigh figures calculated by the App. It does not perform financial calculations and does not provide investment, legal or individualized tax recommendations.

4. Account Registration

Flourish Money requires a registered account. You sign up using an email and password. Optional two-factor authentication may be added in future versions. Authentication is handled through Supabase. You may delete your account and all associated data at any time from Settings. You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You must notify us immediately at hello@flourishmoney.app of any unauthorized use.

5. Bank Connectivity (Plaid)

If you choose to connect your bank accounts, you authorize us to use Plaid Inc. to access your financial institution on your behalf. This access is read-only; we cannot initiate transactions. Your banking credentials are never shared with or stored by Flourish Money. By connecting your bank, you also agree to Plaid's End User Privacy Policy.

6. Acceptable Use

You agree not to: use the App for any unlawful purpose; attempt to reverse-engineer, decompile, or hack the App; use the App to process another person's financial data without their consent; resell or sublicense the App; or interfere with the security or integrity of the App or its infrastructure.

7. Subscription and Billing

Web version: Free Tier: Core features are available at no charge with a 14-day trial of premium features. Flourish Plus: Premium features require a paid subscription. Subscription fees are billed in advance on a monthly or annual basis. Prices are displayed in CAD for Canadian users and USD for US users, inclusive of applicable taxes. You may cancel at any time; cancellations take effect at the end of the current billing period. No refunds are provided for partial billing periods unless required by applicable law.

iOS version currently shows instead: "Flourish is currently provided free of charge on iOS."

8. Intellectual Property

The App, including its design, logo, code, AI systems, and content, is the exclusive property of GrowSmart Inc. and is protected by copyright, trademark, and other intellectual property laws. You receive a limited, non-exclusive, non-transferable licence to use the App for personal, non-commercial purposes.

9. Disclaimer of Warranties

THE APP IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE APP WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT FINANCIAL DATA WILL BE ACCURATE OR COMPLETE. YOUR USE OF THE APP IS AT YOUR SOLE RISK.

10. Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, GROWSMART INC. SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF OR INABILITY TO USE THE APP, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE 12 MONTHS PRIOR TO THE CLAIM.

11. Governing Law

These Terms shall be governed by the laws of the Province of Ontario and the federal laws of Canada applicable therein, without regard to conflict of law principles. For US users, disputes may alternatively be resolved under the laws of your state of residence to the extent required by applicable law.

12. Changes to These Terms

We reserve the right to modify these Terms at any time. We will notify you of material changes via the App or email. Continued use of the App after changes constitutes your acceptance of the updated Terms.

13. Contact

GrowSmart Inc. / Flourish Money. Website: flourishmoney.app. hello@flourishmoney.app

## 4. Founding offer terms

See BEFORE-MONDAY.md section 3 (eight plain-language points and the questions on the lock, refunds, the Anthropic clause and Bill C-36).

## 5. App Store review notes (draft for the October submission)

Flourish Money is a personal-finance app for Canadian households. It shows a daily safe-to-spend number, upcoming bills and risks, debt and goal progress, and a weekly money meeting agenda, all calculated inside the app from the user's own data. An optional AI coach (Anthropic's Claude, via our server) explains those figures in plain language; it is blocked from producing any number that is not already in the user's data, it cannot move money, and it can be turned off in Settings.

Demo account: provided in App Store Connect (email and password login). The demo account has sample data loaded so every screen renders without linking a bank.

Bank linking uses Plaid with read-only access. Before Plaid Link opens, the app shows its own consent screen describing what is accessed and how to disconnect (guidelines 5.1.1 and 5.1.2). Reviewers do not need to link a real bank; the demo account already shows linked-style data. Users can disconnect any bank in Settings, Connected Banks, and delete their account and all server data in Settings, Delete Account (guideline 5.1.1(v)).

AI disclosure: before the first coach message the app shows a notice that the coach is AI, what data is sent, and how to turn it off; the user must accept it. Every coach reply carries "Figures are Flourish calculations from your data. Not investment, legal or tax advice."

Business model: free tier (manual entry, 2 coaching messages a week, meeting agenda without the AI facilitator) and Flourish Plus by auto-renewable subscription, monthly or annual, purchased through in-app purchase (guideline 3.1.1). Subscriptions bought on our website are honoured in the app (guideline 3.1.3(b)); the app contains no external purchase links or pricing for other platforms. A 14-day trial of Plus is provided by our service, not through StoreKit.

Camera and photo library are used only when the user chooses to import a bank statement by photo or file; the extracted rows are shown for review and nothing is imported without confirmation. No social features, no user-generated content shared with others, no ads, no tracking across apps. Age rating: 18 plus by our Terms; the content itself has no age-restricted material. Encryption: standard HTTPS only (export compliance "None" beyond exempt encryption).

App Privacy answers to prepare: Financial Info (linked to user, app functionality), Contact Info (email), Identifiers (user ID), Usage Data (product interaction, app functionality, analytics; not linked to identity if PostHog is configured that way), Diagnostics (crash data). No data used for tracking.

## 6. Changes already known to be needed (for the same review)

0. Shipped September 17, before the cohort signs up (please review as written): Terms section 7, "Prices are displayed in CAD for Canadian users and USD for US users, plus applicable taxes" and "The founding annual price renews at the same price for as long as the subscription remains continuously active; the regular price applies after any lapse"; Terms section 2, "resident of Canada (outside Quebec for now) or the United States"; Privacy Policy section 6, "PostHog: product analytics, hosted in the United States; counts and flags only, never amounts; opt out in Settings"; both "Last updated" dates moved to September 17, 2026.
1. Terms section 7: annual plans, founding price and the Stripe Customer Portal cancel flow; the iOS sentence replaced with the in-app purchase version when IAP ships.
2. Privacy policy: add PostHog (analytics, minimized), a retention schedule, the AI notice and bank consent screens as consent mechanisms, and a breach process; correct the IP sentence and the "on your device" sentence.
3. Both documents: a "last updated" date and a change log; CASL lines on every email capture (BEFORE-MONDAY.md section 4).
