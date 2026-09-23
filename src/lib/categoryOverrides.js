// src/lib/categoryOverrides.js
// -----------------------------------------------------------------------------
// A CORRECTION THAT LASTS: categories remembered against the MERCHANT, not the row.
//
// The app already had a correction UI (App.jsx recat / recatWithSmartPrompt) and a synced
// store, flourish_cat_overrides. What it did not have is memory: the store is keyed by
// transaction id (financialCalculations.js getEffCat: `catOverrides[t.id] || t.cat`), and
// "apply to all" stamped only the transactions that existed at that moment. Tomorrow's
// charge from the same merchant arrived uncorrected, and the household corrected it again.
//
// Two id hazards made that worse, and are why this module keys on the name:
//   • statement rows are RE-NUMBERED on every import (App.jsx: `stmt_${i}` across the whole
//     merged array), so a per-id override silently re-points at a different transaction
//   • statement and CSV rows never went through normaliseTxns, so they have no `cat` at all
//
// WHY BOTH LAYERS STILL EXIST. A per-transaction override means "this particular charge was
// not what it looked like" — one grocery run at a shop that is usually coffee. A merchant
// override means "this merchant is always X". Collapsing them would make every one-off
// correction rewrite the household's history, so the per-id layer stays and wins.
//
// Resolution order, most specific first:
//   1. an override on this transaction's id
//   2. an override on this transaction's merchant name
//   3. the category the transaction arrived with
//   4. "Other" — never undefined, which is what statement rows render today
// -----------------------------------------------------------------------------

// The category a transaction falls back to. Matches what CAT_META's own fallback produces
// (plaidNormalize.js), so a statement row and a Plaid row of unknown type look the same.
export const FALLBACK_CATEGORY = "Other";

// ONE OWNER for "are these the same merchant". billReeval.js already had to answer this to group
// recurring charges, and its answer is the better one: it strips POS prefixes and trailing account
// numbers before lowercasing, so "SQ *COFFEE 4821" and "COFFEE" are one merchant. Re-exported here
// rather than reimplemented, because two nearly-identical keys is how a correction ends up applying
// to a set of transactions that is not the set the user was shown a count of.
//
// (The old "apply to all" prompt used a plainer name.toLowerCase().trim(). Sharing this key makes
// the count the prompt shows and the rule it writes agree, which they did not before.)
export { merchantKey } from "./billReeval.js";
import { merchantKey } from "./billReeval.js";

// A merchant key is only meaningful if there is enough of it to match on. The existing prompt
// uses 3 characters; anything shorter would collide merchants that are not the same.
export const MIN_MERCHANT_KEY = 3;
export function isUsableMerchantKey(key) {
  return typeof key === "string" && key.length >= MIN_MERCHANT_KEY;
}

/**
 * Accepts either shape and always returns { byId, byMerchant }:
 *   • the legacy flat map { [txnId]: category } that flourish_cat_overrides has always been
 *   • the split form { byId, byMerchant }
 * The legacy form must keep working untouched — it is live in every existing household's
 * storage and is threaded through four engine methods.
 */
export function normaliseOverrides(overrides) {
  const o = overrides || {};
  if (o.byId || o.byMerchant) {
    return { byId: o.byId || {}, byMerchant: o.byMerchant || {} };
  }
  return { byId: o, byMerchant: {} };
}

/**
 * The category to use for this transaction. `merchantOverrides` may be passed separately
 * (that is how it is stored: a second synced key) or carried inside `overrides`.
 */
export function effectiveCategory(txn, overrides, merchantOverrides = null) {
  const t = txn || {};
  const { byId, byMerchant } = normaliseOverrides(overrides);
  const merchants = merchantOverrides || byMerchant;

  const byIdHit = t.id != null ? byId[t.id] : undefined;
  if (byIdHit) return byIdHit;

  const key = merchantKey(t.name);
  if (isUsableMerchantKey(key) && merchants[key]) return merchants[key];

  return t.cat || FALLBACK_CATEGORY;
}

// Record "this merchant is always X". Returns a new map; never mutates.
export function setMerchantOverride(merchantOverrides, name, category) {
  const key = merchantKey(name);
  const next = { ...(merchantOverrides || {}) };
  if (!isUsableMerchantKey(key) || !category) return next;
  next[key] = category;
  return next;
}

// Record "this one charge was X". Returns a new map; never mutates.
export function setTxnOverride(byId, txnId, category) {
  const next = { ...(byId || {}) };
  if (txnId == null || !category) return next;
  next[txnId] = category;
  return next;
}

// Forget a merchant rule, so the household can undo "always X" without editing storage.
export function clearMerchantOverride(merchantOverrides, name) {
  const key = merchantKey(name);
  const next = { ...(merchantOverrides || {}) };
  delete next[key];
  return next;
}

// How many transactions a merchant rule would change, for the "apply to all N" copy.
export function countMatching(txns, name) {
  const key = merchantKey(name);
  if (!isUsableMerchantKey(key)) return 0;
  return (Array.isArray(txns) ? txns : []).filter(t => merchantKey(t && t.name) === key).length;
}
