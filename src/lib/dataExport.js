// src/lib/dataExport.js
// -----------------------------------------------------------------------------
// SETTINGS > YOUR DATA > EXPORT MY DATA (review 2026-11-22: ChatGPT P9-03, Gemini G6).
//
// Two things were wrong with the export in App.jsx:
//   P9-03  It was a fixed list of eleven parts written when the app was smaller. Holdings, loan and card details from
//          the bank, the category rules by merchant, the net-worth history, the kids' data and anything added since
//          were left out of a file the screen calls "everything you've entered".
//   G6     It was handed over as a download link (<a download> on a blob: address). A browser saves that. The iPhone
//          and Android apps' WebView does not (neither shell has a download handler), so the button did nothing.
//
// buildExport: every part of the household's data, under the names the file already used, plus `more` for any part
// not named here (so a part added later cannot be left out again), plus the stores kept beside it on this device.
// Never a token, a session, or a device flag: the side stores are an exact list.
// deliverExport: a browser downloads the file; a store app opens the system share sheet with the file (Save to
// Files, Mail, ...), or with the same JSON as text where the WebView cannot share a file. It answers what happened,
// so the caller can say so when nothing worked. PURE but for the functions it is handed.
// -----------------------------------------------------------------------------

export const EXPORT_SCHEMA = 2;
// The most JSON handed to the share sheet as plain text (an Android intent carries about 1 MB in all).
export const SHARE_TEXT_LIMIT = 200000;

// The parts the file has always named, in its order.
const NAMED = ["profile", "incomes", "bills", "debts", "goals", "budgets", "accounts", "transactions", "forecastEdits", "depositDecisions", "depositRules", "investments", "liabilities"];
const LISTS = new Set(["incomes", "bills", "debts", "goals", "accounts", "transactions", "investments"]);
// Never exported: the sample-data marker.
const SKIP = new Set(["demo"]);

const json = (storage, k, fallback) => { try { const v = storage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } };

/** The stores kept beside the household's data on this device. An exact list: nothing else in storage is read. */
export function readExportStores(storage, { loanActivityKey = null } = {}) {
  const out = { customCategories: [], categoryOverrides: {}, coachHistory: null, merchantCategoryRules: {}, netWorthHistory: [], loanActivity: [], kids: {}, streak: null };
  if (!storage) return out;
  out.customCategories = json(storage, "flourish_custom_cats", []);
  out.categoryOverrides = json(storage, "flourish_cat_overrides", {});
  out.coachHistory = json(storage, "flourish_coach_history", null);
  out.merchantCategoryRules = json(storage, "flourish_cat_merchant_overrides", {});
  out.netWorthHistory = json(storage, "flourish_nw_history", []);
  out.streak = json(storage, "flourish_streak", null);
  if (loanActivityKey) out.loanActivity = json(storage, loanActivityKey, []);
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k === "flourish_kids" || (typeof k === "string" && k.startsWith("flourish_kid_"))) out.kids[k] = json(storage, k, null);
    }
  } catch { /* storage blocked: the rest still exports */ }
  return out;
}

/** The export file's contents. `data` is the app's household data; `stores` is readExportStores(). */
export function buildExport(data, stores, now = new Date()) {
  const d = data && typeof data === "object" ? data : {};
  const s = stores || {};
  const out = {
    _meta: { app: "Flourish Money", schema: EXPORT_SCHEMA, exportedAt: now.toISOString(),
             note: "Your Flourish data, exported for your records / portability." },
  };
  for (const k of NAMED) {
    if (k === "profile") out[k] = d.profile || null;
    else out[k] = d[k] || (LISTS.has(k) ? [] : {});
  }
  out.customCategories = s.customCategories ?? [];
  out.categoryOverrides = s.categoryOverrides ?? {};
  out.coachHistory = s.coachHistory ?? null;
  out.merchantCategoryRules = s.merchantCategoryRules ?? {};
  out.netWorthHistory = s.netWorthHistory ?? [];
  out.loanActivity = s.loanActivity ?? [];
  out.kids = s.kids ?? {};
  out.streak = s.streak ?? null;
  const more = {};
  for (const [k, v] of Object.entries(d)) if (!NAMED.includes(k) && !SKIP.has(k) && v !== undefined) more[k] = v;
  out.more = more;
  return out;
}

const isCancel = (e) => /cancel|abort/i.test(String((e && (e.name || "")) + " " + ((e && e.message) || e || "")));

/**
 * Hand the file over ({ json, filename, text? }). deps: platform ("web" | "ios" | "android"), download({json, filename}) for a browser,
 * shareFile({json, filename}) (null when the WebView cannot share a file) and shareText({title, text}) for a store app.
 * Resolves "downloaded", "shared", "cancelled" (the person closed the share sheet) or "failed". Never throws.
 */
export async function deliverExport(file, deps = {}) {
  const { platform = "web", download = null, shareFile = null, shareText = null } = deps;
  const native = platform === "ios" || platform === "android";
  if (!native) {
    try { if (download) { await download(file); return "downloaded"; } } catch { /* failed below */ }
    return "failed";
  }
  if (shareFile) {
    try { await shareFile(file); return "shared"; }
    catch (e) { if (isCancel(e)) return "cancelled"; /* this WebView would not: try text */ }
  }
  const text = typeof file.text === "string" ? file.text : file.json;   // the caller may hand a compact copy for this
  if (shareText && text.length <= SHARE_TEXT_LIMIT) {
    try { await shareText({ title: file.filename, text }); return "shared"; }
    catch (e) { if (isCancel(e)) return "cancelled"; }
  }
  return "failed";
}
