# Couple mode: words to write (2026-10-29)

Every household line the app or the invite email shows is a placeholder `[WORDS: id]` until Amanda approves it.
- The app's lines are in `src/lib/householdWords.js`.
- The email's lines are in `netlify/functions/_lib/household.js` `INVITE_EMAIL`.
- `tests/householdClient.test.cjs` checks that every id is in the table below, once.
- The invite email is never sent while any of its lines is still a placeholder.

**Do not merge until these are in.** Nothing shows while `HOUSEHOLD_ENABLED` is off. Turning it on while the placeholders are still in would show them to people.

House rules:
- Roles only. Say "you" and "your partner"; never a name, and never the other person's email, except the invited address shown to the owner who typed it.
- No em dashes in the email (the dash rule).
- Limits are characters, including spaces.

| id | where it shows | facts it must state | limit |
|---|---|---|---|
| `settings.household.row` | Settings list, the row's title | The name of the feature. | 20 |
| `settings.household.sub.none` | Settings row, the grey line under it, not sharing yet | Invite one partner to share this household. | 45 |
| `settings.household.sub.pending` | Settings row, grey line, an invite is open | An invite is waiting for your partner. | 45 |
| `settings.household.sub.shared` | Settings row, grey line, two members | Shared with your partner. | 45 |
| `household.intro` | Household, top, not sharing yet | One partner can join this household. Both see and edit the same money: Today, bills, paydays, debts, linked bank accounts, goals and the money meeting. At most 2 adults. One subscription covers both. | 260 |
| `household.invite.button` | Household, main button | Start inviting a partner. | 24 |
| `household.consent.owner.title` | Owner's consent screen, heading | Before you invite. | 40 |
| `household.consent.owner.body` | Owner's consent screen, body | Your partner will see and edit everything in this household, including every linked bank account, its balances and transactions. Banks they link, you will see. Either of you can leave at any time; you can remove them. The invite goes to the one address you type, works once, and ends after 7 days. | 420 |
| `household.consent.owner.agree` | Owner's consent screen, button | I agree, continue to the address. | 28 |
| `household.invite.email_label` | Invite form, above the address field | Your partner's email address (the one they sign in with). | 60 |
| `household.invite.send` | Invite form, button | Send the invite. | 20 |
| `household.invite.sent` | After sending, above the address | The invite was sent to this address. | 50 |
| `household.invite.email_not_sent` | After sending, when the email could not go | The email did not go; give your partner the code below instead. | 90 |
| `household.invite.code_label` | After sending, above the 6-character code | The code for the app: your partner types it in Settings > Household. | 80 |
| `household.invite.code_once` | After sending, under the code | This code is shown only now. To see a new one, send a new invite. | 80 |
| `household.invite.pending` | Household, an open invite (owner only), above the address | An invite is waiting for this address. | 50 |
| `household.invite.expires` | Open invite, before the date | The invite ends on (date follows). | 30 |
| `household.invite.revoke` | Open invite, button | Cancel this invite. | 24 |
| `household.invite.new` | Open invite, button | Send a new invite (the old one stops working). | 24 |
| `household.join.code_label` | Household, not sharing, above the code field | Have a code from your partner? Type it here to join their household. | 70 |
| `household.join.button` | Under the code field | Join with this code. | 20 |
| `household.consent.partner.title` | Partner's consent screen, heading | Before you join. | 40 |
| `household.consent.partner.body` | Partner's consent screen (by link or code), body | You will see and edit everything in this household, including every linked bank account, its balances and transactions. What you entered on your own account is replaced by the household's, not merged. Banks you link, your partner will see. You can leave at any time; leaving starts you fresh. The owner can remove you. One subscription covers both of you; if you already pay, cancel yours where you bought it. | 520 |
| `household.consent.partner.agree` | Partner's consent screen, button | I agree, join the household. | 28 |
| `household.members.title` | Household, two members, heading | Who is in this household. | 30 |
| `household.members.you` | Members list, the signed-in person | You. | 12 |
| `household.members.partner` | Members list, the other person | Your partner. | 16 |
| `household.role.owner` | Members list, role | Owner (the one who invited). | 12 |
| `household.role.partner` | Members list, role | Partner. | 12 |
| `household.members.joined` | Members list, before the date | Joined (date follows). | 12 |
| `household.leave.button` | Household, button, either member | Leave this household. | 24 |
| `household.leave.confirm.title` | Leave confirmation, heading | Leave the household? | 40 |
| `household.leave.confirm.body` | Leave confirmation, two members | You lose access to the shared data at once and start fresh. Banks you linked leave the household and stay linked to you. If you are the owner, your partner becomes the owner. This cannot be undone; you would need a new invite. | 300 |
| `household.leave.confirm.body_alone` | Leave confirmation, owner with no partner yet | Sharing stops and any open invite is cancelled. Your data stays with you. | 160 |
| `household.leave.confirm.button` | Leave confirmation, button | Leave. | 16 |
| `household.remove.button` | Household, owner only, two members | Remove your partner. | 24 |
| `household.remove.confirm.title` | Remove confirmation, heading | Remove your partner? | 40 |
| `household.remove.confirm.body` | Remove confirmation, body | They lose access to the shared data at once and start fresh. Banks they linked leave the household. This cannot be undone; they would need a new invite. | 240 |
| `household.remove.confirm.button` | Remove confirmation, button | Remove. | 16 |
| `household.billing.covered_by_partner` | Settings, the Flourish Plus card (web) and the Subscription card (store apps), for the partner who does not pay | Your partner's subscription covers you; there is nothing for you to buy or manage. | 110 |
| `household.billing.cancel_extra.stripe` | Household, when both pay, to the one whose extra plan is on the website | Your partner's subscription already covers you. Cancel yours on the website: Settings > Flourish Plus > Manage subscription. | 160 |
| `household.billing.cancel_extra.app_store` | Same, when the extra plan is in the App Store | Your partner's subscription already covers you. Cancel yours in the App Store: Settings > your name > Subscriptions. Apple refunds are Apple's. | 180 |
| `household.billing.cancel_extra.play_store` | Same, when the extra plan is in Google Play | Your partner's subscription already covers you. Cancel yours in Google Play: Payments & subscriptions > Subscriptions. | 160 |
| `household.bank.linked_by_partner` | Settings > Connected Banks, beside a bank the partner linked, in place of Disconnect | Your partner linked this bank; only they can disconnect it. | 40 |
| `household.bank.joint_note` | Settings > Connected Banks, under the list, two members | A joint account linked by both of you counts twice; one of you should link it. | 120 |
| `household.error.invalid_email` | Invite form, error | That is not an email address. | 60 |
| `household.error.own_email` | Invite form, error | That is your own address; invite your partner's. | 60 |
| `household.error.too_many_invites` | Invite form, error | Five invites a day at most; try again tomorrow. | 70 |
| `household.error.household_full` | Invite or join, error | This household already has 2 adults, the most there can be. | 70 |
| `household.error.email_not_confirmed` | Invite or join, error | Confirm your own email address first (the link we sent). | 80 |
| `household.error.invalid` | Join, error | That code or link does not work. Check it, or ask for a new invite. | 80 |
| `household.error.expired` | Join, error | That invite has ended (7 days). Ask for a new one. | 70 |
| `household.error.used` | Join, error | That invite was already used. Ask for a new one. | 70 |
| `household.error.wrong_account` | Join by link, error | That invite is for another address. Sign in with the address it was sent to. | 90 |
| `household.error.in_another_household` | Join, error | You are already in a household. Leave it first. | 70 |
| `household.error.too_many_attempts` | Join, error | Too many tries; wait an hour and try again. | 60 |
| `household.error.generic` | Any household action, error | Something went wrong; nothing changed. Try again. | 70 |
| `household.email.subject` | Invite email, subject | Someone invited you to share their Flourish household (no name). | 70 |
| `household.email.intro` | Invite email, first paragraph | You were invited to share a household on Flourish: you will both see and edit the same money, including linked bank accounts. Nothing happens until you agree in the app. | 260 |
| `household.email.button` | Invite email, the button and the text before the link | Open the invite (on the website). | 30 |
| `household.email.code` | Invite email, before the 6-character code | In the iPhone or Android app, type this code in Settings > Household. | 90 |
| `household.email.expires` | Invite email, before the date | The invite works once and ends on (date follows). | 50 |
| `household.email.ignore` | Invite email, last paragraph | Not expecting this? Ignore it and nothing changes. | 90 |
| `household.email.footer` | Invite email, footer (one line) | Who sent it (Flourish, its address) and the support contact, as the other emails' footers. | 160 |
