# Plaid: Hosted Link in the store apps, OAuth return on the website

What changed (branch `plaid-oauth-return`):

- **Store apps (iOS, Android):** a bank is linked through **Plaid Hosted Link**, opened in the system's
  in-app browser (`@capacitor/browser`: SFSafariViewController on iOS, a Custom Tab on Android). When the
  session ends, Plaid sends the browser to `flourishmoney://plaid/complete`, the app catches it
  (`@capacitor/app`), and the server reads what happened from Plaid (`hosted_link_result` →
  `/link/token/get`) before the existing `exchange_token`. Code: `netlify/functions/_lib/plaidLink.js`,
  `src/lib/plaidHostedLink.js`, `openHostedLink` and `usePlaidLinkSDK` in `src/App.jsx`.
- **Website:** keeps Plaid's web SDK. A bank that signs in with OAuth sends a phone's browser back to
  `https://flourishmoney.app/plaid/oauth`, where Link re-opens with the same link token and
  `receivedRedirectUri`. Code: `src/lib/plaidOAuthReturn.js`.

Names, not line numbers: every line number in older docs is stale.

---

## 1. Does Hosted Link support Canadian institutions?

**Plaid's docs do not say.** Checked 2026-10-15:

- The Hosted Link guide (plaid.com/docs/link/hosted-link) names no countries and lists no regional limit.
  Its only limits are products: Layer, Identity Verification and Embedded Institution Search are not
  supported. Its sample request happens to use `"country_codes": ["US"]`, which is not a stated limit.
- The Link API reference (plaid.com/docs/api/link) describes the `hosted_link` object and
  `/link/token/get` without any country condition.
- The OAuth guide (plaid.com/docs/link/oauth) says OAuth is not currently used by financial institutions
  in Canada. So the `/plaid/oauth` return mostly matters for US banks; for Canadian banks, Hosted Link is
  still what moves the store apps off Plaid's web SDK inside a WebView, which Plaid has deprecated.

Until Plaid answers, treat Canadian coverage through Hosted Link as **unconfirmed**. Amanda, send this to
Plaid support (dashboard.plaid.com → **Support** → **Submit a request**):

> Hello, we're Flourish (client name "Flourish Money"), a household money app for Canada and the US that
> uses Transactions, with Investments and Liabilities as optional products. Our iOS and Android apps are
> moving from the Link web SDK inside a WebView to Hosted Link, created with `hosted_link`
> (`completion_redirect_uri` set to our app's own scheme, `is_mobile_app: true`) and a universal link /
> App Link as `redirect_uri`; our website keeps the Link web SDK. Your Hosted Link documentation doesn't
> say which countries it covers. Can you confirm that Hosted Link supports link tokens created with
> `country_codes: ["CA"]` in both Sandbox and Production, that every Canadian institution available to us
> through the web SDK (including RBC, TD, Scotiabank, BMO, CIBC, National Bank, Desjardins, Tangerine and
> the credit unions) is available through Hosted Link with the same products, and that update mode works
> for Canadian Items through Hosted Link? If any Canadian institution, product or flow is not supported
> through Hosted Link, which ones?

If Plaid says Canada is not fully supported, the branch can still merge: the website gets the
`/plaid/oauth` return, and Hosted Link is used only by a store build that asks for it (`hosted_link: true`
on `create_link_token`). Just do not ship new store builds from it until Plaid confirms.

---

## 2. Values Amanda sets (one per line, with the menu path)

**Before this PR merges** (the website's link tokens carry the new redirect_uri from the first deploy, and
Plaid refuses a link token whose redirect_uri is not on the list):

1. Plaid Dashboard → **Developers** → **API** → **Allowed redirect URIs** → add `https://flourishmoney.app/plaid/oauth`
2. Plaid Dashboard → **Developers** → **API** → **Allowed redirect URIs** → add `https://flourishmoney.app/plaid/app`
3. Plaid Dashboard → **Developers** → **API** → **Allowed redirect URIs** → leave `https://flourishmoney.app` where it is (nothing sends it after this ships; remove it later if you like)

If that page has a Sandbox / Production switch, add 1 and 2 in both.

**Before the new store builds go out:**

4. developer.apple.com → **Account** → **Certificates, IDs & Profiles** → **Identifiers** → `app.flourishmoney` → **Capabilities** → tick **Associated Domains** → **Save** (Xcode's automatic signing may do this itself on the next build; check it took)
5. Xcode → `ios/App/App.xcodeproj` → target **App** → **Signing & Capabilities** → confirm **Associated Domains** lists `applinks:flourishmoney.app` and there is no signing error (nothing to type: it comes from `App/App.entitlements`)
6. Xcode → target **App** → **Info** → **URL Types** → confirm `flourishmoney` is listed (nothing to type: it comes from `Info.plist`)
7. Play Console → **Flourish** → **Test and release** → **App integrity** → **App signing** → **App signing key certificate** → copy the **SHA-256 certificate fingerprint** and send it to Claude (it goes into `public/.well-known/assetlinks.json` next to the upload key's, which App Links do not use for store installs)

**Nothing to set:**

- Plaid Hosted Link: no Dashboard setting and no request. Plaid's guide says it is no longer necessary to ask
  an account manager to enable it. The completion address `flourishmoney://plaid/complete` must **not** be
  registered anywhere; Plaid says it does not need to be.
- Plaid webhook: no new URL. The app reads the result from `/link/token/get`. Every link token already names
  `https://flourishmoney.app/.netlify/functions/plaid-webhook`; Hosted Link's `SESSION_FINISHED` arrives there
  with no item_id and is acknowledged and ignored.
- Plaid **Allowed Android package names**: not used. Plaid cannot use `android_package_name` with Hosted Link.
- Netlify, Supabase: nothing. The two `.well-known` files deploy with the site, served as JSON (`netlify.toml`).

**After the next deploy**, check (no login needed):

- `https://flourishmoney.app/.well-known/apple-app-site-association` and
  `https://flourishmoney.app/.well-known/assetlinks.json` open as JSON, not the app's page.
