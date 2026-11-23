/**
 * Flourish Money — Plaid API Proxy
 * netlify/functions/plaid.js
 *
 * Actions: create_link_token | exchange_token | get_accounts | get_transactions
 *          get_investments | get_liabilities | remove_item
 *
 * Env vars (Netlify → Site Settings → Environment Variables):
 *   PLAID_CLIENT_ID  — your Plaid client ID
 *   PLAID_SECRET     — your Plaid secret
 *   PLAID_ENV        — sandbox | development | production
 */

"use strict";

const { getUserFromRequest, getAdminClient, getUserPlan, statusUnavailable, ENFORCE_PLAN_LIMITS } = require("./_lib/auth");

// Sprint Z2 #15: reject absurdly large bodies (cheap DoS guard). Larger than coach.js's 100KB because
// enrich_transactions / migrate_items legitimately carry up to ~500 transactions or several item tokens.
const MAX_BODY_BYTES = 200000;

const PLAID_BASE = {
  sandbox:     "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production:  "https://production.plaid.com",
};

const { corsHeadersFor } = require("./_lib/cors");
const { stripeGet, stripeDelete } = require("./_lib/stripeApi");
const { liveSubscriptionsFor } = require("./_lib/stripeLive");
const { bankLimitFor, overAfterAdding, limitBody, REFUSED } = require("./_lib/bankLimits");
const { planWords } = require("./_lib/planWords");
const plusAddon = require("./_lib/plusAddon");
const { emailKey, emailRef } = require("./_lib/logSafe");
const household = require("./_lib/household");
// PLUS, round 2 of the review: a bank's holdings kept privately on the server (migration 0055).
const holdingsStore = require("./_lib/plusHoldingsStore");
const { revokeForAccount: revokeAppleTokens, logAppleConfigOnce } = require("./_lib/appleTokens");

