// src/NetWorthPlusScreen.jsx
// -----------------------------------------------------------------------------
// NET WORTH WITH PLUS (2026-11-10, docs/product/NET-WORTH-SPEC.md). Goals' Net Worth tab for a household with Plus.
// Private by default between partners (Amanda): each person sees their own accounts, holdings and entries, what their
// partner shared, and what both already see as the household's. A household total only when every part is shared
// and real (src/lib/netWorthPlus.js viewerNetWorth); otherwise their own. Nothing here is estimated, and nothing is
// added across currencies. Every line is a placeholder until approved (src/lib/netWorthWords.js).
// -----------------------------------------------------------------------------
import React, { useState } from "react";
import { viewerNetWorth } from "./lib/netWorthPlus.js";
import { netWorthWords as W } from "./lib/netWorthWords.js";

const font = "'Plus Jakarta Sans',sans-serif";
// A figure in its own currency, with the currency named: never a bare "$" that could be either.
export function moneyIn(cents, currency) {
  if (!Number.isFinite(cents) || !currency) return "—";
  const v = Math.abs(cents) / 100;
  const s = v.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${cents < 0 ? "−" : ""}${currency} ${s}`;
}

function Part({ p, C, onShare, canShare, onDelete }) {
  const reg = p.registration === "registered" ? W("networth-plus-registered") : p.registration === "non_registered" ? W("networth-plus-non-registered") : null;
  return (
    <div data-nw-part={p.id || ""} style={{ padding: "10px 0", borderTop: `1px solid ${C.border || "rgba(255,255,255,0.08)"}`, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
        <div style={{ color: C.cream, fontFamily: font, fontSize: 14, minWidth: 0, overflowWrap: "anywhere" }}>
          {p.label || p.kind}{reg ? <span style={{ color: C.muted, fontSize: 13 }}> · {reg}</span> : null}
        </div>
        <div style={{ color: (p.cents || 0) < 0 ? C.redBright : C.cream, fontFamily: font, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" }}>{moneyIn(p.cents, p.currency)}</div>
      </div>
      {p.problems && p.problems.length > 0 && <div style={{ color: C.goldBright || C.muted, fontSize: 13, fontFamily: font, marginTop: 2 }}>{W("networth-plus-part-missing")}</div>}
      {Array.isArray(p.holdings) && p.holdings.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {p.holdings.map((h, i) => (
            <div key={h.id || i} style={{ display: "flex", justifyContent: "space-between", gap: 8, color: C.muted, fontSize: 13, fontFamily: font, minWidth: 0 }}>
              <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{h.ticker || h.name}</span><span style={{ whiteSpace: "nowrap" }}>{moneyIn(h.cents, h.currency)}</span>
            </div>
          ))}
        </div>
      )}
      {canShare && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, color: C.mutedHi || C.muted, fontSize: 13, fontFamily: font, minHeight: 44, cursor: "pointer" }}>
          <input type="checkbox" checked={!!p.shared} onChange={(e) => onShare(p, e.target.checked)} style={{ width: 20, height: 20 }} />
          <span>{W("networth-plus-share")}</span>
        </label>
      )}
      {canShare && p.sensitive && <div style={{ color: C.muted, fontSize: 13, fontFamily: font }}>{W("networth-plus-share-sensitive")}</div>}
      {onDelete && p.source === "entered" && <button onClick={() => onDelete(p)} style={{ marginTop: 4, background: "none", border: "none", color: C.muted, fontSize: 13, fontFamily: font, padding: 0, minHeight: 44, cursor: "pointer" }}>{W("networth-plus-delete")}</button>}
    </div>
  );
}

/**
 * props: data, holdings, list, ownerOf, C (theme), and the three calls, each resolving true when the server took it:
 *   onSaveEntry({ id?, kind, label, value, currency, shared }), onDeleteEntry(id), onShareAccount(account_id, shared)
 */
export default function NetWorthPlusScreen({ data, holdings, list, ownerOf, C, onSaveEntry, onDeleteEntry, onShareAccount }) {
  const v = viewerNetWorth({ data, holdings, list, ownerOf });
  const hasPartner = !!(list && list.partner);
  const [draft, setDraft] = useState(null);
  const [failed, setFailed] = useState(false);
  const run = async (p) => { setFailed(false); const ok = await p; if (!ok) setFailed(true); return ok; };
  const share = (p, on) => run(p.source === "linked"
    ? onShareAccount(p.id, on)
    : onSaveEntry({ id: p.id, kind: p.kind, label: p.label, value: p.cents / 100, currency: p.currency, shared: on }));
  const del = (p) => run(onDeleteEntry(p.id));
  const save = async () => {
    const value = Number(String(draft.value || "").replace(/,/g, ""));
    if (!Number.isFinite(value) || value < 0 || !draft.kind || !draft.currency) { setFailed(true); return; }
    if (await run(onSaveEntry({ kind: draft.kind, label: draft.label || "", value, currency: draft.currency, shared: draft.shared === true }))) setDraft(null);
  };
  const card = { background: C.card || "rgba(255,255,255,0.04)", borderRadius: 18, padding: "14px 16px", marginBottom: 12, minWidth: 0, boxSizing: "border-box", width: "100%" };
  const h = { color: C.muted, fontFamily: font, fontSize: 13, fontWeight: 700, marginBottom: 4 };
  const field = { width: "100%", boxSizing: "border-box", minHeight: 44, borderRadius: 10, border: `1px solid ${C.border || "#444"}`, background: "transparent", color: C.cream, fontFamily: font, fontSize: 15, padding: "8px 10px", marginTop: 6 };
  return (
    <div data-networth-plus style={{ minWidth: 0, maxWidth: "100%" }}>
      <div style={card}>
        <div style={{ color: C.cream, fontFamily: font, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{W("networth-plus-title")}</div>
        {v.totals ? (
          <>
            <div style={{ color: C.muted, fontSize: 13, fontFamily: font, marginBottom: 6 }}>{W(v.showing === "household" ? "networth-plus-household-total" : "networth-plus-your-total")}</div>
            {v.totals.map((t) => <div key={t.currency} data-nw-total={t.currency} style={{ color: t.netCents < 0 ? C.redBright : C.tealBright, fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 900, overflowWrap: "anywhere" }}>{moneyIn(t.netCents, t.currency)}</div>)}
          </>
        ) : <div data-nw-no-total style={{ color: C.muted, fontSize: 13, fontFamily: font }}>{W("networth-plus-no-total")}</div>}
      </div>
      <div style={card}>
        <div style={h}>{W("networth-plus-yours")}</div>
        {v.mine.map((p) => <Part key={`m-${p.source}-${p.id}`} p={p} C={C} canShare={hasPartner} onShare={share} onDelete={del} />)}
        {draft ? (
          <div style={{ marginTop: 10 }}>
            <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} style={field} aria-label={W("networth-plus-add")}>
              <option value="home">{W("networth-plus-kind-home")}</option>
              <option value="car">{W("networth-plus-kind-car")}</option>
              <option value="pension">{W("networth-plus-kind-pension")}</option>
            </select>
            <input value={draft.label} maxLength={60} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="" aria-label={W("networth-plus-entry-label")} style={field} />
            <input value={draft.value} inputMode="decimal" onChange={(e) => setDraft({ ...draft, value: e.target.value })} aria-label={W("networth-plus-entry-value")} style={field} />
            <select value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })} style={field} aria-label={W("networth-plus-entry-currency")}>
              <option value="CAD">CAD</option><option value="USD">USD</option>
            </select>
            {hasPartner && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, color: C.muted, fontSize: 13, fontFamily: font, minHeight: 44 }}>
                <input type="checkbox" checked={draft.shared === true} onChange={(e) => setDraft({ ...draft, shared: e.target.checked })} style={{ width: 20, height: 20 }} />
                <span>{W("networth-plus-share")}</span>
              </label>
            )}
            <button onClick={save} style={{ marginTop: 8, minHeight: 44, width: "100%", borderRadius: 12, border: "none", background: C.teal, color: "#fff", fontFamily: font, fontWeight: 700, cursor: "pointer" }}>{W("networth-plus-save")}</button>
          </div>
        ) : (
          <button onClick={() => setDraft({ kind: "home", label: "", value: "", currency: (data && data.profile && data.profile.country === "US") ? "USD" : "CAD", shared: false })}
            style={{ marginTop: 10, minHeight: 44, width: "100%", borderRadius: 12, border: `1px solid ${C.teal}`, background: "none", color: C.tealBright || C.teal, fontFamily: font, fontWeight: 700, cursor: "pointer" }}>{W("networth-plus-add")}</button>
        )}
        {failed && <div role="alert" style={{ color: C.redBright, fontSize: 13, fontFamily: font, marginTop: 6 }}>{W("networth-plus-error")}</div>}
      </div>
      {hasPartner && v.partner.length > 0 && (
        <div style={card}>
          <div style={h}>{W("networth-plus-partner")}</div>
          {v.partner.map((p) => <Part key={`p-${p.source}-${p.id}`} p={p} C={C} canShare={false} />)}
        </div>
      )}
      {v.household.length > 0 && (
        <div style={card}>
          <div style={h}>{W("networth-plus-household")}</div>
          {v.household.map((p) => <Part key={`h-${p.source}-${p.id}`} p={p} C={C} canShare={false} />)}
        </div>
      )}
    </div>
  );
}
