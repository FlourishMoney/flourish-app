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

---

## 3. Sandbox test: "Platypus OAuth Bank" on the flourish-test emulator and the iOS simulator

For when Plaid **Sandbox** keys are on this Mac. Never Production keys. Not yet run: written from the code
and Plaid's Sandbox docs, so the first run is also the test of these steps.

**Why there is setup.** A store build sends every request to `https://flourishmoney.app`, whose functions run
Plaid Production, where Platypus does not exist. A Sandbox test build points the app at a function server on
this Mac instead (`VITE_NATIVE_API_BASE`, read only by a store app; `build:native` refuses to build while it
is set, so it can never reach a store). That server checks each sign-in against its own Supabase, so the test
uses the local Supabase stack, not production.

### A. Once: the Sandbox keys (zsh, values never shown or saved in the repo)

```bash
mkdir -p ~/.flourish-sandbox && chmod 700 ~/.flourish-sandbox && read -rs 'CID?Plaid Sandbox client_id: ' && echo && read -rs 'SEC?Plaid Sandbox secret: ' && echo && printf 'PLAID_ENV=sandbox\nPLAID_CLIENT_ID=%s\nPLAID_SECRET=%s\n' "$CID" "$SEC" > ~/.flourish-sandbox/plaid.env && chmod 600 ~/.flourish-sandbox/plaid.env && unset CID SEC && echo saved
```

### B. Each time: the local stack, the function server, the test build

1. `cd ~/Projects/flourish-plaid-oauth` (or the repo once merged).
2. Local Supabase: `docker ps --format '{{.Names}}' | grep supabase_` first. If another session's stack is
   running, do not stop it: wait, or ask Amanda. Then `npx supabase start` (applies `supabase/migrations`).
3. Function server, in its own Terminal tab, with Plaid Sandbox and the local stack (`--offline`: the Netlify
   CLI never fetches the site's own variables, so Production keys never reach this Mac):
   ```bash
   eval "$(npx supabase status -o env | grep -E '^(API_URL|SERVICE_ROLE_KEY)=')" && set -a && source ~/.flourish-sandbox/plaid.env && set +a && SUPABASE_URL="$API_URL" SUPABASE_SECRET_KEY="$SERVICE_ROLE_KEY" npx netlify dev --offline --port 8888
   ```
4. Test build, in another tab (shell variables win over `.env.local`; plain `vite build`, because
   `build:native` refuses this build by design):
   ```bash
   eval "$(npx supabase status -o env | grep -E '^(API_URL|ANON_KEY)=')" && VITE_SUPABASE_URL="$API_URL" VITE_SUPABASE_PUBLISHABLE_KEY="$ANON_KEY" VITE_NATIVE_API_BASE=http://localhost:8888 npx vite build && npx cap sync
   ```
5. Android only, for this test build only (never commit it): add `android:usesCleartextTraffic="true"` to
   `<application>` in `android/app/src/main/AndroidManifest.xml`, because the function server is plain http.

### C. Android: the flourish-test emulator

1. `~/Library/Android/sdk/platform-tools/adb devices`. If an emulator is already running for another session,
   ask before using it: installing replaces the Flourish app on it. Otherwise start it:
   `~/Library/Android/sdk/emulator/emulator -avd flourish-test &`
2. Let the emulator's `localhost` reach this Mac:
   `~/Library/Android/sdk/platform-tools/adb reverse tcp:8888 tcp:8888 && ~/Library/Android/sdk/platform-tools/adb reverse tcp:54321 tcp:54321`
3. Install and open: `cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew installDebug && cd ..`, then open Flourish on the emulator.
4. Run the cases in section D.

### D. The cases (both devices)

Sign up with any address (the local stack's mail viewer, http://localhost:54324, has the confirmation email
if one is asked for). On **About you**, choose **United States**: Platypus OAuth Bank is a US Sandbox bank.

1. **Success, onboarding.** **Connect My Bank Securely** → **Connect My Bank** on the consent sheet → the
   in-app browser opens Plaid → search **Platypus OAuth Bank** → continue to the **First Platypus OAuth**
   screen → leave the drop-down on success → continue → choose accounts → finish. Expected: the browser
   closes by itself, "Connecting securely…", then **Connected!** with the accounts. The function server's
   output shows `create_link_token`, then `hosted_link_result`, `exchange_token`, `get_accounts`.
2. **Closed browser.** Fresh account (or Settings → **Connected Accounts** → **+ Connect Another Bank**). When Plaid opens, close
   the browser before finishing (iOS: **Done**; Android: the **X** or Back). Expected, about two seconds
   later: "Your bank wasn't connected. The bank window closed before it finished. You can try again." with
   Connect ready again (onboarding), or a **Try again** / **Not now** dialog (Settings; Try again shows the
   consent sheet again).
3. **Left Link inside Plaid.** Open Plaid, tap Plaid's own close button and confirm exit. Expected: the same
   message as case 2.
4. **Failure.** Platypus OAuth Bank → on the **First Platypus OAuth** screen choose **ACCESS_NOT_GRANTED**
   from the drop-down → continue → exit when Plaid shows the error. Expected: "Your bank wasn't connected.
   Something went wrong on the way back from your bank. You can try again." (Plaid: `error_` passwords do
   not work with OAuth banks; the drop-down is the way.)
5. **Settings path.** Settings → **Connected Accounts** → **+ Connect Another Bank**, then case 1. Expected: the new bank listed.
6. **Android, the app closed by the system.** Emulator **Settings** → **System** → **Developer options** →
   turn on **Don't keep activities**. Run case 1. Expected: the app restarts on return and, once signed in,
   the bank is connected anyway. Turn the option off afterwards.
7. **iOS, "Open in Flourish?".** If iOS asks before returning to the app, tap **Open**: case 1's result. Run
   it again and tap **Cancel**, then **Done**: still connected (the result is read from Plaid either way).

### E. iOS simulator

1. Steps B1 to B4 (no cleartext edit; the simulator shares this Mac's `localhost`).
2. `open ios/App/App.xcodeproj` → scheme **App** → an iPhone simulator (iOS 27.x) → **Run**. Xcode 27.1:
   `export DEVELOPER_DIR=/Applications/Xcode-27.1.app/Contents/Developer` for command-line builds.
3. Run the cases in section D.

### F. Afterwards

- `git checkout android/app/src/main/AndroidManifest.xml` (the cleartext line), then `git status` shows nothing.
- Stop the function server (Ctrl-C in its tab) and `npx supabase stop` (only the stack you started).
- Rebuild the payload normally before any other native work: `npm run build && npx cap sync`.

The website's `/plaid/oauth` return is not part of this: its redirect_uri is the production address. It is
checked on the live site with a US OAuth bank after the merge.
