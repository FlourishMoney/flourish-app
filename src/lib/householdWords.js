// src/lib/householdWords.js
// -----------------------------------------------------------------------------
// COUPLE MODE: every word the app shows for it, and ONLY placeholders until Amanda approves them.
// Each id, where it shows, the facts it must state and its limit: docs/product/COUPLE-MODE-WORDS.md.
// The server's email words are in netlify/functions/_lib/household.js INVITE_EMAIL (the same doc).
// tests/householdClient.test.cjs fails the gate if a household line is written anywhere but here.
// -----------------------------------------------------------------------------

const W = (id) => `[WORDS: ${id}]`;

export const HOUSEHOLD_WORDS = Object.freeze({
  rowLabel: W("settings.household.row"),
  rowSubNone: W("settings.household.sub.none"),
  rowSubPending: W("settings.household.sub.pending"),
  rowSubShared: W("settings.household.sub.shared"),

  intro: W("household.intro"),
  inviteButton: W("household.invite.button"),
  ownerConsentTitle: W("household.consent.owner.title"),
  ownerConsentBody: W("household.consent.owner.body"),
  ownerConsentAgree: W("household.consent.owner.agree"),
  emailLabel: W("household.invite.email_label"),
  sendInvite: W("household.invite.send"),
  inviteSent: W("household.invite.sent"),
  emailNotSent: W("household.invite.email_not_sent"),
  codeLabel: W("household.invite.code_label"),
  codeOnce: W("household.invite.code_once"),
  invitePending: W("household.invite.pending"),
  inviteExpires: W("household.invite.expires"),
  revokeInvite: W("household.invite.revoke"),
  newInvite: W("household.invite.new"),

  joinLabel: W("household.join.code_label"),
  joinButton: W("household.join.button"),
  partnerConsentTitle: W("household.consent.partner.title"),
  partnerConsentBody: W("household.consent.partner.body"),
  partnerConsentAgree: W("household.consent.partner.agree"),

  membersTitle: W("household.members.title"),
  you: W("household.members.you"),
  yourPartner: W("household.members.partner"),
  roleOwner: W("household.role.owner"),
  rolePartner: W("household.role.partner"),
  joined: W("household.members.joined"),

  leaveButton: W("household.leave.button"),
  leaveTitle: W("household.leave.confirm.title"),
  leaveBody: W("household.leave.confirm.body"),
  leaveBodyAlone: W("household.leave.confirm.body_alone"),
  leaveConfirm: W("household.leave.confirm.button"),
  removeButton: W("household.remove.button"),
  removeTitle: W("household.remove.confirm.title"),
  removeBody: W("household.remove.confirm.body"),
  removeConfirm: W("household.remove.confirm.button"),

  coveredByPartner: W("household.billing.covered_by_partner"),
  extraStripe: W("household.billing.cancel_extra.stripe"),
  extraAppStore: W("household.billing.cancel_extra.app_store"),
  extraPlayStore: W("household.billing.cancel_extra.play_store"),

  bankLinkedByPartner: W("household.bank.linked_by_partner"),
  bankJointNote: W("household.bank.joint_note"),

  errors: Object.freeze({
    invalid_email: W("household.error.invalid_email"),
    own_email: W("household.error.own_email"),
    too_many_invites: W("household.error.too_many_invites"),
    household_full: W("household.error.household_full"),
    email_not_confirmed: W("household.error.email_not_confirmed"),
    invalid: W("household.error.invalid"),
    expired: W("household.error.expired"),
    used: W("household.error.used"),
    wrong_account: W("household.error.wrong_account"),
    in_another_household: W("household.error.in_another_household"),
    too_many_attempts: W("household.error.too_many_attempts"),
    generic: W("household.error.generic"),
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
