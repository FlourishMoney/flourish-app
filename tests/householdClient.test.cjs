// tests/householdClient.test.cjs
// -----------------------------------------------------------------------------
// COUPLE MODE IN THE APP (docs/product/COUPLE-MODE-SPEC.md): the pure rules (src/lib/household.js), the
// household's saves (src/lib/persistence.js), the screens (src/App.jsx HouseholdSection, Settings), and the words.
//   1  consent is each person's own: one person's AI or Plaid consent never stands for the other's
//   2  two saves at once keep both people's changes (a section only one changed keeps theirs)
//   3  which data a device loads: solo / same / join / left
//   4  the coach: roles only, and the asker's own roles (the partner asking is "you")
//   5  saving over a version: a newer one is reported, not overwritten; an empty blob never replaces the data
//   6  the screens: consent first; roles, never names or addresses; the row only while the server answers
//   7  the old mock is gone; every household word is a placeholder, in one file, listed in the words doc
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf } = require("./_renderApp.cjs");

const ROOT = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const O = "owner-id", P = "partner-id";

(async () => {
  const t = create();
  const H = await import("../src/lib/household.js");
  const PS = await import("../src/lib/persistence.js");
  const CP = await import("../src/lib/coachPrivacy.js");
  const HW = await import("../src/lib/householdWords.js");

  // ── 1. CONSENT IS EACH PERSON'S OWN (audit H3, M6: in their own private row, never in the shared blob) ───
  {
    const keys = { flourish_ai_third_party_consent: "0", flourish_ai_disclosure_seen: "1", flourish_custom_cats: "[\"Pets\"]", flourish_plaid_consented_at: "2026-10-01", flourish_tips_dismissed: "1" };
    const built = H.buildHouseholdBlob({ onboarded: true, slimAppData: { bills: [] }, checkInBonus: 0 }, { householdId: "h1", sideKeys: keys });
    t.eq(built.sideKeys, { flourish_custom_cats: "[\"Pets\"]" }, "1a the blob a member saves carries the shared keys only");
    t.ok(!("personal" in built) && !/consent|disclos|flourish_plan|tips_dismissed/.test(JSON.stringify(built)), "1b …no consent, no plan cache and no section for anyone's own keys");
    t.eq(H.personalKeysOf(keys), { flourish_ai_third_party_consent: "0", flourish_ai_disclosure_seen: "1", flourish_plaid_consented_at: "2026-10-01", flourish_tips_dismissed: "1" },
      "1c this person's own keys, for their own private row");
    // A shared blob that somehow carries someone's consent (written by an old app, or by hand): never applied.
    const tampered = { sideKeys: { flourish_custom_cats: "[]", flourish_ai_third_party_consent: "1" }, personal: { [P]: { flourish_ai_third_party_consent: "1" } } };
    t.eq(H.sideKeysForMember(tampered, { flourish_ai_third_party_consent: "0" }), { flourish_custom_cats: "[]", flourish_ai_third_party_consent: "0" },
      "1d loading the household: the shared keys from the blob, this person's consent from their own row, never consent from the blob");
    t.eq(H.sideKeysForMember(tampered, null), { flourish_custom_cats: "[]" }, "1e …and with no row read, no consent at all comes from the blob");
    t.ok(H.PERSONAL_SIDE_KEYS.includes("flourish_ai_coach_enabled") && H.PERSONAL_SIDE_KEYS.includes("flourish_plaid_consented_at"), "1f the coach switch and the Plaid consent time are personal");
    const m30 = read("supabase", "migrations", "0030_couple_household.sql");
    const sqlKeys = (m30.match(/household_personal_keys\(\)[\s\S]*?array\[([\s\S]*?)\]::text\[\]/) || [])[1] || "";
    t.eq([...sqlKeys.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]), [...H.PERSONAL_SIDE_KEYS], "1g the database's list of personal keys is the app's, in the same order");
    // The private row: read and written for this person only.
    const calls = [];
    const sb = { from(tbl) { const q = { select() { return q; }, eq(c, v) { calls.push([tbl, "eq", c, v]); return q; },
      async maybeSingle() { return { data: { data: { flourish_ai_third_party_consent: "1" } }, error: null }; },
      async upsert(row, o) { calls.push([tbl, "upsert", row, o]); return { error: null }; } }; return q; } };
    t.eq(await PS.fetchPersonalKeys(sb, "me"), { flourish_ai_third_party_consent: "1" }, "1h this person's keys are read from their own private row");
    t.eq((await PS.savePersonalKeys(sb, "me", { flourish_plan: "trial" })).ok, true, "1i …and written there");
    t.eq(calls, [["household_member_private", "eq", "user_id", "me"], ["household_member_private", "upsert", { user_id: "me", data: { flourish_plan: "trial" } }, { onConflict: "user_id" }]],
      "1j …by their own id, nothing else");
    const missing = { from() { const q = { select() { return q; }, eq() { return q; }, async maybeSingle() { return { data: null, error: { code: "PGRST205", message: "Could not find the table" } }; } }; return q; } };
    t.eq(await PS.fetchPersonalKeys(missing, "me"), {}, "1k before 0030 runs there is no private row: nothing, not an error");
    const app = read("src", "App.jsx");
    t.ok(/const personal = await fetchPersonalKeys\(supabase, userId\);/.test(app) && /applyHouseholdBlob\(remoteH\.blob, userId, \{ keepSynced: hhPlan === "same", personal \}\)/.test(app),
      "1l loading a household, the app reads this person's own row and applies their keys from it");
    t.ok(/const mine = await savePersonalKeys\(supabase, userId, personal\);/.test(app) && /personal: personalKeysOf\(sideKeys\), blob: buildHouseholdBlob/.test(app),
      "1m saving, this person's own keys go to their own row and the blob gets the shared ones");
  }

  // ── 2. TWO SAVES AT ONCE ────────────────────────────────────────────────────────────────────────
  {
    const base = { core: { onboarded: true, checkInBonus: 0, appData: { bills: [{ id: "b1", amount: 100 }], goals: [{ id: "g1" }], debts: [] } }, sideKeys: { flourish_streak: "1" } };
    const local = { core: { onboarded: true, checkInBonus: 0, appData: { bills: [{ id: "b1", amount: 120 }], goals: [{ id: "g1" }], debts: [] } }, sideKeys: { flourish_streak: "1" } };
    const remote = { core: { onboarded: true, checkInBonus: 0, appData: { bills: [{ id: "b1", amount: 100 }], goals: [{ id: "g1" }, { id: "g2" }], debts: [] } }, sideKeys: { flourish_streak: "2" }, personal: { [P]: { flourish_plan: "free" } } };
    const m = H.mergeHouseholdBlobs(base, local, remote);
    t.eq(m.core.appData.bills, [{ id: "b1", amount: 120 }], "2a this phone's change to the bills is kept");
    t.eq(m.core.appData.goals, [{ id: "g1" }, { id: "g2" }], "2b …and the other person's new goal too");
    t.eq(m.sideKeys.flourish_streak, "2", "2c a shared key only the other changed keeps their change");
    t.ok(!("personal" in m), "2d someone's own keys found in the server's copy are never carried into a save");
    const both = H.mergeHouseholdBlobs(base, local, { ...remote, core: { ...remote.core, appData: { ...remote.core.appData, bills: [{ id: "b1", amount: 90 }] } } });
    t.eq(both.core.appData.bills, [{ id: "b1", amount: 120 }], "2e both changed the same section: the later save (this one) wins");
    const gone = H.mergeHouseholdBlobs(base, local, { ...remote, core: { ...remote.core, appData: { bills: [{ id: "b1", amount: 100 }], goals: [{ id: "g1" }] } } });
    t.eq(Object.keys(gone.core.appData).sort(), ["bills", "goals"], "2f a section the other person removed stays removed when this phone did not touch it");
    const keep = H.keepSyncedTransactions({ accounts: [{ id: "a1", _item: "i1" }], transactions: [{ id: "m1", account_id: "cash" }] },
      { accounts: [{ id: "a1", _item: "i1" }, { id: "a2", _item: "i2" }], transactions: [{ id: "p1", account_id: "a1" }, { id: "p2", account_id: "a2" }, { id: "m1", account_id: "cash" }] });
    t.eq(keep.transactions.map((x) => x.id), ["p1", "m1"], "2g the bank's transactions this phone holds stay for accounts still in the household, and go with an account that left");
    // A bank account the other side removed (the partner left, taking their bank) while this phone changed accounts:
    // the removal wins, with what was made from it (audit M7).
    const acc = (list, extra = {}) => ({ core: { onboarded: true, checkInBonus: 0, appData: { accounts: list, ...extra } }, sideKeys: {} });
    const withBank = [{ id: "a1", _item: "i1", balance: 10 }, { id: "a2", _item: "i2", balance: 5 }];
    const derived = { liabilities: { credit: [{ account_id: "a2" }, { account_id: "a1" }] }, debts: [{ account_id: "a2", fromBank: true }, { id: "d1", sameAsAccountId: "a2" }], incomeSuggestion: { s: 1 }, bankConnected: true };
    const stripped = H.mergeHouseholdBlobs(acc(withBank, derived), acc([{ id: "a1", _item: "i1", balance: 11 }, withBank[1]], derived), acc([withBank[0]], { ...derived, liabilities: { credit: [{ account_id: "a1" }] }, debts: [{ id: "d1" }] }));
    t.eq(stripped.core.appData.accounts.map((a) => a.id), ["a1"], "2h an account removed on the other side stays removed although this phone changed the accounts (its balance refresh is kept)");
    t.eq([stripped.core.appData.accounts[0].balance, stripped.core.appData.liabilities, stripped.core.appData.debts, "incomeSuggestion" in stripped.core.appData],
      [11, { credit: [{ account_id: "a1" }] }, [{ id: "d1" }], false], "2i …and so do its liabilities, the debt made from it and the link to it, and the cached pay suggestion");
    t.eq(H.removedAccountIds(acc(withBank), acc([withBank[0]])), ["a2"], "2j the accounts removed are those in what this phone last read and not in the server's copy");
    t.eq(H.stripAccounts({ accounts: [{ id: "a2", _item: "i2" }, { id: "m", institution: "Manual" }], bankConnected: true }, ["a2"]).bankConnected, false,
      "2k with no bank left, bankConnected is worked out again");
    const local2 = H.localAfterRemoval({ catOverrides: { p9: "Dining", m1: "Rent" }, depositDecisions: { p9: { reason: "income" }, keep: { reason: "x" } }, loanActivity: [{ id: "l1", account_id: "a2" }, { id: "l2", account_id: "a1" }] },
      { accountIds: ["a2"], transactionIds: ["p9"] });
    t.eq(local2, { nwHistory: [], catOverrides: { m1: "Rent" }, depositDecisions: { keep: { reason: "x" } }, loanActivity: [{ id: "l2", account_id: "a1" }] },
      "2l on this phone: the net-worth history that counted the account starts again, and its loan activity, category corrections and deposit answers go");
    t.ok(/const after = localAfterRemoval\(/.test(read("src", "App.jsx")), "2m …which the app does when it applies a household's data that no longer has the account");
  }

  // ── 3. WHICH DATA A DEVICE LOADS ────────────────────────────────────────────────────────────────
  {
    const plan = (membership, stampId) => H.householdHydratePlan({ membership, stampId });
    t.eq([plan(null, null), plan({ household_id: "h1" }, "h1"), plan({ household_id: "h1" }, null), plan({ household_id: "h2" }, "h1"), plan(null, "h1")],
      ["solo", "same", "join", "join", "left"], "3a not in one: solo; the same one: same; a new one or another phone: join; left or removed: left");
    const appSrc = read("src", "App.jsx");
    const helper = appSrc.slice(appSrc.indexOf("const hydrateHousehold = async"), appSrc.indexOf("// ── Supabase auth session check"));
    t.ok(/const reset = hhPlan === "join" \|\| hhPlan === "left";\n    if \(reset\) \{[\s\S]*clearAllUserLocal\(\);/.test(helper), "3b join or left: this device's data is dropped first");
    t.ok(/reset \? \{ apply: true, pushLocal: false/.test(helper), "3c …and on joining the household's data is loaded, never this device's pushed over it");
    t.ok(/if \(!remoteH\) throw/.test(helper), "3d a member who cannot read the household's row never writes this session");
    const merges = [...appSrc.matchAll(/mergeHouseholdBlobs\(([^,]+),/g)].map((m) => m[1].trim());
    t.ok(merges.length >= 3 && merges.every((b) => b === "cur.base" || b === "hh.base"), `3e every merge is over what this device last read, so a removal on the server wins (${merges.join(", ")})`);
  }

  // ── 4. THE COACH: ROLES, THE ASKER'S OWN ────────────────────────────────────────────────────────
  {
    const profile = { name: "Sam Rivera", partnerName: "Jo", lifeStages: ["selfemployed"], partnerLifeStages: ["t4"], birthYear: "1980", status: "couple" };
    t.eq(H.coachProfileFor(profile, "owner"), profile, "4a the owner asking: the profile as it is");
    const asP = H.coachProfileFor(profile, "partner");
    t.eq([asP.lifeStages, asP.partnerLifeStages, asP.birthYear], [["t4"], ["selfemployed"], ""], "4b the partner asking: their employment is \"you\", the owner's \"your partner\", and the owner's age is not theirs");
    const body = JSON.parse(CP.coachRequestBody({ message: "Should Sam Rivera or Jo pay the card?" }, CP.householdNames(asP)));
    t.eq(body.message, "Should partner or you pay the card?", "4c names the partner types become roles from THEIR side");
    const appSrc = read("src", "App.jsx");
    t.ok(/const profile = coachProfileFor\(data\.profile\|\|\{\}, data\.householdRole\);/.test(appSrc), "4d the coach's context is built from the asker's side");
    t.ok(/setCoachNames\(coachProfileFor\(appData\?\.profile, householdRole\)\);/.test(appSrc), "4e …and so is the register that turns names into roles");
    t.ok(/- Name: not shared; call them "you"/.test(appSrc) && !/Name: \$\{/.test(appSrc), "4f the context still never carries a name");
    t.eq([H.viewerName(profile, "owner"), H.viewerName(profile, "partner"), H.viewerName({ name: "Sam" }, "partner")], ["Sam Rivera", "Jo", ""],
      "4g the screen greets the person using the app by their own name, never the other's");
    t.ok(/Hey \{viewerName\(data\.profile, data\.householdRole\)\|\|"there"\}/.test(appSrc), "4h …on Today");
  }

  // ── 5. SAVING OVER A VERSION ────────────────────────────────────────────────────────────────────
  {
    const calls = [];
    const fake = (answer) => ({ from: (table) => { const q = { _t: table, _f: {},
      select() { return q; }, eq(k, v) { q._f[k] = v; return q; }, update(d) { q._u = d; return q; },
      maybeSingle: async () => answer.read || { data: null, error: null },
      then(res, rej) { calls.push([table, q._u ? "update" : "select", { ...q._f }]); return Promise.resolve(answer.write || { data: [], error: null }).then(res, rej); } }; return q; } });
    const blob = { core: { appData: { bills: [{ id: "b1" }] } } };
    const ok = await PS.saveHouseholdData(fake({ write: { data: [{ version: 8, updated_at: "x" }], error: null } }), "h1", blob, 7);
    t.eq([ok, calls.pop()], [{ ok: true, version: 8, updatedAt: "x" }, ["household_data", "update", { household_id: "h1", version: 7 }]], "5a a save goes only over the version read, and returns the new one");
    t.eq(await PS.saveHouseholdData(fake({ write: { data: [], error: null } }), "h1", blob, 7), { ok: false, conflict: true }, "5b a newer version (or no longer a member): reported, nothing overwritten");
    const empty = { core: { appData: { bills: [] } } };
    t.eq((await PS.saveHouseholdData(fake({ read: { data: { data: blob, updated_at: "x", version: 7 }, error: null } }), "h1", empty, 7)).refused, true, "5c an empty blob never replaces a household's real data");
    t.eq(await PS.readMembership(fake({ read: { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.household_members' in the schema cache" } } }), "u"), null,
      "5d before 0030 runs there is no household: every account goes on as before");
    let threw = false;
    try { await PS.readMembership(fake({ read: { data: null, error: { code: "XX000", message: "upstream" } } }), "u"); } catch { threw = true; }
    t.ok(threw, "5e any other failed read throws, so the save gate stays closed");
  }

  // ── 6. THE SCREENS ──────────────────────────────────────────────────────────────────────────────
  {
    const app = loadApp(["HouseholdSection", "Settings"]);
    const W = HW.HOUSEHOLD_WORDS;
    const noop = () => {};
    const render = (props) => textOf(app.render(app.h(app.HouseholdSection, { onInvite: noop, onRevoke: noop, onAccept: noop, onLeave: noop, onRemove: noop, onClearLinkToken: noop, ...props })));
    const none = render({ info: { enabled: true, household: null } });
    t.ok(none.includes(W.intro) && none.includes(W.inviteButton) && none.includes(W.joinLabel), "6a not in a household: what it is, Invite, and a code to join with");
    t.ok(!none.includes(W.ownerConsentBody) && !none.includes(W.emailLabel), "6b …no address field before the owner's consent");
    const link = render({ info: { enabled: true, household: null }, linkToken: "x".repeat(43) });
    t.ok(link.includes(W.partnerConsentTitle) && link.includes(W.partnerConsentBody) && link.includes(W.partnerConsentAgree), "6c a link opens on the partner's consent screen");
    const two = render({ info: { enabled: true, household: { role: "partner", members: [{ role: "partner", you: true, joined_at: "2026-10-29T10:00:00Z" }, { role: "owner", you: false, joined_at: "2026-10-28T10:00:00Z" }], invite: null, billing: { your_extra: "app_store" } } } });
    t.ok(two.includes(W.you) && two.includes(W.yourPartner) && two.includes(W.roleOwner) && two.includes(W.leaveButton) && !two.includes(W.removeButton),
      "6d two members: you and your partner by role; the partner may leave, only the owner removes");
    t.ok(two.includes(W.extraAppStore), "6e a partner who also pays in the App Store is told where to cancel theirs");
    const owner = render({ info: { enabled: true, household: { role: "owner", members: [{ role: "owner", you: true }, { role: "partner", you: false }], invite: null } } });
    t.ok(owner.includes(W.removeButton) && owner.includes(W.leaveButton) && !owner.includes(W.inviteButton), "6f the owner of a full household: remove or leave, no third invite");
    const pending = render({ info: { enabled: true, household: { role: "owner", members: [{ role: "owner", you: true }], invite: { email: "partner@example.test", expires_at: "2026-11-05T12:00:00Z" } } } });
    const pendingHtml = app.render(app.h(app.HouseholdSection, { onInvite: noop, onRevoke: noop, onAccept: noop, onLeave: noop, onRemove: noop, onClearLinkToken: noop,
      info: { enabled: true, household: { role: "owner", members: [{ role: "owner", you: true }], invite: { email: "partner@example.test", expires_at: "2026-11-05T12:00:00Z" } } } }));
    t.ok(pending.includes(W.invitePending) && pending.includes("partner@example.test") && pending.includes(`${W.inviteExpires} November 5, 2026`) && pending.includes(W.revokeInvite) && !/data-household-code/.test(pendingHtml),
      "6g an open invite: to whom, until when, a way to cancel it, and never its code again");
    const settingsText = (info) => textOf(app.render(app.h(app.Settings, { data: { profile: { name: "Sam" }, accounts: [], bills: [], debts: [], goals: [] }, setAppData: noop, setScreen: noop, onClose: noop,
      household: { info, linkToken: null, onInvite: noop, onRevoke: noop, onAccept: noop, onLeave: noop, onRemove: noop, onClearLinkToken: noop } })));
    const on = settingsText({ enabled: true, household: null });
    t.ok(on.includes(`${W.rowLabel} ${W.rowSubNone}`), "6h Settings shows Household while the server answers for it");
    t.ok([settingsText({ enabled: false }), settingsText(null)].every((x) => !x.includes(W.rowSubNone) && !x.includes(W.rowSubPending) && !x.includes(W.rowSubShared)),
      "6i …and nothing at all while it is off or not yet asked");
    const covered = textOf(app.render(app.h(app.Settings, { data: { profile: {}, accounts: [], bills: [], debts: [], goals: [] }, setAppData: noop, setScreen: noop, onClose: noop,
      billingUi: { show: true, mode: "manage" }, onOpenUpgrade: noop, coveredByPartner: true })));
    t.ok(covered.includes(W.coveredByPartner) && !covered.includes("Manage subscription") && !covered.includes("See plans"), "6j covered by the partner: told so, with nothing to manage or buy");
  }

  // ── 7. THE OLD MOCK IS GONE; THE WORDS ──────────────────────────────────────────────────────────
  {
    const src = fs.readdirSync(path.join(ROOT, "src", "lib")).map((f) => read("src", "lib", f)).join("\n") + read("src", "App.jsx");
    t.ok(!/FLRSH/.test(src), "7a no made-up join code anywhere in the app");
    t.ok(!/HOUSEHOLD_ENABLED/.test(src) && !/householdCode|setHousehold\(/.test(src), "7b no mock household tab, flag or state");
    // The approved words (ChatGPT + Grok, 2026-10-29), held to docs/product/COUPLE-MODE-WORDS.md word for word.
    const KEY_IDS = {
    "rowLabel": "settings.household.row",
    "rowSubNone": "settings.household.sub.none",
    "rowSubPending": "settings.household.sub.pending",
    "rowSubShared": "settings.household.sub.shared",
    "intro": "household.intro",
    "inviteButton": "household.invite.button",
    "ownerConsentTitle": "household.consent.owner.title",
    "ownerConsentBody": "household.consent.owner.body",
    "ownerConsentAgree": "household.consent.owner.agree",
    "emailLabel": "household.invite.email_label",
    "sendInvite": "household.invite.send",
    "inviteSent": "household.invite.sent",
    "emailNotSent": "household.invite.email_not_sent",
    "codeLabel": "household.invite.code_label",
    "codeOnce": "household.invite.code_once",
    "invitePending": "household.invite.pending",
    "inviteExpires": "household.invite.expires",
    "revokeInvite": "household.invite.revoke",
    "newInvite": "household.invite.new",
    "joinLabel": "household.join.code_label",
    "joinButton": "household.join.button",
    "partnerConsentTitle": "household.consent.partner.title",
    "partnerConsentBody": "household.consent.partner.body",
    "partnerConsentAgree": "household.consent.partner.agree",
    "membersTitle": "household.members.title",
    "you": "household.members.you",
    "yourPartner": "household.members.partner",
    "roleOwner": "household.role.owner",
    "rolePartner": "household.role.partner",
    "joined": "household.members.joined",
    "leaveButton": "household.leave.button",
    "leaveTitle": "household.leave.confirm.title",
    "leaveBody": "household.leave.confirm.body",
    "leaveBodyAlone": "household.leave.confirm.body_alone",
    "leaveConfirm": "household.leave.confirm.button",
    "removeButton": "household.remove.button",
    "removeTitle": "household.remove.confirm.title",
    "removeBody": "household.remove.confirm.body",
    "removeConfirm": "household.remove.confirm.button",
    "coveredByPartner": "household.billing.covered_by_partner",
    "extraStripe": "household.billing.cancel_extra.stripe",
    "extraAppStore": "household.billing.cancel_extra.app_store",
    "extraPlayStore": "household.billing.cancel_extra.play_store",
    "bankLinkedByPartner": "household.bank.linked_by_partner",
    "bankJointNote": "household.bank.joint_note",
    "errors.invalid_email": "household.error.invalid_email",
    "errors.own_email": "household.error.own_email",
    "errors.too_many_invites": "household.error.too_many_invites",
    "errors.household_full": "household.error.household_full",
    "errors.email_not_confirmed": "household.error.email_not_confirmed",
    "errors.invalid": "household.error.invalid",
    "errors.expired": "household.error.expired",
    "errors.used": "household.error.used",
    "errors.wrong_account": "household.error.wrong_account",
    "errors.in_another_household": "household.error.in_another_household",
    "errors.too_many_attempts": "household.error.too_many_attempts",
    "errors.generic": "household.error.generic"
    };
    const code = Object.fromEntries(Object.entries(KEY_IDS).map(([k, id]) => [id, k.startsWith("errors.") ? HW.HOUSEHOLD_WORDS.errors[k.slice(7)] : HW.HOUSEHOLD_WORDS[k]]));
    const L = await (async () => { const p = require.resolve("../netlify/functions/_lib/household.js"); delete require.cache[p]; return require(p); })();
    for (const k of ["subject", "intro", "button", "code", "expires", "ignore"]) code[`household.email.${k}`] = L.INVITE_EMAIL[k];
    code["household.email.footer"] = L.INVITE_EMAIL.footer.join(" ");
    const keys = Object.keys(HW.HOUSEHOLD_WORDS).filter((k) => k !== "errors").length + Object.keys(HW.HOUSEHOLD_WORDS.errors).length;
    t.eq([keys, Object.keys(KEY_IDS).length, Object.keys(code).length], [57, 57, 64], "7c 57 lines in the app and 7 in the email, every one known by its id");
    const doc = read("docs", "product", "COUPLE-MODE-WORDS.md");
    const rows = [...doc.matchAll(/^\| `([a-z0-9_.]+)` \| ([^|]+) \| ([^|]+) \| ([^|]+) \| (\d+) \|$/gm)];
    t.eq([rows.length, new Set(rows.map((r) => r[1])).size], [64, 64], "7d the doc lists 64 lines, each id once");
    const approved = Object.fromEntries(rows.map((r) => [r[1], r[4].trim()]));
    t.eq(Object.keys(code).filter((id) => code[id] !== approved[id]), [], "7e every line in the code is its approved line in the doc, word for word");
    t.eq(rows.filter((r) => !(r[2].trim() && r[3].trim() && r[4].trim().length <= Number(r[5]))).map((r) => r[1]), [], "7f every row says where it shows and its facts, and its line is within its limit");
    t.ok(Object.values(code).every((w) => typeof w === "string" && w.trim() && !/\[WORDS:/.test(w)) && !/\[WORDS:/.test(doc), "7g no placeholder is left in the code's lines or in the doc");
    t.ok(!/\u2014/.test(Object.values(code).join(" ")), "7g2 no em dash in any household line (the dash rule)");
    const app = read("src", "App.jsx");
    t.ok(!/\[WORDS:/.test(app), "7h no placeholder is written into App.jsx itself: the lines come from lib/householdWords.js");
    const libDir = path.join(ROOT, "src", "lib");
    const housed = fs.readdirSync(libDir).filter((f) => /household/i.test(f) && /\[WORDS:/.test(read("src", "lib", f)));
    const server = ["household.js", "_lib/household.js"].filter((f) => /\[WORDS:\s*[a-z]/.test(read("netlify", "functions", ...f.split("/"))));
    t.eq([housed, server], [[], []], "7i no household file in src/lib or netlify/functions carries a placeholder");
  }

  t.summary("householdClient.test");
})();
