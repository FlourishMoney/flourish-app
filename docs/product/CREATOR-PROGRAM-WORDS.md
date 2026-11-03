# Creator Program: the words

**Approved 2026-11-03** (ChatGPT and Grok agreed): `~/Documents/Flourish/01 Marketing/Creator Program/CREATOR-WORDS-APPROVED-2026-11-03.md`. `src/lib/creatorWords.js` holds each line exactly as it is here, and `tests/creators.test.cjs` holds the two together.

Limits are characters, including spaces. House rules: no em dashes; say "code", not "discount"; no prices; roles only, never a creator's or a customer's name.

| id | where it shows | facts it must state | approved line | limit |
|---|---|---|---|---|
| `creator-signup-label` | Sign-up form on the web, iPhone and Android: the optional field's label, under the password | A creator's code, and that it is optional. | Creator code (optional) | 30 |
| `creator-signup-hint` | Sign-up form: the small line under that field | It tells us which creator sent you. It gives no discount. | Tells us which creator sent you. It doesn't change what you pay. | 90 |
| `creator-code-invalid` | Sign-up form and Settings: error, when the code is refused. Also what anyone sees for an ended creator's code, and what a creator sees for their own code in Settings (sign-up lets that account through with no credit, so it can't be used to test an address): it must not say which | That code doesn't work. Check it, or (at sign-up) leave the field empty. No account was created; nothing changed. | That code doesn't work. Check it, or leave it blank. Nothing changed. | 80 |
| `creator-code-unavailable` | Sign-up form and Settings: error, when the server can't check a code just now | The code couldn't be checked. Nothing changed. Try again; at sign-up, the field can be left empty. | We couldn't check that code just now. Nothing changed. Try again, or leave it blank. | 90 |
| `creator-settings-title` | Settings: the card's title, and the field's name for screen readers. The card shows only while a code can be added | A creator's code. | Creator code | 30 |
| `creator-settings-body` | Settings: the card's line, above the field | If a creator sent you, you can add their code. You have 14 days from sign-up, and only until your first payment. One code per household. It gives no discount. | If a creator sent you, add their code within 14 days of sign-up, before your first payment. One code per household. Price stays the same. | 140 |
| `creator-settings-button` | Settings: the card's button | Add the code. | Add code | 20 |
| `creator-settings-added` | Settings: the line after a code is added, in place of the card | The code was added. | Creator code added. Thanks for telling us who sent you. | 60 |
| `creator-code-closed` | Settings: error, in the rare case the card was open when a code stopped being possible (the 14 days passed, a payment was made, the household already has a code, or this person is a partner) | A code can't be added to this household now. No reason per person, no name. | A creator code can't be added to this household now. | 90 |
