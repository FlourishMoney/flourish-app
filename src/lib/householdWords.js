// src/lib/householdWords.js
// -----------------------------------------------------------------------------
// COUPLE MODE: every word the app shows for it, as approved (ChatGPT + Grok, 2026-10-29), word for word.
// Each id, where it shows, the facts it states, the approved line and its limit: docs/product/COUPLE-MODE-WORDS.md.
// The server's email words are in netlify/functions/_lib/household.js INVITE_EMAIL (the same doc).
// tests/householdClient.test.cjs holds the code and the doc to the same lines, and fails on any placeholder.
// -----------------------------------------------------------------------------

export const HOUSEHOLD_WORDS = Object.freeze({
  rowLabel: "Household",
  rowSubNone: "Invite your partner to share it",
  rowSubPending: "Invite sent to your partner",
  rowSubShared: "Shared with your partner",

  intro: "Invite your partner to share this household. You'll both see and edit the same money: Today, bills, paydays, debts, linked bank accounts, goals and the money meeting. Up to 2 adults, and one subscription includes you both.",
  inviteButton: "Invite your partner",
  ownerConsentTitle: "Before you invite your partner",
  ownerConsentBody: "Your partner will see and edit everything in this household, including every linked bank account with its balances and transactions. You'll see any banks they link. Either of you can leave at any time, and you can remove them. The invite goes only to the address you type, works once, and ends after 7 days.",
  ownerConsentAgree: "I agree, continue",
  emailLabel: "Your partner's email (the one they sign in with)",
  sendInvite: "Send invite",
  inviteSent: "Invite sent to:",
  emailNotSent: "The email didn't send. Give your partner the code below instead.",
  codeLabel: "In the app, your partner enters this code in Settings > Household:",
  codeOnce: "This code is shown only once. For a new one, send a new invite.",
  invitePending: "Invite waiting for:",
  inviteExpires: "Ends on",
  revokeInvite: "Cancel invite",
  newInvite: "Send a new invite",

  joinLabel: "Have a code from your partner? Enter it to join their household.",
  joinButton: "Join household",
  partnerConsentTitle: "Before you join",
  partnerConsentBody: "You'll see and edit everything in this household, including every linked bank account with its balances and transactions. What's on your own account now is replaced by the household's, not combined with it. Your partner will see any banks you link. You can leave at any time, and leaving starts you fresh. The owner can remove you. One subscription includes you both; if you already have one, cancel yours where you bought it.",
  partnerConsentAgree: "I agree, join",

  membersTitle: "In this household",
  you: "You",
  yourPartner: "Your partner",
  roleOwner: "Owner",
  rolePartner: "Partner",
  joined: "Joined",

  leaveButton: "Leave household",
  leaveTitle: "Leave this household?",
  leaveBody: "You'll lose access to the shared data right away and start fresh. Banks you linked leave the household and stay linked to you. If you're the owner, your partner becomes the owner. To come back, you'd need a new invite.",
  leaveBodyAlone: "Any open invite is cancelled. Your data stays with you.",
  leaveConfirm: "Leave",
  removeButton: "Remove your partner",
  removeTitle: "Remove your partner?",
  removeBody: "They'll lose access to the shared data right away and start fresh. Banks they linked leave the household. To come back, they'd need a new invite.",
  removeConfirm: "Remove",

  coveredByPartner: "Your partner's subscription includes you. There's nothing for you to buy or manage.",
  extraStripe: "Your partner's subscription already includes you. Cancel yours where you bought it: Settings > Flourish Plus > Manage subscription.",
  extraAppStore: "Your partner's subscription already includes you. To cancel yours, open Settings on your iPhone, tap your name, then Subscriptions. Refund requests are handled by Apple.",
  extraPlayStore: "Your partner's subscription already includes you. To cancel yours, open Google Play, then Payments & subscriptions > Subscriptions.",

  bankLinkedByPartner: "Only your partner can disconnect this",
  bankJointNote: "If you share a joint account, only one of you should link it, or it will be counted twice.",

  errors: Object.freeze({
    invalid_email: "Enter a valid email address.",
    own_email: "That's your own email. Enter your partner's.",
    too_many_invites: "You can send up to 5 invites a day. Try again tomorrow.",
    household_full: "This household already has 2 adults, the most it can have.",
    email_not_confirmed: "Confirm your email first, using the link we sent you.",
    invalid: "That code or link doesn't work. Check it, or ask for a new invite.",
    expired: "That invite ended after 7 days. Ask for a new one.",
    used: "That invite was already used. Ask for a new one.",
    wrong_account: "That invite is for a different email. Sign in with the address it was sent to.",
    in_another_household: "You're already in a household. Leave it first to join this one.",
    too_many_attempts: "Too many tries. Wait an hour, then try again.",
    generic: "Something went wrong and nothing changed. Please try again.",
  }),
});

// The line for a server error code; anything unknown is the generic one.
export function householdErrorLine(code) {
  return HOUSEHOLD_WORDS.errors[code] || HOUSEHOLD_WORDS.errors.generic;
}

// Where an extra (second) subscription is cancelled, by where it was bought.
export function extraSubscriptionLine(provider) {
  if (provider === "app_store") return HOUSEHOLD_WORDS.extraAppStore;
  if (provider === "play_store") return HOUSEHOLD_WORDS.extraPlayStore;
  return provider ? HOUSEHOLD_WORDS.extraStripe : null;
}
