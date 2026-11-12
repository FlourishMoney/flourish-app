# Instant signup (SIGNUP_INSTANT)

Amanda's decision (2026-11-11, first-run audit): a new person gets into flourish right away, with no trip to the inbox and no second sign-in.

**What it does.** With `SIGNUP_INSTANT` set to exactly `true` and `OPEN_SIGNUP` on:
- `beta.js` creates every new account already confirmed, and marks it `app_metadata.email_confirmation = "instant"`.
- No confirmation email is sent.
- The website signs in with the address and password just typed and goes straight to onboarding.
- A store build from before this (1.1.6 and older) shows "Account created. You can log in now." with both fields still filled in. One tap on Log In gets the person in.

**When it's off** (unset, or anything but `true`), signup is exactly as before: an open signup confirms its address by link.

**Why this and not a 6-digit code.**
- A code still sends the person to their inbox.
- A code needs a new Supabase email template.
- A code adds a new screen to every store build.

This switch is one server change. It also reaches the store apps already in people's hands.

## What changes for security

1. **Nobody proves they own the address.** Someone could make an account with another person's address. That account then receives our emails: the trial reminder, Stripe receipts and household invites from it. The newsletter keeps its own double opt-in, so it is unaffected. The real owner can still take the account over with Forgot password, because the reset email goes to them. This is the risk KNOWN-DEFECTS 32 closed. Turning the switch on reopens it on purpose.
2. **A typo locks the person out.** A mistyped address can't receive a password reset. Their trial reminder and receipts go to the wrong address, or nowhere.
3. **The founding price no longer needs a proved address** for these accounts. It goes to the first 50 households who pay, so paying earns the seat. Accounts confirmed on creation while signup was shut ("auto") are still not offered it.
4. **Household invites:** an instant account counts as confirmed, so it can invite a partner. The invite email goes to an address the inviter typed.
5. **Unchanged:**
   - The signup rate limit, the email_exists answer and password strength.
   - Password reset for real addresses, and Forgot password.
   - Trial plan first, Stripe checkout, and the store purchases.

## Switching it on (Amanda)
1. Netlify → flourish-money → Site configuration → Environment variables → Add a variable: `SIGNUP_INSTANT`, value `true`, scope Functions, Production only.
2. Deploys → Trigger deploy → Deploy site, so the functions pick up the new value.

To switch it off, delete the variable and redeploy. Accounts already made stay usable.