// Plaid REST wrapper — 8s timeout so we never exceed Netlify's 10s limit
async function plaid(endpoint, body) {
  const env  = (process.env.PLAID_ENV || "sandbox").trim().toLowerCase();
  const base = PLAID_BASE[env] || PLAID_BASE.sandbox;

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 7500); // Sprint Z #17: leave headroom under Netlify's 10s function limit

  let res;
  try {
    res = await fetch(`${base}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type":    "application/json",
        "PLAID-CLIENT-ID": (process.env.PLAID_CLIENT_ID || "").trim(),
        "PLAID-SECRET":    (process.env.PLAID_SECRET || "").trim(),
        "Plaid-Version":   "2020-09-14",
      },
      body:   JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const data = await res.json();
  if (!res.ok) {
    const err     = new Error(data.error_message || data.display_message || "Plaid API error");
    err.plaid     = data;
    err.errorCode = data.error_code;
    throw err;
  }
  return data;
}

// A NEW BANK THAT WAS REFUSED IS REMOVED AT PLAID, so nothing is left connected or billed (review 2026-11-22, M2). Three
// tries. One that still cannot be removed has no row here (its token is never kept for a bank the person was refused),
// so one error line names the item, never the token, for it to be removed by hand in Plaid's dashboard.
const REMOVE_TRIES = 3;
// Plaid saying it no longer knows the Item (or its token) is the same as removed: there is nothing left there to bill.
const goneAtPlaid = (e) => /ITEM_NOT_FOUND|INVALID_ACCESS_TOKEN/.test(String((e && (e.errorCode || e.message)) || ""));
async function removeRefusedItem(access_token, item_id, where) {
  let last = null;
  for (let i = 0; i < REMOVE_TRIES; i++) {
    try { await plaid("/item/remove", { access_token }); return true; }
    catch (e) { if (goneAtPlaid(e)) return true; last = e; if (i < REMOVE_TRIES - 1) await new Promise((r) => setTimeout(r, 150 * (i + 1))); }
  }
  console.error(`[${where}] /item/remove failed ${REMOVE_TRIES} times: item ${item_id} is still live at Plaid, remove it by hand:`, (last && (last.errorCode || last.message)) || "error");
  return false;
}

// …and then its row goes. Round 2 (H3, "the clean-up can fail"): the delete used to be tried once, and a row that did not
// go was left standing for a bank that no longer exists at Plaid. Now up to three tries, like the removal above; a row
// that still will not go is named in one error line, as before.
async function removeRefusedRow(admin, user_id, item_id, where) {
  let last = null;
  for (let i = 0; i < REMOVE_TRIES; i++) {
    try { await household.disconnectItem(admin, user_id, item_id); return true; }
    catch (e) { last = e; if (i < REMOVE_TRIES - 1) await new Promise((r) => setTimeout(r, 150 * (i + 1))); }
  }
  console.error(`[${where}: row delete failed]`, item_id, (last && last.message) || "error");
  return false;
}

// A NEW BANK THAT IS THE ONE PAST THE LIMIT IS MARKED REFUSED FIRST (round 3 of the review: NEW-3, and M3 "a failed
// rollback must not return success"). The mark is one quick write: the bank stops counting toward every limit at
// once, so a request whose bank is inside the limit never has to wait for Plaid, and the refusal no longer depends on
// the removal working. The row then keeps the token only until the bank is removed at Plaid and the row deleted; if
// either does not finish now, the row stays marked (never listed, never counted) and finishRefusedBanks does it later.
async function markRefused(admin, user_id, item_id, where) {
  for (let i = 0; i < REMOVE_TRIES; i++) {
    try {
      const { error } = await admin.from("plaid_items").update({ status: REFUSED, updated_at: new Date().toISOString() }).eq("user_id", user_id).eq("item_id", item_id);
      if (!error) return true;
    } catch (e) { /* tried again */ }
    if (i < REMOVE_TRIES - 1) await new Promise((r) => setTimeout(r, 100 * (i + 1)));
  }
  // Round 4 (R4-2): the caller must NOT go on as if it were refused. Nothing is removed and the bank stays an ordinary
  // connected row (listed, counted), so it can be found: by this line, by the count being past the limit, and by the
  // person, who can disconnect it.
  console.error(`[${where}] could not mark the refused bank; it stays connected and is past the limit:`, item_id);
  return false;
}
// …and the rows still marked refused (their removal did not finish) are finished when their owner's banks are next
// listed: removed at Plaid (one that Plaid no longer knows is already gone), then the row. Best effort and bounded: a
// bank that still will not go stays marked for the next time. Never throws.
const FINISH_AT_MOST = 2;
async function finishRefusedBanks(admin, user_id, rows) {
  for (const r of (rows || []).slice(0, FINISH_AT_MOST)) {
    try {
      const { data: full, error } = await admin.from("plaid_items").select("access_token, status").eq("user_id", user_id).eq("item_id", r.item_id).maybeSingle();
      if (error || !full || full.status !== REFUSED) continue;
      let gone = false;
      try { await plaid("/item/remove", { access_token: full.access_token }); gone = true; }
      catch (e) { gone = goneAtPlaid(e); }
      if (gone) await household.disconnectItem(admin, user_id, r.item_id);
    } catch (e) { console.error("[refused bank] not finished:", r.item_id, (e && e.message) || "error"); }
  }
}

exports.handler = async (event) => {
  logAppleConfigOnce("plaid");   // names only: whether this instance can sign for Apple (account deletion revokes with it)
  // Phase D2: per-request CORS (origin-aware). Inner references can keep using CORS.
  const CORS = corsHeadersFor(event);
  const ok = (data) => ({ statusCode: 200, headers: CORS, body: JSON.stringify(data) });
  const e400 = (msg) => ({ statusCode: 400, headers: CORS, body: JSON.stringify({ error: msg }) });

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  // Sprint Z2 #15: size guard BEFORE JSON.parse (mirrors coach.js). event.body is a string here.
  if ((event.body || "").length > MAX_BODY_BYTES) {
    return { statusCode: 413, headers: CORS, body: JSON.stringify({ error: "Request too large" }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
    console.error("[Plaid] missing PLAID_CLIENT_ID / PLAID_SECRET env vars");
    return {
      statusCode: 500, headers: CORS,
      body: JSON.stringify({ error: "Service temporarily unavailable." }),
    };
  }

  const { action } = body;
  // balance-truth: whose bank this request reached and its stored status (resolveAccessToken fills it), for the catch.
  const reqCtx = {};

  try {
    // 1. create_link_token — auth-required (Tier 1.3). Every mint (new or
    // update-mode) happens after login, so the whole action is gated. The Plaid
    // client_user_id is the authenticated user_id (stable per-user, improves
    // Plaid's duplicate-account detection).
    if (action === "create_link_token") {
      const { user_id, error: authError } = await getUserFromRequest(event);
      if (!user_id) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: authError || "unauthorized" }) };

      const country = body.country === "US" ? "US" : "CA";
      const WEBHOOK_URL = "https://flourishmoney.app/.netlify/functions/plaid-webhook";
      // Every link token, new or update-mode, names its country and the same redirect address. Plaid requires
      // country_codes on update mode too: without it /link/token/create answers 400 MISSING_FIELDS and a bank whose
      // sign-in ran out (ITEM_LOGIN_REQUIRED) can never be reconnected (Plaid logs, Scotiabank, Nov 10 2026).
      const COUNTRY_CODES = [country];
      const REDIRECT_URI = "https://flourishmoney.app";

      // BANK CONNECTION LIMITS (behind PLUS_ENABLED, _lib/bankLimits.js): asked before Plaid opens, so nobody signs in to a
      // bank only to be refused after. Only a NEW bank: a reconnect (item_id, Plaid's update mode) is never limited.
      if (!body.item_id) {
        const lim = await bankLimitFor(getAdminClient(), user_id);
        if (lim && lim.unavailable) return statusUnavailable(CORS);
        if (lim && !lim.allowed) return { statusCode: 402, headers: CORS, body: JSON.stringify(limitBody(lim)) };
      }

      // Update-mode: re-link an existing item. Verify ownership and read the
      // access_token server-side (never from the client).
      let updateAccessToken = null;
      if (body.item_id) {
        const admin = getAdminClient();
        const { data, error } = await admin
          .from("plaid_items")
          .select("access_token")
          .eq("user_id", user_id)
          .eq("item_id", body.item_id)
          .single();
        if (error || !data) {
          return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "item not found for this user" }) };
        }
        updateAccessToken = data.access_token;
      }

      const isUpdate = !!updateAccessToken;
      const linkBody = isUpdate
        ? {
            user:         { client_user_id: user_id },
            client_name:   "Flourish Money",
            access_token:  updateAccessToken,
            country_codes: COUNTRY_CODES,
            language:      "en",
            redirect_uri:  REDIRECT_URI,
            webhook:       WEBHOOK_URL,
          }
        : {
            user:              { client_user_id: user_id },
            client_name:       "Flourish Money",
            // Only `transactions` is REQUIRED — every depository (chequing/savings) account
            // supports it, so deposit-only users (e.g. Scotiabank with no cards/investments) can
            // link. `investments` and `liabilities` are OPTIONAL: Plaid still shows the institution
            // and lets the user link, extracting+billing those products only when the chosen
            // account type supports them. Listing them under required `products` made Plaid reject
            // any user whose accounts didn't support EVERY product ("Connectivity not supported").
            products:          ["transactions"],
            // PLUS (2026-11-10): Investments is a subscription Plaid bills every month for an Item once it is on it, "even
            // if no API calls are made" (plaid.com/docs/account/billing). Behind PLUS_ENABLED it is asked for as an
            // ADDITIONAL CONSENTED product instead, which Plaid bills only from the first /investments/holdings/get call
            // (plaid.com/docs/link/initializing-products), and that call is made only for a household with Plus
            // (get_investments below). Everyone consents once, so buying Plus later needs no new sign-in.
            ...(plusAddon.plusEnabledFor(user_id)
              ? { optional_products: ["liabilities"], additional_consented_products: ["investments"] }
              : { optional_products: ["investments", "liabilities"] }),
            country_codes:     COUNTRY_CODES,
            language:          "en",
            transactions:      { days_requested: 90 },
            redirect_uri:      REDIRECT_URI,
            webhook:           WEBHOOK_URL,
          };
      const data = await plaid("/link/token/create", linkBody);
      return ok({ link_token: data.link_token });
    }

    // 2. exchange_token — auth-required (Tier 1.2): exchange the public_token AND
    // persist the access_token server-side in ONE action. The token NEVER returns
    // to the client; callers reference the item by item_id afterward.
    if (action === "exchange_token") {
      const { user_id, error: authError } = await getUserFromRequest(event);
      if (!user_id) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: authError || "unauthorized" }) };
      const { public_token, institution_name = "Your Bank", institution_id = null } = body;
      if (!public_token) return e400("public_token required");

      // Sprint Q item 11: free tier connects ONE bank; multi-bank is a paid feature. Plan is read
      // server-authoritatively from the profiles table (never client state). FLAG: chosen freemium
      // policy — adjust the limit or remove this block if free should allow multiple banks.
      // BANK CONNECTION LIMITS (behind PLUS_ENABLED): read now, applied after the exchange below, once Plaid has said
      // which item this is. A reconnect comes back here with the same item (update mode), and a re-link of a bank this
      // person already holds is collapsed to one row by the dedupe further down: neither adds a bank, so neither is
      // ever limited, even over the limit or on a read that failed.
      const bankLimit = await bankLimitFor(getAdminClient(), user_id);
      const { unlimited, status_unavailable } = await getUserPlan(user_id); // the same answer for the web and the store apps
      if (ENFORCE_PLAN_LIMITS && status_unavailable) return statusUnavailable(CORS); // item 16: never the one-bank cap on an unread plan
      // Plus lifts the free plan's one-bank cap too: Plus is unlimited, within its fair-use limit, on any plan.
      if (ENFORCE_PLAN_LIMITS && !unlimited && !(bankLimit && bankLimit.plus)) {
        const adminChk = getAdminClient();
        const { count } = await adminChk.from("plaid_items").select("item_id", { count: "exact", head: true }).eq("user_id", user_id).eq("status", "active");
        if ((count || 0) >= 1) {
          return { statusCode: 402, headers: CORS, body: JSON.stringify({ error: "plan_limit", message: planWords("plan-server-one-bank") }) };
        }
      }

      const data = await plaid("/item/public_token/exchange", { public_token });
      const access_token = data.access_token;
      const item_id = data.item_id;

      const admin = getAdminClient();
      let addsABank = false;
      if (bankLimit) {
        // A NEW bank only: not one of this person's items, and not a bank (by institution) they already hold.
        addsABank = true;
        try {
          const { data: mine, error: mineErr } = await admin.from("plaid_items").select("item_id, institution_id, institution_name").eq("user_id", user_id);
          if (mineErr) throw new Error(mineErr.code || "error");
          const key = (r) => String((r && r.institution_id) || "").trim().toLowerCase() || String((r && r.institution_name) || "").trim().toLowerCase();
          const newKey = key({ institution_id, institution_name });
          addsABank = !(mine || []).some((r) => r.item_id === item_id || (newKey && key(r) === newKey));
        } catch { addsABank = true; }
        if (addsABank && (bankLimit.unavailable || !bankLimit.allowed)) {
          // Refused: the item Plaid just made is removed, so nothing is left connected or billed.
          await removeRefusedItem(access_token, item_id, "exchange_token limit");
          if (bankLimit.unavailable) return statusUnavailable(CORS);
          return { statusCode: 402, headers: CORS, body: JSON.stringify(limitBody(bankLimit)) };
        }
      }
      const { error: upsertErr } = await admin
        .from("plaid_items")
        .upsert({
          user_id,
          item_id,
          access_token,
          institution_id,
          institution_name,
          status: "active",
        }, { onConflict: "user_id,item_id" });

      if (upsertErr) {
        // Persist failed — roll back the orphaned Plaid item so we never leave a
        // live access_token we couldn't save (best-effort).
        console.error("[exchange_token upsert]", upsertErr.message);
        try { await plaid("/item/remove", { access_token }); }
        catch (rbErr) { console.warn("[exchange_token rollback /item/remove failed]", rbErr.message); }
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Could not save your bank connection. Please try again." }) };
      }

      // TWO NEW BANKS AT THE SAME MOMENT (review 2026-11-22, H3). The limit was read before Plaid's exchange, so two
      // people finishing together (or one person on two devices) could each see room for one more. So a NEW bank is
      // counted again now it is written: if the count is past the limit, THIS bank is undone (removed at Plaid, then its
      // row) and refused as it would have been. Only the bank this request just added is ever undone; a household that
      // was already over its plan keeps every bank. A second look that cannot be read undoes nothing, and a bank Plaid
      // will not remove stays connected with its row rather than live at Plaid with none.
      // Round 2 (N3): which bank is the extra is settled by one fixed order (_lib/bankLimits.js), so of two new banks
      // at the same moment only the real extra is undone, not both.
      if (bankLimit && addsABank) {
        const after = await overAfterAdding(admin, user_id, { itemId: item_id });
        // Round 3: marked refused first (it stops counting at once), then removed at Plaid and its row deleted. The
        // answer is the refusal whatever those two manage: a removal that does not finish is finished later
        // (finishRefusedBanks), never turned into "connected". after.unresolved (this bank is inside the limit and the
        // count is still past it) removes nothing: the bank is kept.
        // Round 4 (R4-2): if the mark cannot be written, the bank is NOT treated as refused: nothing is removed at Plaid,
        // its row stays as it is (connected, listed, counted), and the answer is "unavailable", not the refusal.
        if (after.over) {
          if (!(await markRefused(admin, user_id, item_id, "exchange_token limit recheck"))) return statusUnavailable(CORS);
          if (await removeRefusedItem(access_token, item_id, "exchange_token limit recheck")) await removeRefusedRow(admin, user_id, item_id, "exchange_token limit recheck");
          return { statusCode: 402, headers: CORS, body: JSON.stringify(limitBody({ ...after.lim, used: after.lim.limit })) };
        }
      }

      // Server-side dedupe backstop. A re-link of an already-connected bank mints a FRESH item_id, so
      // the upsert above (onConflict user_id,item_id) never collides and would leave TWO rows for the
      // same institution — double-counting balances once accounts import. Now that the just-linked
      // item is safely saved, revoke + delete any OTHER item for the same institution so we converge
      // to one row per bank, keeping the item the user just linked.
      //
      // Ordering is deliberate: the new item is persisted FIRST (above). A failure in this block can
      // therefore only leave a stale duplicate for collapse_duplicate_items to clean up later — it can
      // never lose the bank the user just connected. The whole block is best-effort and non-fatal.
      //
      // Match mirrors collapse_duplicate_items: institution_id when present, else normalised
      // institution_name. `r.item_id === item_id` is skipped so an update-mode reconnect (same
      // item_id, already updated in place by the upsert) is never remove-and-reinserted.
      try {
        const dedupeKey = (institution_id || "").trim().toLowerCase() || (institution_name || "").trim().toLowerCase();
        if (dedupeKey) {
          const { data: existingRows, error: listErr } = await admin
            .from("plaid_items")
            .select("item_id, access_token, institution_id, institution_name")
            .eq("user_id", user_id);
          if (listErr) {
            console.error("[exchange_token dedupe] list failed (leaving any duplicate for collapse):", listErr.message);
          } else {
            for (const r of existingRows || []) {
              if (r.item_id === item_id) continue;   // the item just linked/updated — never remove it
              const rKey = (r.institution_id || "").trim().toLowerCase() || (r.institution_name || "").trim().toLowerCase();
              if (!rKey || rKey !== dedupeKey) continue;
              try { await plaid("/item/remove", { access_token: r.access_token }); }
              catch (revErr) { console.warn("[exchange_token dedupe: item/remove failed]", r.item_id, revErr.message); }
              // Through the same cleanup as delete_item: the duplicate's data leaves the household's blob first.
              try { await household.disconnectItem(admin, user_id, r.item_id); }
              catch (delErr) { console.error("[exchange_token dedupe: row delete failed]", r.item_id, delErr.message); }
            }
          }
        }
      } catch (dedupeErr) {
        console.error("[exchange_token dedupe] unexpected (non-fatal):", dedupeErr?.message || dedupeErr);
      }

      // access_token intentionally NOT returned.
      return ok({ ok: true, item_id, institution_name });
    }

    // 3. get_accounts
    if (action === "get_accounts") {
      const { access_token, owner_id, error: tokenError, statusCode: tokenStatus } = await resolveAccessToken(event, body, { ctx: reqCtx });
      if (!access_token) return { statusCode: tokenStatus || 400, headers: CORS, body: JSON.stringify({ error: tokenError }) };
      const data = await plaid("/accounts/get", { access_token });
      // Couple mode (audit round 2 c): who linked each account, from Plaid's own answer, for the cleanups. A record
      // that cannot be written answers 503 and no accounts (round 3: the catch below, err.ownerRecord).
      await household.recordAccountOwners(getAdminClient(), owner_id, body.item_id, (data.accounts || []).map((a) => a.account_id));
      // balance-truth: the bank answered, so a sign-in recorded as run out is no longer.
      if (STATUSES_CLEARED_BY_AN_ANSWER.includes(reqCtx.status)) await setItemStatus(owner_id, body.item_id, "active");
      return ok({
        accounts: data.accounts.map(a => ({
          id:      a.account_id,
          name:    a.official_name || a.name,
          type:    a.type,
          subtype: a.subtype,
          mask:    a.mask,
          balance: {
            available: a.balances?.available ?? null,
            current:   a.balances?.current ?? null,
            limit:     a.balances?.limit ?? null,
            currency:  a.balances?.iso_currency_code || "CAD",
          },
        })),
      });
    }

    // 4. get_transactions
    if (action === "get_transactions") {
      const { days = 90, full_resync = false } = body;
      const { access_token, user_id, owner_id, item_row_id, error: tokenError, statusCode: tokenStatus } = await resolveAccessToken(event, body, { ctx: reqCtx });
      if (!access_token) return { statusCode: tokenStatus || 400, headers: CORS, body: JSON.stringify({ error: tokenError }) };

      const cappedDays = Math.min(Math.max(1, days), 730);
      const endDate    = new Date().toISOString().split("T")[0];
      const startDate  = new Date(Date.now() - cappedDays * 86_400_000).toISOString().split("T")[0];

      // Sprint Z #1/#3: incremental cursor sync. Returns { transactions (added+modified, normalized),
      // removed (ids), truncated, full }. Cursor is read from / persisted to plaid_items per item.
      // Couple mode: a bank the other member linked keeps a cursor of this member's own (plaid_item_cursors).
      // Couple mode (audit round 2 c): who linked each account, recorded BEFORE the sync's cursor moves on. A record
      // that cannot be written throws (round 3), so the cursor stays, the answer is 503 with no transactions (the
      // catch below, err.ownerRecord), and the next sync returns them again.
      const recordOwners = (ids) => household.recordAccountOwners(getAdminClient(), owner_id, body.item_id, ids);
      let result = await syncTransactions(access_token, startDate, endDate, { user_id, item_id: body.item_id, owner_id, item_row_id, fullResync: !!full_resync, recordOwners });
      // Fall back to /transactions/get ONLY on an empty FULL sync (fresh sandbox items sometimes
      // return nothing from /sync at first). An empty INCREMENTAL sync just means "no changes".
      // balance-truth: never while Plaid says the first pull has not started (NOT_READY): /transactions/get answers
      // PRODUCT_NOT_READY then, which used to fail the whole call. Either way the app is told the history is still
      // coming (update_status), and asks again.
      if (result.full && result.transactions.length === 0 && result.removed.length === 0 && result.updateStatus !== "NOT_READY") {
        try {
          const fallback = await getTransactions(access_token, startDate, endDate);
          await recordOwners(fallback.map((t) => t && t.account_id));
          result = { ...result, transactions: fallback, removed: [], truncated: false, full: true };
        } catch (err) {
          if (err.errorCode !== "PRODUCT_NOT_READY") throw err;
          result = { ...result, updateStatus: "NOT_READY" };
        }
      }
      // balance-truth: the webhook marks a bank's new transactions waiting (transactions_pending); a sync that took
      // them all clears it, so the app's next look at list_items knows there is nothing new. Own banks only: a
      // partner's bank keeps its linker's flag.
      if (!result.truncated && owner_id === user_id) {
        try {
          const { error: flagErr } = await getAdminClient().from("plaid_items").update({ transactions_pending: false }).eq("user_id", user_id).eq("item_id", body.item_id);
          if (flagErr) console.error("[transactions_pending clear]", flagErr.code || "error");
        } catch (e) { console.error("[transactions_pending clear] threw"); }
      }

      return ok({
        transactions:  result.transactions,
        removed:       result.removed,
        truncated:     result.truncated,
        full:          result.full,
        total:         result.transactions.length,
        update_status: result.updateStatus || null,
      });
    }

    // 5. get_investments
    if (action === "get_investments") {
      const { access_token, user_id, owner_id, error: tokenError, statusCode: tokenStatus } = await resolveAccessToken(event, body, { ctx: reqCtx });
      if (!access_token) {
        // The bank's row could not be read: with Plus, the list the server kept is answered instead (NEW-2, above).
        const keptAnswer = user_id ? await keptHoldingsWithoutToken(user_id, body) : null;
        if (keptAnswer) return ok(keptAnswer);
        return { statusCode: tokenStatus || 400, headers: CORS, body: JSON.stringify({ error: tokenError }) };
      }
      // sharedOnly: the accounts of a partner's bank its owner shared (null: the asker's own bank, all of it).
      // plusLive: this request has Plus, an app that keeps holdings private, and (for a partner's bank) the owner's
      // sharing choices were read. Only then is anything kept on the server, or answered from what was kept.
      let sharedOnly = null, plusLive = false;
      const visible = (list) => (Array.isArray(list) ? list : []).filter((h) => h && (!sharedOnly || sharedOnly.has(h.account_id)));
      try {
        // PLUS (behind PLUS_ENABLED): holdings are a Plus feature. Without Plus (or on a plan read that failed) nothing is
        // asked of Plaid at all, so nobody is billed for data nobody can see. With Plus, a partner's bank gives only the
        // holdings of the accounts its owner shared (migration 0045): private by default.
        // THE TESTER-ONLY SWITCH: "Plus is on" is asked for THIS account (the flag, or a tester). And a bank's holdings
        // follow its OWNER's Plus: when the owner is a tester and the one asking is not (PLUS_ENABLED off), the asker is
        // still sent only what the owner shared, so a tester's private holdings never reach a partner who sees no Plus.
        const plusForMe = plusAddon.plusEnabledFor(user_id);
        if (!plusForMe && owner_id && owner_id !== user_id && plusAddon.plusEnabledFor(owner_id)) {
          const { data: shares, error: sErr } = await getAdminClient().from("net_worth_shares").select("account_id, shared").eq("user_id", owner_id);
          if (sErr) return ok({ holdings: [] });
          sharedOnly = new Set((shares || []).filter((r) => r.shared === true).map((r) => r.account_id));
          if (!sharedOnly.size) return ok({ holdings: [] });
        }
        if (plusForMe) {
          // OLDER APPS (2026-11-21): an app before 1.1.8 puts the holdings it is sent into the household's shared data,
          // where the other member reads them. So none are sent to a client that does not say it is 1.1.8 or newer,
          // whoever asks and whatever their plan: nothing is read and nothing is asked of Plaid for it.
          if (!plusAddon.plusClientOk(body)) return ok({ holdings: [], locked: true, plus_mode: true, ...plusAddon.updateRequired() });
          // unavailable (review 2026-11-22, B1): this answer is "could not fetch", not "there are none", so the app
          // keeps the holdings it already has on the device instead of showing none. An older app ignores it.
          const ent = await plusAddon.getPlusEntitlement(getAdminClient(), user_id);
          if (!ent.plus) return ok({ holdings: [], locked: true, plus_mode: true, ...(ent.status_unavailable ? { unavailable: true } : {}) });
          if (owner_id && owner_id !== user_id) {
            const { data: shares, error: sErr } = await getAdminClient().from("net_worth_shares").select("account_id, shared").eq("user_id", owner_id);
            if (sErr) return ok({ holdings: [], locked: true, plus_mode: true, unavailable: true });
            sharedOnly = new Set((shares || []).filter((r) => r.shared === true).map((r) => r.account_id));
            // Nothing shared: no holdings, and Plaid is not asked. stored says whether the OWNER's list is kept on
            // the server, so the asker's app never clears the owner's old shared copy before the owner has a
            // lasting private one (round 2 of the review, B1).
            if (!sharedOnly.size) return ok({ holdings: [], plus_mode: true, stored: await holdingsStore.hasPlusHoldings(getAdminClient(), owner_id, body.item_id) });
          }
          plusLive = true;
        }
        const data = await plaid("/investments/holdings/get", { access_token });
        const securities = data.securities || [];
        const secMap = {};
        securities.forEach(s => { secMap[s.security_id] = s; });
        // Phase B3: build account map so each holding can carry its underlying
        // account's subtype (RRSP, TFSA, 401k, etc.) — this is what the user
        // actually cares about, not the security's type.
        const acctMap = {};
        (data.accounts || []).forEach(a => { acctMap[a.account_id] = a; });

        // The bank's whole list first (it is what the server keeps, in its owner's name); what is SENT is that list
        // through `visible`: all of it for its owner, the shared accounts only for a partner.
        const everything = (data.holdings || []).map(h => {
          const s = secMap[h.security_id] || {};
          return {
            account_id:      h.account_id,
            account_subtype: acctMap[h.account_id]?.subtype || null,
            id:       h.account_id + "_" + h.security_id,
            name:     s.name || "Unknown",
            ticker:   s.ticker_symbol || null,
            type:     s.type || "other",
            quantity: h.quantity,
            price:    s.close_price || 0,
            value:    h.institution_value || 0,
            currency: s.iso_currency_code || "CAD",
            gain:     null,
            gainPct:  null,
          };
        });
        const holdings = visible(everything);

        // Couple mode (audit round 4): who linked every account these holdings name is recorded before any of them
        // is returned, as get_accounts does. A record that cannot be written answers 503 and no holdings.
        await household.recordAccountOwners(getAdminClient(), owner_id, body.item_id,
          [...(data.accounts || []).map((a) => a && a.account_id), ...holdings.map((h) => h.account_id)]);
        // plus_mode: the app never puts these in the shared household blob, so a partner never reads this person's
        // private holdings from it. stored (round 2 of the review, G-N1 with B1): the bank's list is now kept on the
        // server in its owner's name (migration 0055), so the app may clear the old shared copy of it even on a
        // device that can save nothing. false when it could not be kept (or 0055 is not run yet): the app then
        // clears only on its own device copy, as before.
        if (plusLive) return ok({ holdings, plus_mode: true, stored: await holdingsStore.savePlusHoldings(getAdminClient(), owner_id, body.item_id, everything) });
        return ok({ holdings, ...(plusForMe ? { plus_mode: true } : {}) });
      } catch (err) {
        if (err && err.ownerRecord) throw err;   // the outer catch: 503, nothing returned
        // THE BANK COULD NOT BE READ. With Plus, the list the server kept for this bank is answered instead, through
        // the same filter as a live one, marked stale with when it came: a person never has "no holdings" because a
        // bank blinked. It is never marked stored (the app clears nothing on it). Nothing kept: unavailable, as before.
        if (plusLive) {
          const kept = await holdingsStore.loadPlusHoldings(getAdminClient(), owner_id, body.item_id);
          if (kept) return ok({ holdings: visible(kept.holdings), plus_mode: true, stale: true, as_of: kept.fetched_at });
        }
        return ok({ holdings: [], ...(plusAddon.plusEnabledFor(user_id) ? { unavailable: true, plus_mode: true } : {}) });
      }
    }

    // 6. get_liabilities
    if (action === "get_liabilities") {
      const { access_token, owner_id, error: tokenError, statusCode: tokenStatus } = await resolveAccessToken(event, body, { ctx: reqCtx });
      if (!access_token) return { statusCode: tokenStatus || 400, headers: CORS, body: JSON.stringify({ error: tokenError }) };
      try {
        const data = await plaid("/liabilities/get", { access_token });
        const l = data.liabilities || {};
        // Couple mode (audit round 4): who linked every account below is recorded before any of it is returned, as
        // get_accounts does. A record that cannot be written answers 503 and no liabilities.
        await household.recordAccountOwners(getAdminClient(), owner_id, body.item_id, [
          ...(data.accounts || []).map((a) => a && a.account_id),
          ...[...(l.credit || []), ...(l.mortgage || []), ...(l.student || [])].map((x) => x && x.account_id),
        ]);
        return ok({
          credit: (l.credit || []).map(c => ({
            account_id: c.account_id,
            name:       c.name,
            balance:    c.last_statement_balance || 0,
            limit:      c.credit_limit || null,
            apr:        c.aprs?.[0]?.apr_percentage || null,
            minPayment: c.minimum_payment_amount || 0,
          })),
          mortgage: (l.mortgage || []).map(m => ({
            account_id:     m.account_id,
            name:           m.name,
            balance:        m.outstanding_principal_balance || 0,
            interestRate:   m.interest_rate?.percentage || null,
            monthlyPayment: m.next_monthly_payment || 0,
          })),
          student: (l.student || []).map(s => ({
            account_id:   s.account_id,
            name:         s.name,
            balance:      (s.outstanding_interest_amount || 0) + (s.outstanding_principal_balance || 0),
            interestRate: s.interest_rate_percentage || null,
          })),
        });
      } catch (err) {
        if (err && err.ownerRecord) throw err;   // the outer catch: 503, nothing returned
        // Sprint Z #2: signal failure instead of empty arrays so the client keeps stale
        // liabilities (empty arrays were indistinguishable from a confirmed "no debt").
        return ok({ liabilitiesUnavailable: true, error_code: err.errorCode || null });
      }
    }

    // 7. remove_item
    if (action === "remove_item") {
      // Couple mode: only the person who linked a bank may revoke it (the Plaid consent is theirs).
      const { access_token, error: tokenError, statusCode: tokenStatus } = await resolveAccessToken(event, body, { ownOnly: true });
      if (!access_token) return { statusCode: tokenStatus || 400, headers: CORS, body: JSON.stringify({ error: tokenError }) };
      await plaid("/item/remove", { access_token });
      return ok({ removed: true });
    }

    // 8. enrich_transactions
    if (action === "enrich_transactions") {
      // Phase C1: Plaid Enrich. Cleans transaction names, returns merchant logos
      // and refined categories. Billed per transaction (~$0.002 each).
      //
      // Input shape: { transactions: [{id, name, amount, currency, account_id, ...}, ...] }
      // Plaid endpoint accepts max 100 txns per request — we chunk internally.
      // Returns: { enriched: [{id, name, logo, mcc, category, ...}, ...] } — a flat array
      //          where each entry is keyed by `id` so the frontend can merge by id.
      const { user_id, error: authError } = await getUserFromRequest(event);
      if (!user_id) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: authError || "unauthorized" }) };

      let { transactions } = body;
      if (!Array.isArray(transactions) || transactions.length === 0) {
        return ok({ enriched: [] });
      }

      // Tier 1.3 per-call cost cap: enrich at most 500 txns. Truncate-and-log
      // rather than reject, so heavy first-connects still get most names/logos.
      const ENRICH_CAP = 500;
      if (transactions.length > ENRICH_CAP) {
        console.warn(`[enrich] user=${user_id.slice(0, 8)} capped ${transactions.length} -> ${ENRICH_CAP}`);
        transactions = transactions.slice(0, ENRICH_CAP);
      }

      // Chunk into max-100 batches
      const chunks = [];
      for (let i = 0; i < transactions.length; i += 100) {
        chunks.push(transactions.slice(i, i + 100));
      }

      const enrichedAll = [];
      for (const chunk of chunks) {
        // Build Enrich's required input shape per txn
        const enrichInput = chunk.map(t => ({
          id: String(t.id),
          description: String(t.name || ""),
          amount: Math.abs(Number(t.amount) || 0),
          direction: (Number(t.amount) || 0) > 0 ? "OUTFLOW" : "INFLOW",
          iso_currency_code: t.currency || "CAD",
        }));

        try {
          const resp = await plaid("/transactions/enrich", {
            account_type: "depository", // Plaid wants this hint; safe default for personal-finance use
            transactions: enrichInput,
          });
          const enrichedChunk = (resp.enriched_transactions || []).map(et => ({
            id: et.id,
            name: et.enrichments?.merchant_name || et.description || null,
            logo: et.enrichments?.logo_url || null,
            website: et.enrichments?.website || null,
            category_primary: et.enrichments?.personal_finance_category?.primary || null,
            category_detailed: et.enrichments?.personal_finance_category?.detailed || null,
            category_icon: et.enrichments?.personal_finance_category_icon_url || null,
            payment_channel: et.enrichments?.payment_channel || null,
            location_city: et.enrichments?.location?.city || null,
            location_region: et.enrichments?.location?.region || null,
          }));
          enrichedAll.push(...enrichedChunk);
        } catch (err) {
          // Per-chunk failure — log and continue. Don't fail the whole request.
          console.warn("Enrich chunk failed:", err?.message || err);
        }
      }

      return ok({ enriched: enrichedAll });
    }

    // 9. store_item — DEPRECATED (Tier 1.2). Clients must never send access_tokens.
    // exchange_token now exchanges AND persists the item atomically server-side,
    // so this token-in-request-body path is permanently closed.
    if (action === "store_item") {
      return { statusCode: 410, headers: CORS, body: JSON.stringify({ error: "store_item is deprecated: exchange_token now persists the item server-side." }) };
    }

    // bank_limit_status (behind PLUS_ENABLED; 404 while off): how many bank connections this household holds against its
    // plan, for Settings. Numbers only; the app words them (src/lib/netWorthWords.js). A read that fails is a 503.
    if (action === "bank_limit_status") {
      const { user_id, error: authError } = await getUserFromRequest(event);
      if (!user_id) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: authError || "unauthorized" }) };
      const lim = await bankLimitFor(getAdminClient(), user_id);
      if (!lim) return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: "not_found" }) };
      if (lim.unavailable) return statusUnavailable(CORS);
      return ok({ plus: lim.plus, scope: lim.scope, used: lim.used, limit: lim.limit, allowed: lim.allowed, connected: lim.connected, over: lim.over });
    }

    // 10. list_items — auth-required: return all items for the authenticated user
    // (does NOT return access_token to client — only metadata)
    if (action === "list_items") {
      const { user_id, error: authError } = await getUserFromRequest(event);
      if (!user_id) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: authError || "unauthorized" }) };
      const admin = getAdminClient();
      const { data, error } = await listItemRows(admin, (q) => q.eq("user_id", user_id));
      if (error) {
        console.error("[plaid_items list]", error.message);
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Failed to load accounts." }) };
      }
      // Couple mode: the banks the other member linked are listed too, marked linked_by "partner" (a role,
      // never a name), so both see every account. Only their metadata: a token never leaves the server.
      // A failed household read lists this person's own banks, as before.
      let shared = [];
      try {
        const peers = await household.peerIdsOf(admin, user_id);
        if (peers.length) {
          const { data: theirs, error: peerErr } = await listItemRows(admin, (q) => q.in("user_id", peers));
          if (peerErr) console.error("[plaid_items list] household:", peerErr.message);
          else shared = (theirs || []).map((r) => ({ ...r, linked_by: "partner" }));
        }
      } catch (e) { console.error("[plaid_items list] household:", e.message); }
      // A bank that was refused (it was the one past the limit) is never listed: it is not connected. One of this
      // person's own whose removal did not finish is finished now (round 3; finishRefusedBanks).
      const connected = (r) => r && r.status !== REFUSED;
      const unfinished = (data || []).filter((r) => r && r.status === REFUSED);
      if (unfinished.length) await finishRefusedBanks(admin, user_id, unfinished);
      return ok({ items: (data || []).filter(connected).concat(shared.filter(connected)) });
    }

    // 11. delete_item — auth-required: revoke an item from Plaid + delete row
    // Body: { item_id }
    if (action === "delete_item") {
      const { user_id, error: authError } = await getUserFromRequest(event);
      if (!user_id) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: authError || "unauthorized" }) };
      const { item_id } = body;
      if (!item_id) return e400("item_id required");
      const admin = getAdminClient();
      // Look up the access_token first so we can revoke from Plaid
      const { data: row, error: fetchErr } = await admin
        .from("plaid_items")
        .select("access_token")
        .eq("user_id", user_id)
        .eq("item_id", item_id)
        .single();
      if (fetchErr || !row) {
        return e400("item not found for this user");
      }
      // Revoke from Plaid (best-effort — proceed with row delete even if this fails)
      try {
        await plaid("/item/remove", { access_token: row.access_token });
      } catch (revErr) {
        console.warn("[item/remove failed]", revErr.message);
      }
      // Couple mode (audit round 2 c): what came from this bank leaves the household's shared blob, under the
      // household's lock and while the row still says whose bank it is, then the row goes: one transaction
      // (_lib/household.js disconnectItem). Not in a household: the row is deleted, as before.
      try { await household.disconnectItem(admin, user_id, item_id); }
      catch (delErr) {
        console.error("[delete_item]", delErr.message);
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Failed to disconnect bank." }) };
      }
      // PLUS: the bank's holdings kept on the server go with it (migration 0055's trigger does the same when the row
      // goes; this is the same thing said here). Never fails the disconnect.
      await holdingsStore.dropPlusHoldings(admin, user_id, item_id);
      return ok({ removed: true });
    }

    // 11b. collapse_duplicate_items — auth-required: one active item per institution.
    // Re-linking a bank that is already connected creates a SECOND plaid_items row (exchange_token
    // upserts on user_id+item_id, and Plaid issues a fresh item_id every Link), so a user who
    // retried a failed connect ends up with duplicates. Two items for one bank double-count every
    // balance once accounts import. Keep the NEWEST row per institution and revoke the rest through
    // the same path delete_item uses (Plaid /item/remove + row delete), so the duplicate genuinely
    // goes away server-side rather than being hidden in the UI.
    // Returns { collapsed: [{item_id, institution_name}], kept: [{item_id, institution_name}] }.
    if (action === "collapse_duplicate_items") {
      const { user_id, error: authError } = await getUserFromRequest(event);
      if (!user_id) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: authError || "unauthorized" }) };
      const admin = getAdminClient();
      const { data: rows, error: listErr } = await admin
        .from("plaid_items")
        .select("item_id, access_token, institution_id, institution_name, created_at")
        .eq("user_id", user_id)
        .order("created_at", { ascending: false });   // newest first
      if (listErr) {
        console.error("[collapse_duplicate_items]", listErr.message);
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Failed to load items." }) };
      }
      const seen = new Set();
      const kept = [], collapsed = [];
      for (const r of rows || []) {
        // institution_id is often null (neither client call site sends it), so fall back to a
        // normalised institution_name. Rows with neither are never collapsed — we cannot prove
        // they are duplicates, and wrongly removing a real bank is far worse than a duplicate.
        const key = (r.institution_id || "").trim().toLowerCase()
                 || (r.institution_name || "").trim().toLowerCase();
        if (!key) { kept.push({ item_id: r.item_id, institution_name: r.institution_name }); continue; }
        if (!seen.has(key)) { seen.add(key); kept.push({ item_id: r.item_id, institution_name: r.institution_name }); continue; }
        // Duplicate (older, since we ordered newest-first) → revoke + delete.
        try { await plaid("/item/remove", { access_token: r.access_token }); }
        catch (revErr) { console.warn("[collapse: item/remove failed]", r.item_id, revErr.message); }
        // Through the same cleanup as delete_item: the duplicate's data leaves the household's blob first.
        try { await household.disconnectItem(admin, user_id, r.item_id); }
        catch (delErr) { console.error("[collapse: row delete failed]", r.item_id, delErr.message); kept.push({ item_id: r.item_id, institution_name: r.institution_name }); continue; }
        await holdingsStore.dropPlusHoldings(admin, user_id, r.item_id);   // PLUS: its kept holdings go with it (as delete_item)
        collapsed.push({ item_id: r.item_id, institution_name: r.institution_name });
      }
      return ok({ collapsed, kept });
    }

    // 12. migrate_items — auth-required: bulk-migrate localStorage tokens to Supabase
    // Body: { tokens: [{token, institution_name}, ...] }
    // For each token: call /item/get to derive item_id, upsert plaid_items row.
    // Returns: { successes: [{token, item_id}], failures: [{token, error}] }
    if (action === "migrate_items") {
      const { user_id, error: authError } = await getUserFromRequest(event);
      if (!user_id) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: authError || "unauthorized" }) };
      const { tokens } = body;
      if (!Array.isArray(tokens) || tokens.length === 0) {
        return ok({ successes: [], failures: [] });
      }
      const admin = getAdminClient();
      const successes = [];
      const failures = [];
      // A BANK THE PERSON ALREADY HAD IS IMPORTED, NEVER REFUSED (round 5 of the Plus review, R5-1; Amanda, 2026-11-23:
      // GRANDFATHER). These are banks connected on an older copy of the app, whose tokens lived on the device. Limits
      // stop NEW connections and never disconnect an existing one (_lib/bankLimits.js), so no limit is asked here: not
      // the Plus bank limit, and not the free plan's one-bank cap (off today, ENFORCE_PLAN_LIMITS). Refusing one left
      // its Item live at Plaid with no row, so nothing could ever clean it up or show it. An imported bank counts like
      // any other, so a household past its limit is offered no NEW bank until it is back under (create_link_token and
      // exchange_token ask the limit; this does not). Nothing here is removed at Plaid, and a plan that cannot be read
      // holds nothing up.
      for (const t of tokens) {
        if (!t?.token) {
          failures.push({ error: "missing token" });
          continue;
        }
        try {
          // Derive item_id + institution_id from Plaid
          const itemResp = await plaid("/item/get", { access_token: t.token });
          const item_id = itemResp.item?.item_id;
          const institution_id = itemResp.item?.institution_id || null;
          if (!item_id) {
            failures.push({ error: "no item_id returned" });
            continue;
          }
          // Upsert (idempotent — re-running migration is safe)
          const { error: upsertErr } = await admin
            .from("plaid_items")
            .upsert({
              user_id,
              item_id,
              access_token: t.token,
              institution_id,
              institution_name: t.institution_name || "Your Bank",
              status: "active",
            }, { onConflict: "user_id,item_id" });
          if (upsertErr) {
            console.error("[migrate_items upsert]", upsertErr.message);
            failures.push({ error: "Could not save this bank." });
            continue;
          }
          successes.push({ item_id });
        } catch (err) {
          // Plaid /item/get failed (revoked token, login required, network, etc.)
          console.error("[migrate_items item/get]", err.errorCode || "", err.message);
          failures.push({ error: "Could not migrate this bank.", error_code: err.errorCode || null });
        }
      }
      return ok({ successes, failures });
    }

    // 13. delete_account — auth-required: full account wipe
    // Revokes all Plaid items, deletes this user's rows, deletes the Supabase auth user.
    // Round-3: every step that can leave the household's data behind is CRITICAL and stops the
    // deletion before the auth user goes, so the person can try again and nothing is orphaned:
    //   - loading plaid_items: if it fails, nothing has been touched yet, so we stop at once and the
    //     client's "nothing was changed" is literally true;
    //   - deleting plaid_items, meeting_records, subscriptions and feedback.
    // Plaid /item/remove stays best-effort: a Plaid outage must not trap someone in an account they
    // cannot delete. user_data, coach_usage and profiles cascade with the auth user, so they stay
    // best-effort as before.
    if (action === "delete_account") {
      const { user_id, error: authError } = await getUserFromRequest(event);
      if (!user_id) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: authError || "unauthorized" }) };
      const admin = getAdminClient();
      const errors = [];
      // A critical failure: the auth user is NOT deleted, and the response says which step stopped it.
      const stop = (step) => ok({ deleted: false, partial: true, errors: [...errors, { step }] });

      // 1. Load all plaid_items rows for the user (need access_tokens for /item/remove)
      const { data: items, error: loadErr } = await admin
        .from("plaid_items")
        .select("item_id, access_token")
        .eq("user_id", user_id);
      if (loadErr) {
        console.error("[delete_account] load_items:", loadErr.message);
        return stop("load_items"); // nothing deleted yet
      }

      // A table that does not exist in this database yet holds nothing for this user.
      const missingTable = (e) => !!e && (e.code === "42P01" || e.code === "PGRST205" ||
        /does not exist|could not find the table/i.test(String(e.message || "")));

      // 1b. KNOWN-DEFECTS 23: NOBODY KEEPS BEING CHARGED AFTER DELETING. Every Stripe subscription that could
      // still charge is cancelled now, BEFORE anything is erased. If that cannot be done, or it cannot be
      // known whether a charge is live, the deletion stops here with nothing changed ("billing_cancel"), and
      // the person is told to try again or email hello@flourishmoney.app. An account is never deleted while
      // a live charge is left behind. A subscription Stripe already shows as ended, or no longer has, needs
      // nothing. Billing switched off (BILLING_ENABLED) does not skip this: a row that can charge is cancelled.
      const ENDED = ["canceled", "incomplete_expired"];
      const { data: subRows, error: subErr } = await admin
        .from("subscriptions")
        .select("provider, provider_subscription_id, provider_customer_id, status, plan_key")
        .eq("user_id", user_id);
      if (subErr && !missingTable(subErr)) {
        console.error("[delete_account] subscriptions read:", subErr.message);
        return stop("billing_cancel"); // cannot tell whether a charge is live; nothing deleted yet
      }
      // Stripe subscriptions are cancelled here. A store subscription (version 1.1) can only be cancelled by the
      // household in the App Store or Google Play; the delete confirmation says so, and its founding number is
      // stamped below all the same.
      const allSubs = Array.isArray(subRows) ? subRows : [];
      const subs = allSubs.filter(r => r && r.provider_subscription_id && (r.provider || "stripe") === "stripe");
      // B3 (audit 2026-10-26): EVERY live subscription Stripe has for the customer, not only the one on the row. A
      // second checkout that completed (two tabs) left a subscription the row never showed, still charging. If Stripe
      // cannot be asked, nothing is deleted.
      const customers = [...new Set(allSubs.filter(r => r && r.provider_customer_id && (r.provider || "stripe") === "stripe").map(r => r.provider_customer_id))];
      // THE PLUS ADD-ON (migration 0044) has its own Stripe customer: its live subscriptions are cancelled here too. Its
      // table not being there (0044 not run) holds nothing; any other failed read stops the delete with nothing changed.
      {
        const { data: plusRows, error: plusErr } = await admin.from("plus_addon_subscriptions")
          .select("provider, provider_customer_id").eq("user_id", user_id);
        if (plusErr && !missingTable(plusErr)) {
          console.error("[delete_account] plus read:", plusErr.code || "error");
          return stop("billing_cancel"); // nothing deleted yet
        }
        for (const r of (Array.isArray(plusRows) ? plusRows : [])) {
          // Any row's Stripe customer, a store row's included: a website Plus subscription can outlive a store purchase.
          if (r && r.provider_customer_id && !customers.includes(r.provider_customer_id)) customers.push(r.provider_customer_id);
        }
      }
      for (const cus of customers) {
        let listed;
        try { listed = await liveSubscriptionsFor(cus, {}, { includeIncomplete: true }); }
        catch (e) {
          console.error("[delete_account] stripe list failed:", e && e.statusCode ? e.statusCode : "no_status");
          return stop("billing_cancel"); // nothing deleted yet
        }
        for (const s of listed) {
          if (subs.some(r => r.provider_subscription_id === s.id)) continue;
          subs.push({ provider: "stripe", provider_subscription_id: s.id, status: s.status, plan_key: (s.metadata && s.metadata.plan_key) || null });
          allSubs.push(subs[subs.length - 1]);
        }
      }
      for (const r of subs) {
        if (ENDED.includes(r.status)) continue;
        const id = encodeURIComponent(r.provider_subscription_id);
        try {
          let live = true;
          try {
            const current = await stripeGet(`/subscriptions/${id}`);
            live = !ENDED.includes(current && current.status);
          } catch (e) {
            if (e && e.statusCode === 404) live = false;   // Stripe has no such subscription: nothing to charge
            else throw e;
          }
          if (live) {
            await stripeDelete(`/subscriptions/${id}`, { idempotencyKey: `delete-account:${user_id}:${r.provider_subscription_id}` });
          }
        } catch (e) {
          // Stripe's message can name the account; only the status goes to the log.
          console.error("[delete_account] stripe cancel failed:", e && e.statusCode ? e.statusCode : "no_status");
          return stop("billing_cancel"); // nothing deleted yet
        }
      }
      // A founding subscription has now ENDED (cancelled above, or earlier): the household's waitlist number is
      // stamped, as the webhook would, so the founding price does not come back with a new account on the same
      // email. Idempotent, so a retry after a failure here stamps again rather than skipping it. A checkout
      // that never completed (incomplete) was never a founding subscription. The number itself stays issued:
      // deleting an account never frees one (nothing here, or anywhere, deletes from the ledger).
      if (allSubs.some(r => r && r.plan_key === "founding_annual" && !["incomplete", "incomplete_expired"].includes(r.status))) {
        const { data: fu } = await admin.auth.admin.getUserById(user_id);
        const fEmail = fu && fu.user && fu.user.email;
        const { error: endErr } = fEmail ? await admin.rpc("waitlist_founding_mark_ended", { p_email: fEmail }) : { error: null };
        if (endErr) {
          console.error("[delete_account] founding end:", endErr.message);
          return stop("billing_cancel"); // the charge is cancelled; nothing deleted yet, so a retry finishes it
        }
      }

      // 1c. COUPLE MODE: leave the household first, while this person's bank links still exist, so their banks
      // come out of the shared blob and the partner becomes the owner (migration 0031, household_leave). Critical:
      // a partner must never keep a deleted person's accounts. Before 0031 runs, with the switch off, there is nothing
      // to leave; with it on, a missing function stops the delete (audit round 4).
      {
        let peers = [];
        try { peers = await household.peerIdsOf(admin, user_id); } catch { peers = []; }
        const { error: hhErr } = await admin.rpc("household_leave", { p_user: user_id });
        // Only while the switch is off may a missing function mean "nothing to leave" (audit round 4).
        if (hhErr && !household.legacyMissing(hhErr)) {
          console.error("[delete_account] household leave:", hhErr.code || "error");
          return stop("household");
        }
        // The partner's own Stripe subscription, if we had set it to end as the household's extra one, is resumed:
        // nobody covers them now (_lib/household.js resumeHouseholdExtra; never throws).
        if (peers.length) await household.resumeHouseholdExtra(admin, peers);
      }

      // 2. Round-3: the meeting's stored answers and the billing row, BEFORE anything irreversible at
      // Plaid. Both reference auth.users with ON DELETE CASCADE, but they are deleted explicitly and
      // CRITICALLY: if either fails, we stop with the bank links and the sign-in still in place, so a
      // retry finishes the job. A table that does not exist in this database yet holds nothing for
      // this user, so "no such table" counts as done rather than trapping everyone in their account.
      // plaid_account_owners (couple mode): who linked which account, kept past a disconnect for the cleanups; the
      // household was left above, so it has done its work.
      // With the switch on, a missing plaid_account_owners is a failure, not "nothing to delete" (audit round 4).
      for (const table of ["meeting_records", "subscriptions", "feedback", "plaid_account_owners"]) {
        const { error: tErr } = await admin.from(table).delete().eq("user_id", user_id);
        if (tErr && !(table === "plaid_account_owners" ? household.legacyMissing(tErr) : missingTable(tErr))) {
          console.error(`[delete_account] ${table} delete:`, tErr.message);
          return stop(table);
        }
      }

      // 3. Revoke each Plaid item (best-effort)
      for (const it of (items || [])) {
        try {
          await plaid("/item/remove", { access_token: it.access_token });
        } catch (revErr) {
          console.warn(`[delete_account] /item/remove failed for ${it.item_id}:`, revErr.message);
          errors.push({ step: "plaid_remove", item_id: it.item_id });
        }
      }

      // 3a. Delete plaid_items rows (critical)
      const { error: delErr } = await admin
        .from("plaid_items")
        .delete()
        .eq("user_id", user_id);
      if (delErr) {
        console.error("[delete_account] delete_rows:", delErr.message);
        return stop("delete_rows");
      }

      // 3b. Sprint 3: explicitly wipe other user-scoped rows. user_data has ON DELETE CASCADE
      // so it would go with the auth user below, but we clear it + the coach_usage counter
      // outright too (idempotent; non-fatal — orphaned rows aren't a user-facing failure).
      // webhook_seen is keyed by jti hash (NOT user-scoped), so there's nothing per-user there.
      const { error: udErr } = await admin.from("user_data").delete().eq("user_id", user_id);
      if (udErr) console.warn("[delete_account] user_data delete:", udErr.message);
      const { error: cuErr } = await admin.from("coach_usage").delete().eq("user_id", user_id);
      if (cuErr) console.warn("[delete_account] coach_usage delete:", cuErr.message);
      // profiles (plan + AI-consent timestamps) has ON DELETE CASCADE to auth.users, but delete it
      // explicitly too (idempotent) so the row + consent data is wiped even if the cascade ever changes.
      const { error: pErr } = await admin.from("profiles").delete().eq("user_id", user_id);
      if (pErr) console.warn("[delete_account] profiles delete:", pErr.message);

      // 3c. Sprint Z3: free the BETA SEAT. beta_signups is keyed by EMAIL with NO FK to auth.users, so it
      // does NOT cascade with the auth user below — a lingering row keeps the 30-seat cap consumed AND
      // makes reserve_beta_seat return 'email_exists', blocking re-signup with the same email. Look up the
      // email BEFORE deleting the auth user (afterwards it's gone). Best-effort: a stuck seat must NOT
      // block the account deletion itself (Apple 5.1.1(v) — delete must delete), so log loudly instead.
      try {
        const { data: u } = await admin.auth.admin.getUserById(user_id);
        const email = (u?.user?.email || "").trim().toLowerCase();
        if (email) {
          const { error: bsErr } = await admin.from("beta_signups").delete().eq("email", email);
          if (bsErr) console.error(`[delete_account] beta_signups delete FAILED for ${emailRef(email)}; manual cleanup: delete from public.beta_signups where public.waitlist_email_key(email) = '${emailKey(email)}';`, bsErr.message);
          // Also erase any waitlist PII for this email (email-keyed, no FK → doesn't cascade). Best-effort:
          // residual marketing PII shouldn't survive an account deletion (Apple 5.1.1(v) / privacy).
          const { error: wlErr } = await admin.from("waitlist").delete().eq("email", email);
          if (wlErr) console.warn("[delete_account] waitlist delete:", wlErr.message);
        } else {
          console.warn("[delete_account] no email found for user; beta seat (if any) not freed:", user_id);
        }
      } catch (e) { console.warn("[delete_account] beta seat free threw:", e.message); }

      // 3d. SIGN IN WITH APPLE (App Store guideline 5.1.1(v), 1.1.7): every Apple token kept for this account (migration
      // 0049 apple_tokens, sealed) is revoked at Apple now, just before the sign-in goes, so the app no longer appears
      // under the person's Apple ID. Best effort by design: a failure, a missing setting (APPLE_*) or a token never kept
      // is logged as an outcome with no personal data (_lib/appleTokens.js), the deletion goes on, and the response is
      // unchanged, so the person sees nothing new. The row itself goes with the account (on delete cascade).
      {
        let appleUser = null;
        try { const { data: au } = await admin.auth.admin.getUserById(user_id); appleUser = (au && au.user) || null; } catch { appleUser = null; }
        await revokeAppleTokens(admin, user_id, appleUser);
      }

      // 4. Delete the Supabase auth user (service-role only)
      const { error: authDelErr } = await admin.auth.admin.deleteUser(user_id);
      if (authDelErr) {
        console.error(`[delete_account] auth.admin.deleteUser failed for ${user_id}:`, authDelErr.message);
        errors.push({ step: "auth_delete" });
      }

      const partial = errors.length > 0;
      return ok({ deleted: !authDelErr, partial, errors });
    }

    return e400(`Unknown action: ${action}`);

  } catch (err) {
    console.error("[Plaid]", err.errorCode || "", err.message);

    // Couple mode (audit round 3): who linked the accounts could not be recorded: no bank data goes back.
    if (err.ownerRecord) return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: "unavailable" }) };
    if (err.errorCode === "ITEM_LOGIN_REQUIRED") {
      // balance-truth: recorded on the bank's row, so every device (and list_items) knows this bank needs a fresh
      // sign-in, not only the phone that happened to ask. The answer to the app is unchanged, plus which bank.
      if (reqCtx.owner_id && reqCtx.status !== STATUS_LOGIN_REQUIRED) await setItemStatus(reqCtx.owner_id, reqCtx.item_id, STATUS_LOGIN_REQUIRED);
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Bank session expired. Please reconnect.", needs_reconnect: true, item_id: reqCtx.item_id || null }) };
    }
    if (err.name === "AbortError") {
      return { statusCode: 504, headers: CORS, body: JSON.stringify({ error: "Plaid request timed out. Please try again." }) };
    }

    return {
      statusCode: 500, headers: CORS,
      body: JSON.stringify({
        error:      "Internal error.",
        error_code: err.plaid?.error_code || null,
        error_type: err.plaid?.error_type || null,
      }),
    };
  }
};

// Phase D2: ok() and e400() now live inside the handler (above) so they share
// the per-request CORS headers via closure.

// Phase D1-F-C: resolve access_token from item_id + Authorization JWT.
// (Legacy direct access_token-in-body path removed — frontend now stores tokens
// server-side via store_item and references them by item_id.)
// Returns { access_token, error, statusCode }. On success: { access_token, error: null }.
// On failure: { access_token: null, error: <reason>, statusCode: 400 | 401 }.
// The access token for one of the caller's banks. COUPLE MODE: a bank the other member of the caller's
// household linked is the caller's to read too (accounts, transactions, investments, liabilities), never
// to revoke (ownOnly). The caller's own bank is looked up exactly as before; the household is asked only
// when it is not theirs, and a failed household read finds nothing (the bank is refused, never widened).
// balance-truth: `ctx` (the request's own object) learns whose bank this is and what plaid_items says about it, so
// the handler's catch can record a sign-in that has run out against the right row, and a good answer can clear it.
async function resolveAccessToken(event, body, { ownOnly = false, ctx = null } = {}) {
  if (!body.item_id) {
    return { access_token: null, error: "item_id required", statusCode: 400 };
  }
  const { user_id, error: authError } = await getUserFromRequest(event);
  if (!user_id) {
    return { access_token: null, error: authError || "unauthorized", statusCode: 401 };
  }
  const note = (owner_id, status) => { if (ctx) Object.assign(ctx, { owner_id, item_id: body.item_id, status: status || null }); };
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("plaid_items")
    .select("access_token, status")
    .eq("user_id", user_id)
    .eq("item_id", body.item_id)
    .single();
  if (!error && data) { note(user_id, data.status); return { access_token: data.access_token, user_id, owner_id: user_id, error: null }; }
  if (!ownOnly) {
    try {
      const peers = await household.peerIdsOf(admin, user_id);
      if (peers.length) {
        const { data: theirs, error: peerErr } = await admin
          .from("plaid_items")
          .select("id, user_id, access_token, status")
          .in("user_id", peers)
          .eq("item_id", body.item_id)
          .maybeSingle();
        if (!peerErr && theirs && theirs.access_token) {
          note(theirs.user_id, theirs.status);
          return { access_token: theirs.access_token, user_id, owner_id: theirs.user_id, item_row_id: theirs.id, error: null };
        }
      }
    } catch (e) { console.error("[resolveAccessToken] household:", e.message); }
  }
  // user_id: who asked (they are signed in). Only get_investments reads it, for the kept-holdings answer below.
  return { access_token: null, user_id, error: "item not found for this user", statusCode: 400 };
}

// PLUS: THE KEPT HOLDINGS WHEN THE BANK'S OWN ROW CANNOT BE READ (round 3 of the review, NEW-2). get_investments
// already answers the list the server kept when PLAID cannot be read. When the bank's row itself could not be read
// (so there is no token to ask Plaid with), the request used to stop with "item not found", and a device with no copy
// of its own showed no holdings though the server had them. This is that same answer for that case, and only for
// someone who would have been sent a live one:
//   signed in; Plus is on for them; their app is 1.1.8 or newer; their household has Plus;
//   the list is kept in THEIR name (a row exists only for a bank its owner has connected: 0055), all of it;
//   or in a household partner's name, and then only the accounts that partner shared, by the same choices a live
//   answer reads (net_worth_shares). Nothing shared, or the choices cannot be read: nothing.
// Anyone else, and any fault: null, and the request answers exactly as it did before.
async function keptHoldingsWithoutToken(userId, body) {
  try {
    if (!userId || !body || !body.item_id || !plusAddon.plusEnabledFor(userId) || !plusAddon.plusClientOk(body)) return null;
    const admin = getAdminClient();
    const ent = await plusAddon.getPlusEntitlement(admin, userId);
    if (!ent || !ent.plus) return null;
    const stale = (kept, list) => ({ holdings: list, plus_mode: true, stale: true, as_of: kept.fetched_at });
    const mine = await holdingsStore.loadPlusHoldings(admin, userId, body.item_id);
    if (mine) return stale(mine, mine.holdings);
    for (const peer of await household.peerIdsOf(admin, userId)) {
      const theirs = await holdingsStore.loadPlusHoldings(admin, peer, body.item_id);
      if (!theirs) continue;
      const { data: shares, error } = await admin.from("net_worth_shares").select("account_id, shared").eq("user_id", peer);
      if (error) return null;
      const shared = new Set((shares || []).filter((r) => r.shared === true).map((r) => r.account_id));
      if (!shared.size) return null;
      return stale(theirs, theirs.holdings.filter((h) => h && shared.has(h.account_id)));
    }
    return null;
  } catch (e) { console.error("[plaid] kept holdings:", e && e.message); return null; }
}

// list_items' rows, oldest first. balance-truth adds transactions_pending (the webhook's "new transactions are
// waiting"). Production has that column; a database built only from supabase/migrations does not (00001 says
// production is right there), so a missing column falls back to the columns listed before, never to no banks.
const ITEM_COLUMNS = "id, item_id, institution_id, institution_name, status, created_at, updated_at";
async function listItemRows(admin, scope) {
  const run = (cols) => scope(admin.from("plaid_items").select(cols)).order("created_at", { ascending: true });
  const first = await run(ITEM_COLUMNS + ", transactions_pending");
  if (first.error && (first.error.code === "42703" || /transactions_pending/.test(String(first.error.message || "")))) return run(ITEM_COLUMNS);
  return first;
}

// balance-truth: plaid_items.status for a bank whose sign-in has run out (Plaid's ITEM_LOGIN_REQUIRED), and the
// statuses a good answer from the bank clears. The webhook writes "error" for ITEM:ERROR; the app treats both as
// "this bank needs a fresh sign-in" (src/lib/balanceTruth.js SIGN_IN_STATUSES).
const STATUS_LOGIN_REQUIRED = "login_required";
const STATUSES_CLEARED_BY_AN_ANSWER = ["login_required", "error"];
// Best-effort: a failed write is logged by its code only and never changes the answer to the app.
async function setItemStatus(ownerId, itemId, status) {
  if (!ownerId || !itemId) return;
  try {
    const { error } = await getAdminClient().from("plaid_items").update({ status }).eq("user_id", ownerId).eq("item_id", itemId);
    if (error) console.error("[plaid_items status]", error.code || "error");
  } catch (e) { console.error("[plaid_items status] threw"); }
}

// /transactions/sync — cursor-based incremental sync (Sprint Z #1/#3).
// Reads the per-item cursor from plaid_items.next_cursor (NULL → full sync from the start),
// pages until has_more is false or the page cap is hit, dedups added+modified by transaction_id
// (modified overwrites added), collects removed ids, persists the cursor reached, and flags
// truncation so the caller knows more pages remain (the next sync resumes from the saved cursor).
//
// Delivery is at-least-once: the client applies changes idempotently via mergeById, so a
// re-delivered page is harmless. The only residual risk (a dropped 200 after the cursor was
// persisted) is recoverable with a full_resync.
const SYNC_PAGE_CAP = 10;
async function syncTransactions(access_token, startDate, endDate, ctx = {}) {
  const { user_id, item_id, owner_id = user_id, item_row_id = null, fullResync = false } = ctx;
  const canPersist = !!(user_id && item_id);
  const admin = canPersist ? getAdminClient() : null;
  // Couple mode: a bank the other member linked. Its cursor in plaid_items is the linker's; this member keeps
  // their own (plaid_item_cursors, migration 0031), so neither phone consumes the other's new transactions.
  const memberCursor = !!(admin && owner_id && owner_id !== user_id && item_row_id);

  // Starting cursor: the stored cursor unless a full resync is forced.
  let startCursor = null;
  if (admin && !fullResync && memberCursor) {
    const { data, error } = await admin
      .from("plaid_item_cursors")
      .select("next_cursor")
      .eq("plaid_item_id", item_row_id)
      .eq("user_id", user_id)
      .maybeSingle();
    if (!error) startCursor = data?.next_cursor || null;
  } else if (admin && !fullResync) {
    const { data, error } = await admin
      .from("plaid_items")
      .select("next_cursor")
      .eq("user_id", user_id)
      .eq("item_id", item_id)
      .single();
    if (!error) startCursor = data?.next_cursor || null;
  }

  // Page loop with Plaid sync recovery (L4): a dataset mutation mid-pagination restarts from where
  // we began; a stale/invalid cursor restarts from null (full). Bounded retries, then propagate.
  let attempt = 0;
  while (true) {
    attempt++;
    let cursor    = startCursor;
    const isFull  = !cursor; // null cursor → full sync from the beginning
    const byId    = new Map(); // transaction_id → txn (modified overwrites added)
    const removed = [];
    const accounts = new Map(); // account_id → { type, subtype }, from the sync pages themselves
    let hasMore   = true;
    let pages     = 0;
    let updateStatus = null; // balance-truth: how far Plaid's first pull has got (the last page says)

    try {
      while (hasMore && pages < SYNC_PAGE_CAP) {
        const req = { access_token, options: { include_personal_finance_category: true } };
        if (cursor) req.cursor = cursor;

        const page = await plaid("/transactions/sync", req);
        (page.added    || []).forEach(t => byId.set(t.transaction_id, t));
        (page.modified || []).forEach(t => byId.set(t.transaction_id, t));
        (page.removed  || []).forEach(r => { if (r.transaction_id) removed.push(r.transaction_id); });
        (page.accounts || []).forEach(a => { if (a && a.account_id) accounts.set(a.account_id, a); });
        cursor  = page.next_cursor;
        hasMore = page.has_more;
        if (page.transactions_update_status) updateStatus = page.transactions_update_status;
        pages++;
      }
    } catch (err) {
      if (err.errorCode === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" && attempt <= 3) {
        continue; // data changed mid-pagination → restart this sync from startCursor
      }
      if (err.errorCode === "PAGINATION_INVALID_CURSOR" && attempt <= 2) {
        startCursor = null; // bad cursor → fall back to a full sync
        continue;
      }
      throw err;
    }

    const truncated = hasMore; // stopped at the cap with more pages remaining

    // Couple mode: who linked these accounts is recorded before the cursor moves on; a failure throws, and the
    // cursor stays where it was (get_transactions answers 503).
    if (ctx.recordOwners) await ctx.recordOwners([...accounts.keys(), ...Array.from(byId.values()).map((t) => t && t.account_id)]);

    // Persist the cursor reached so the next sync resumes (incremental advance, or truncation resume).
    if (admin && cursor && memberCursor) {
      const { error } = await admin
        .from("plaid_item_cursors")
        .upsert({ plaid_item_id: item_row_id, user_id, next_cursor: cursor, updated_at: new Date().toISOString() }, { onConflict: "plaid_item_id,user_id" });
      if (error) console.error("[syncTransactions member cursor persist]", error.message);
    } else if (admin && cursor) {
      const { error } = await admin
        .from("plaid_items")
        .update({ next_cursor: cursor })
        .eq("user_id", user_id)
        .eq("item_id", item_id);
      if (error) console.error("[syncTransactions cursor persist]", error.message);
    }

    // Every row is labelled with its account's type (the client keeps a loan's own entries out of
    // the figures: src/lib/loanActivity.js). Sync pages normally carry the accounts; if a page did
    // not, one /accounts/get call supplies them.
    if (byId.size && !accounts.size) {
      try { ((await plaid("/accounts/get", { access_token })).accounts || []).forEach(a => accounts.set(a.account_id, a)); }
      catch (e) { console.error("[syncTransactions accounts]", e.errorCode || e.message); }
    }
    return {
      transactions: normalizeTxns(Array.from(byId.values()), startDate, endDate, accounts),
      removed,
      truncated,
      full: isFull,
      updateStatus,
    };
  }
}

// /transactions/get — date-range based, more reliable on fresh sandbox items
async function getTransactions(access_token, startDate, endDate) {
  const data = await plaid("/transactions/get", {
    access_token,
    start_date: startDate,
    end_date:   endDate,
    options: {
      count: 500, offset: 0,
      include_personal_finance_category: true,
      include_original_description:      true,
    },
  });
  return normalizeTxns(data.transactions || [], startDate, endDate, new Map((data.accounts || []).map(a => [a.account_id, a])));
}

// Normalize raw Plaid transactions → Flourish shape. `accounts` (account_id → Plaid account) labels
// each row with its account's type and subtype; a row whose account is not in the response gets null.
function normalizeTxns(txns, startDate, endDate, accounts = new Map()) {
  return txns
    .filter(t => t.date >= startDate && t.date <= endDate)
    .map(t => ({
      id:         t.transaction_id,
      account_id: t.account_id,
      date:       t.date,
      name:       t.merchant_name || t.original_description || t.name,
      amount:     t.amount,
      category:   t.personal_finance_category?.primary || t.category?.[0] || "OTHER",
      currency:   t.iso_currency_code || "CAD",
      pending:    t.pending,
      logo_url:   t.logo_url || null,
      account_type:    accounts.get(t.account_id)?.type ?? null,
      account_subtype: accounts.get(t.account_id)?.subtype ?? null,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
