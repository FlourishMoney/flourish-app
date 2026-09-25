# Auth email: why reset links fail, and the settings that fix it

Written 2026-09-25 while investigating "Error sending recovery email" on production.
**Investigation only — no Supabase setting was changed by this branch.** Everything in
"What Amanda enters" is for a human to type into the dashboard.

## What the code actually does

Flourish sends **no auth email itself**. All three are handed to Supabase Auth (GoTrue), which
sends them from whatever mail transport the project is configured with:

| Email | Call site | Trigger |
|---|---|---|
| Password reset | `supabase.auth.resetPasswordForEmail` — [App.jsx:12574](src/App.jsx:12574) | "Forgot password?" |
| Magic link | `supabase.auth.signInWithOtp` — [App.jsx:12588](src/App.jsx:12588) | "Email me a magic link" |
| Confirmation resend | `supabase.auth.resend` — [App.jsx:12517](src/App.jsx:12517) | "Resend confirmation email" |

The app's **own** mail (waitlist welcome, beta invites) does not go through Supabase at all — it
POSTs to Resend from a Netlify function, `_lib/waitlistWelcome.js`, using `RESEND_API_KEY` and
sending as `Flourish <hello@flourishmoney.app>`. That mail works. This is the key fact: Resend and
the `flourishmoney.app` sending domain are already set up and delivering; it is only GoTrue that has
no working transport.

Signup does not send mail either — it goes to `/api/beta`, which creates the user server-side with
the service role and no confirmation email ([App.jsx:12527-12531](src/App.jsx:12527)). That is why
signup appears fine while reset and magic link fail: **the broken paths are exactly the ones GoTrue
sends, and nothing else.**

## The diagnosis

`Error sending recovery email` is GoTrue reporting that its SMTP send failed. Nothing in this
repository can cause or fix it — there is no code path between the button and the mail server other
than Supabase's own. With no custom SMTP configured, a project falls back to Supabase's built-in
shared sender, which is rate-limited to a handful of messages an hour and, on projects created
recently, refuses to send to anyone who is not a member of the project. Either refusal surfaces as
this exact error.

I could not confirm the project's current SMTP state: I have no dashboard access and was asked not
to touch it. So treat the paragraph above as the likely cause consistent with the evidence, not as
something I verified. The first step below is a check, not a change.

## What Amanda enters

**0. Look first.** Supabase dashboard → the Flourish project → **Authentication → Emails → SMTP
Settings**. If "Enable Custom SMTP" is already on, stop and read the error under
**Authentication → Logs** instead — the cause is different and the settings below will not help.

**1. Turn on Enable Custom SMTP and fill in:**

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` — the literal word, not an email address |
| Password | a Resend API key (`re_…`). Reuse `RESEND_API_KEY`, or better, make a second key named `supabase-auth` in Resend so it can be revoked on its own |
| Sender email | `no-reply@flourishmoney.app` |
| Sender name | `Flourish` |

The sender address must be on a domain verified in Resend. `flourishmoney.app` already is —
`hello@flourishmoney.app` is delivering waitlist mail today — so `no-reply@` on that same domain
needs no new DNS. Use `hello@` instead if you would rather a reply reach a human; the only reason
to prefer `no-reply@` is that nobody should reply to a password-reset mail.

**2. Raise the send limit.** **Authentication → Rate Limits → "Rate limit for sending emails"**.
The built-in cap stays in force until custom SMTP is on, and the default afterwards is still low
enough to bite during a launch. 100/hour is sensible for a closed test.

**3. Check the return URLs.** **Authentication → URL Configuration**:
- Site URL: `https://flourishmoney.app`
- Redirect URLs: `https://flourishmoney.app/**`

A reset link whose `redirectTo` is not on this list is silently rewritten to the Site URL, which
looks like "the link doesn't work" rather than an error.

**4. Send a real one.** Use "Forgot password?" on production with an address that is **not** a
project member — a project member's address can succeed on the built-in sender and hide the
problem. Then confirm the send appears in the Resend dashboard.

## Where reset links come back to

Decided 2026-09-25, and implemented on this branch: **the store apps send reset links to the
website.** An auth email opens in the system browser, never inside the app, so a link pointing at
`capacitor://localhost` is meaningless there — the browser cannot open it, and Supabase rejects it
against the allow-list. Native therefore sends `redirectTo`
`https://flourishmoney.app/?reset_from=app`, the person sets the new password on the site, and the
page then tells them: "Your password is updated. Open the Flourish app and log in with your new
password." Web behaviour is unchanged, including on deploy previews.

The **magic link is hidden in both store apps** for the same reason and without the same remedy: it
logs a *browser* in, and a browser session cannot become an app session, so the button was a dead
end. Password reset stays on native because it ends with a password the person can type into the
app. The web keeps both.

This means the redirect allow-list must accept the marker. Add it explicitly:

- `https://flourishmoney.app/**`
- `https://flourishmoney.app/?reset_from=app`

If the marker is ever stripped, nothing breaks — the password is still updated and the page simply
behaves as it does for a web visitor. Only the closing instruction is lost.

**Universal links are the better answer and are a later update.** An `https://` link that opens the
app directly would let someone finish a reset without leaving it. That needs an Apple App Site
Association file and an Android `assetlinks.json` hosted on flourishmoney.app, plus the associated
domain entitlement in both builds — infrastructure this branch deliberately does not touch. Until
then the website round trip above is the Apple-standard flow and is what ships.

