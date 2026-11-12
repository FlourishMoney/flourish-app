# Sign in with Apple and Google: what the account owner sets up (1.1.7)

These steps need your logins. Nothing in them is a value Claude can guess: every key, ID and secret is created here and pasted straight into Supabase. **Do all of them before the 1.1.7 PR merges.** Merging deploys the website, and its Apple and Google buttons only work once Supabase has both providers.

The Supabase callback address used below is `https://qhcccjkmvijrybagkvyw.supabase.co/auth/v1/callback`. Check it on step G1, where Supabase shows it to copy.

## A. Apple Developer (developer.apple.com, signed in as the account holder)

1. **Turn on Sign in with Apple for the app.**
   - Account → Certificates, IDs & Profiles → Identifiers → `app.flourishmoney`.
   - Capabilities → tick **Sign in with Apple** (leave it as "Enable as a primary App ID") → Save → Confirm.
2. **Make a Services ID** (the website, and Apple on Android, use it).
   - Identifiers → **+** → Services IDs → Continue.
   - Description: `flourish` (Apple shows this to people: "sign in to flourish"). Identifier: `app.flourishmoney.web`. Continue → Register.
   - Already made with another description? Open `app.flourishmoney.web`, change Description to `flourish`, Save.
3. **Point the Services ID at Supabase.**
   - Open `app.flourishmoney.web` → tick **Sign in with Apple** → Configure.
   - Primary App ID: `app.flourishmoney`.
   - Domains and Subdomains: `qhcccjkmvijrybagkvyw.supabase.co`.
   - Return URLs: `https://qhcccjkmvijrybagkvyw.supabase.co/auth/v1/callback`.
   - Next → Done → Continue → Save.
4. **Make a key.**
   - Keys → **+** → Key Name: `flourish sign in with apple` → tick **Sign in with Apple** → Configure → Primary App ID `app.flourishmoney` → Save → Continue → Register.
   - **Download** the `.p8` file. Apple lets you download it once. Write down the **Key ID** shown on that page.
   - Your **Team ID** is at the top right of the page (under your name).
5. **Let Apple's private relay addresses get our email** (people who choose "Hide My Email").
   - Certificates, IDs & Profiles → Services → **Sign in with Apple for Email Communication** → Configure → **+**.
   - Add the domain our email is sent from (the one in the From address of our trial and receipt emails) and its sending address → Register.

## G. Supabase (supabase.com → project flourish-money)

1. **Apple.**
   - Authentication → Sign In / Providers → **Apple** → Enable.
   - Client IDs: `app.flourishmoney.web,app.flourishmoney`. That's the Services ID, a comma, then the app's bundle ID; the bundle ID lets the iPhone's own Apple sheet sign in.
   - Secret Key (for OAuth): use Supabase's "Generate a secret" link beside the field. Give it the Team ID, the Key ID and the contents of the `.p8` file from A4.
   - The secret it makes expires after 6 months. Put a reminder in your calendar to make a new one.
   - Copy the **Callback URL** shown on this page and check it matches the one above. Save.
2. **Google.** Do section C first, then come back:
   - Authentication → Sign In / Providers → **Google** → Enable.
   - Paste the Client ID and the Client Secret from C3. Save.
3. **Where people come back to.**
   - Authentication → URL Configuration → Redirect URLs → **Add URL**: `flourishmoney://auth-callback` → Save.
   - Check that `https://flourishmoney.app` is already the Site URL, or is listed. Add it if it isn't.
4. **Let Apple and Google create accounts, and nothing else.** With "Allow new users to sign up" off, Supabase refuses a new Apple or Google user ("Signups not allowed for this instance"), on the website and in the iPhone's Apple sheet. But "Confirm email" is off too, so turning sign-ups on by itself would also let anyone with the app's public key make an email account straight through Supabase, past our server's gate. Migration 0048 closes that: a "Before User Created" hook that lets only Apple and Google create accounts. Our own server makes email accounts with the admin API, which the hook never sees, so instant signup is unchanged. **In this order:**
   1. SQL Editor → New query → paste `supabase/migrations/0048_signup_hook.sql` → Run. It touches no table and no row.
   2. Authentication → Auth Hooks → **Add hook** → **Before User Created** → Hook type **Postgres** → Schema `public` → Function `flourish_before_user_created` → **Create hook**. Check that it shows as enabled.
   3. Only then: Authentication → Sign In / Providers → **Allow new users to sign up** → on → Save.

   Done the other way round, email sign-ups through Supabase stay open for the minutes in between. To undo, turn "Allow new users to sign up" off first, then disable the hook.

5. **Same address, existing account.** Supabase joins an Apple or Google sign-in to the existing account with the same address, so a household that already has a password account lands in it, not in a second one. Apple's "Hide My Email" gives a different address, and that becomes a new account.

   The app then tells our server (`social_signin`). If that account's address was never proved (made by instant signup, or with an invite code), the server replaces its password with a random one and signs out every other session. Only the person who just proved the address through Apple or Google keeps it, and Forgot password still works for them. That closes the case where someone made an account with another person's address before they arrived.

## C. Google Cloud (console.cloud.google.com, the account that owns the flourish project; make a project called `flourish` if there is none)

1. **Consent screen.**
   - APIs & Services → OAuth consent screen (Google Auth Platform → Branding) → Get started.
   - App name `flourish`, support email `hello@flourishmoney.app`. Audience: External. Contact email: yours.
   - Branding: app logo (the flourish mark), home page `https://flourishmoney.app`, privacy policy `https://flourishmoney.app/privacy`, terms `https://flourishmoney.app/terms`.
   - Authorized domains: `flourishmoney.app` and `supabase.co`. Save.
2. **Publish it.** Audience → **Publish app**. With only the basic scopes (email, profile, openid), Google doesn't need a review.
3. **The client.**
   - Clients (Credentials) → **Create client** → Application type **Web application** → Name `flourish supabase`.
   - Authorized JavaScript origins: `https://flourishmoney.app`.
   - Authorized redirect URIs: `https://qhcccjkmvijrybagkvyw.supabase.co/auth/v1/callback`.
   - Create, then copy the **Client ID** and the **Client secret** into Supabase (G2).

No Android or iOS Google client is needed. The apps sign in to Google in the system's own browser, through the web client above.

## D. App Store Connect and Play Console (when 1.1.7 is built)

1. **App Store Connect:** App Privacy. The new sign-in methods collect nothing new: the email address and name are already declared. If Apple asks about "Sign in with Apple", there's nothing to add.
2. **App Review notes for 1.1.7:** the review account still signs in with email and password, as before.
3. **Nothing to change in Play Console** for sign-in.

## Checks after setup (Claude can do these read-only)
- The website's "Continue with Google" and "Continue with Apple" reach each provider's page and come back signed in. Use a test account that's yours.
- Supabase → Authentication → Users shows the new user with provider `google` or `apple`.
