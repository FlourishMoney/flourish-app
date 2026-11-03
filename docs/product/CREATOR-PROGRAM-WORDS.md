# Creator Program: the words (NOT YET WRITTEN)

**All of these are still to come.** Each line in `src/lib/creatorWords.js` is its own placeholder until it is approved. The production web build and every store build refuse to ship while one is left (`scripts/check-pending-words.mjs`). `tests/creators.test.cjs` holds this list and the code together.

Limits are characters, including spaces. House rules: no em dashes; say "code", not "discount"; no prices; roles only, never a creator's or a customer's name.

| id | where it shows | facts it must state | approved line | limit |
|---|---|---|---|---|
| `creator-signup-label` | Sign-up form on the web, iPhone and Android: the optional field's label, under the password | A creator's code, and that it is optional. | [WORDS: creator-signup-label] | 30 |
| `creator-signup-hint` | Sign-up form: the small line under that field | It tells us which creator sent you. It gives no discount. | [WORDS: creator-signup-hint] | 90 |
| `creator-code-invalid` | Sign-up form and Settings: error, when the code is refused. Also what a creator sees for their own code, and anyone for an ended creator's: it must not say which | That code doesn't work. Check it, or (at sign-up) leave the field empty. No account was created; nothing changed. | [WORDS: creator-code-invalid] | 80 |
| `creator-code-unavailable` | Sign-up form and Settings: error, when the server can't check a code just now | The code couldn't be checked. Nothing changed. Try again; at sign-up, the field can be left empty. | [WORDS: creator-code-unavailable] | 90 |
| `creator-settings-title` | Settings: the card's title, and the field's name for screen readers. The card shows only while a code can be added | A creator's code. | [WORDS: creator-settings-title] | 30 |
| `creator-settings-body` | Settings: the card's line, above the field | If a creator sent you, you can add their code. You have 14 days from sign-up, and only until your first payment. One code per household. It gives no discount. | [WORDS: creator-settings-body] | 140 |
| `creator-settings-button` | Settings: the card's button | Add the code. | [WORDS: creator-settings-button] | 20 |
| `creator-settings-added` | Settings: the line after a code is added, in place of the card | The code was added. | [WORDS: creator-settings-added] | 60 |
| `creator-code-closed` | Settings: error, in the rare case the card was open when a code stopped being possible (the 14 days passed, a payment was made, the household already has a code, or this person is a partner) | A code can't be added to this household now. No reason per person, no name. | [WORDS: creator-code-closed] | 90 |
