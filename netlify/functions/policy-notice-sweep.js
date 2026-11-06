/**
 * Flourish — the privacy policy notice's one-time send
 * netlify/functions/policy-notice-sweep.js   (scheduled every 15 minutes, netlify.toml; migration 0040)
 *
 * OFF UNLESS POLICY_NOTICE_SEND IS SET. Unset, or anything else: the run reads, sends and writes nothing.
 *   POLICY_NOTICE_SEND=dry-run   logs the recipient count and one rendered copy. Sends nothing, writes nothing.
 *   POLICY_NOTICE_SEND=send      needs the newsletter_launch row. Sends in batches until none are owed. Then unset it.
 *
 * WHO. Every account that existed when the launch row was added, with an address, except the screenshot and App Review accounts
 * and anyone on policy_notice_opt_outs (added by hand when they reply; the insert is in migration 0040).
 * ONCE. An account is claimed in policy_notice_sends before its email goes, and one claim per account is all the table allows. A
 * failed send keeps its row and is never retried here: a failure stops the run so a person can look.
 * LOGS: counts and the rendered words only. Never an address or an account id.
 */
"use strict";
const { getAdminClient } = require("./_lib/auth");
const { NOTICE_ID, NO_DATE, FROM, SUBJECT, dateLabel, noticeText, noticePayload, isSampleAccount, sendNotice } = require("./_lib/policyNotice");

const PER_RUN_CAP = 25;
const RUN_BUDGET_MS = 20000;
const PAGE = 5000;
const FOREVER = "9999-12-31T00:00:00Z";

async function launchRow(admin) {
  const { data, error } = await admin.from("newsletter_launch").select("live_on,created_at").limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function pending(admin, before) {
  const { data, error } = await admin.rpc("policy_notice_pending", { p_notice: NOTICE_ID, p_before: before, p_limit: PAGE });
  if (error) throw error;
  return data || [];
}

async function finish(admin, userId, status, now) {
  const { error } = await admin.from("policy_notice_sends").update({ status, finished_at: now().toISOString() }).eq("notice", NOTICE_ID).eq("user_id", userId);
  if (error) console.error("[policy-notice] record not updated");
}

async function run({ mode, admin, send = sendNotice, now = () => new Date(), log = console.log }) {
  if (mode !== "dry-run" && mode !== "send") return { mode: "off" };
  let row;
  try { row = await launchRow(admin); } catch { console.error("[policy-notice] launch row unreadable"); return { mode, stopped: "launch_row" }; }
  const date = row ? dateLabel(row.live_on) : null;
  if (mode === "send" && !date) { console.error("[policy-notice] no launch row: nothing sent"); return { mode, stopped: "no_launch_row" }; }
  // Words still to come (a "[WORDS: …]" placeholder): nothing is claimed or sent, so no account loses its notice to it.
  if (mode === "send" && /\[WORDS:/.test(noticeText(date))) { console.error("[policy-notice] words still to come: nothing sent"); return { mode, stopped: "pending_words" }; }

  let owed;
  try { owed = await pending(admin, row ? row.created_at : FOREVER); } catch { console.error("[policy-notice] recipients unreadable"); return { mode, stopped: "recipients" }; }
  const samples = owed.filter((a) => isSampleAccount(a.email));
  const notSample = owed.filter((a) => !isSampleAccount(a.email));
  const people = notSample.filter((a) => a.opted_out !== true);
  const skipped = samples.length;
  const optedOut = notSample.length - people.length;

  if (mode === "dry-run") {
    log(`[policy-notice] dry run: ${people.length} recipients (${people.filter((a) => a.confirmed).length} confirmed, ${people.filter((a) => !a.confirmed).length} unconfirmed), ${skipped} sample accounts left out, ${optedOut} opted out; nothing sent`);
    log(`[policy-notice] from: ${FROM}\n[policy-notice] subject: ${SUBJECT}\n${noticeText(date || NO_DATE)}`);
    return { mode, recipients: people.length, skipped, optedOut, sent: 0 };
  }

  for (const a of samples) await admin.rpc("policy_notice_claim", { p_notice: NOTICE_ID, p_user_id: a.user_id, p_status: "skipped_sample" });
  const started = now().getTime();
  let sent = 0, failed = 0;
  for (const a of people) {
    if (sent >= PER_RUN_CAP || now().getTime() - started > RUN_BUDGET_MS) break;
    const { data: claimed, error } = await admin.rpc("policy_notice_claim", { p_notice: NOTICE_ID, p_user_id: a.user_id });
    if (error) { console.error("[policy-notice] claim failed: stopping"); return { mode, sent, failed, stopped: "claim" }; }
    if (claimed !== true) continue;                 // another run has it: it is not this run's to send
    const ok = await send(noticePayload(a.email, date), a.user_id);
    await finish(admin, a.user_id, ok ? "sent" : "failed", now);
    if (!ok) { failed += 1; break; }                // never retried here, and no more until someone has looked
    sent += 1;
  }
  log(`[policy-notice] sent ${sent}, failed ${failed}, ${Math.max(0, people.length - sent - failed)} still owed`);
  return { mode, sent, failed, owed: Math.max(0, people.length - sent - failed) };
}

exports.handler = async () => {
  const mode = process.env.POLICY_NOTICE_SEND;
  if (mode !== "dry-run" && mode !== "send") return { statusCode: 200, body: "" };
  try { await run({ mode, admin: getAdminClient() }); } catch { console.error("[policy-notice] failed"); }
  return { statusCode: 200, body: "" };
};
exports._test = { run, PER_RUN_CAP };
