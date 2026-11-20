// src/PlusAddonScreen.jsx
// -----------------------------------------------------------------------------
// THE FLOURISH PLUS SCREEN (2026-11-20, 1.1.8): buy the add-on, and manage it once bought. Behind PLUS_ENABLED: the
// app mounts this only when the server has answered plus_status (src/App.jsx), and what it shows comes from that
// answer alone (src/lib/plusBuy.js plusScreenView).
//
//   the website         two plans at our price (CAD plus tax); the button asks the server for a Stripe Checkout and
//                       goes there. Once bought: "Manage subscription" opens Stripe's portal for Plus.
//   iPhone, Android     the store's two products at the store's own price, the store disclosure, Restore purchases,
//                       Terms of Use and Privacy Policy. Once bought: "Manage subscription" opens the store's own screen.
//                       Nothing here names the website, links to it or shows its price.
//
// THE PRODUCTS MAY NOT EXIST YET: then the screen says so in one calm line and offers nothing to tap. No answer from
// the store or the server is ever a crash, a blank screen or a charge.
//
// Words: src/lib/netWorthWords.js (plus-buy-*, placeholders until approved) and approved lines reused as they are.
// -----------------------------------------------------------------------------
import React, { useEffect, useRef, useState } from "react";
import { netWorthWords as W } from "./lib/netWorthWords.js";
import { PAYWALL_COPY, APPLE_EULA_URL, storeDisclosure } from "./lib/storeOffer.js";
import { SPACE, LAYOUT, GAP } from "./lib/space.js";
import { pushBackHandler } from "./lib/backButton.js";
import {
  plusScreenView, plusIncludes, plusWebCards, plusStoreCards, loadPlusPackages, buyPlusInStore, restorePlus,
  confirmPlusWithServer, startPlusCheckout, openPlusPortal, confirmPlusOnWeb, plusOutcomeLine,
} from "./lib/plusBuy.js";

const font = "'Plus Jakarta Sans',sans-serif";

/**
 * props:
 *   C              the theme's colours
 *   platform       "web" | "ios" | "android"
 *   selling        this build can sell: the website, or a store build with purchases on
 *   answer         the server's last plus_status answer ({ status, body } | null | undefined)
 *   purchases      RevenueCat's Purchases object in a selling store build, else null
 *   ask            (action, params) => { status, body } | null   (the server's Plus actions)
 *   onAnswer       (res) => void    a fresh plus_status / plus_store_sync answer, for the app to take
 *   returnNotice   "success" | "cancelled" | "portal_return" | null   (back from Stripe)
 *   onClose, onViewLegal(screen), onManageStore, goTo(url), buttonText
 */
export default function PlusAddonScreen({ C, platform = "web", selling = false, answer, purchases = null, ask, onAnswer, returnNotice = null,
  onClose, onViewLegal, onManageStore, goTo, buttonText = "#FFFFFF" }) {
  const web = platform === "web";
  const view = plusScreenView(answer, { platform, selling });
  const [store, setStore] = useState(null);       // loadPlusPackages' answer, in a store app
  const [busy, setBusy] = useState(null);         // a plan key, "restore", "check" or "manage"
  const [outcome, setOutcome] = useState(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => pushBackHandler(() => { if (onClose) onClose(); return true; }), [onClose]);

  const serverStatus = () => ask("plus_status", {});
  const take = (r) => { if (r && r.answer && onAnswer) onAnswer(r.answer); };
  const leave = (url) => { if (goTo) goTo(url); else if (typeof window !== "undefined") window.location.href = url; };

  // A store app: what the store has to sell. Asked once the screen is an offer, never on the website.
  const offering = view.mode === "offer";
  useEffect(() => {
    let cancelled = false;
    if (web || !offering) return undefined;
    setStore(null);
    loadPlusPackages(purchases).then((s) => { if (!cancelled) setStore(s); });
    return () => { cancelled = true; };
  }, [web, offering, purchases]);

  // Back from Stripe. Nothing is set from the URL: the server is asked, and the screen says what it answered.
  useEffect(() => {
    let cancelled = false;
    if (!returnNotice) return undefined;
    if (returnNotice === "cancelled") { setOutcome("web_cancelled"); return undefined; }
    (async () => {
      if (returnNotice === "success") setOutcome("started");
      const r = returnNotice === "success" ? await confirmPlusOnWeb({ serverStatus }) : { outcome: null, answer: await serverStatus().catch(() => null) };
      if (cancelled) return;
      if (r.answer && onAnswer) onAnswer(r.answer);
      if (returnNotice === "success") setOutcome(r.outcome === "plus" ? null : "started");
    })();
    return () => { cancelled = true; };
  }, [returnNotice]);

  const run = async (key, work) => {
    if (busy) return;
    setBusy(key); setOutcome(null);
    try {
      const r = await work();
      if (!alive.current) return;
      if (r.outcome === "redirect") { leave(r.url); return; }
      take(r);
      setOutcome(r.outcome);
      // The household already has it, or the plan could not be read: ask once more, so the screen shows what is true.
      if (r.outcome === "already_plus" && !r.answer) { const s = await serverStatus().catch(() => null); if (alive.current && s && onAnswer) onAnswer(s); }
    } catch { if (alive.current) setOutcome(web ? "web_failed" : "failed"); }
    finally { if (alive.current) setBusy(null); }
  };
  const storeDeps = {
    serverStatus,
    serverSync: () => ask("plus_store_sync", {}),
    purchasePackage: (pkg) => purchases.purchasePackage({ aPackage: pkg }),
    restorePurchases: () => purchases.restorePurchases(),
  };
  const buy = (card) => run(card.planKey, () => (web ? startPlusCheckout({ ask }, card.planKey) : buyPlusInStore(storeDeps, card.pkg)));
  const restore = () => run("restore", () => (purchases ? restorePlus(storeDeps) : Promise.resolve({ outcome: "store_unavailable" })));
  // "Check again": after a store purchase that has not settled, the server is asked to look at the store again; in
  // every other case it is only asked what it knows. Whatever it says is what the screen then shows.
  const was = outcome;
  const check = () => run("check", async () => {
    if (!web && purchases && (was === "pending" || was === "unconfirmed")) {
      const r = await confirmPlusWithServer(storeDeps, { tries: 2 });
      return r.outcome === "unconfirmed" ? { outcome: was } : r;
    }
    const s = await serverStatus().catch(() => null);
    if (s && onAnswer) onAnswer(s);
    if (!s || s.status !== 200) return { outcome: "status_unavailable" };
    return { outcome: was === "started" && !(s.body && s.body.plus) ? "started" : null };
  });
  const manage = () => {
    if (view.manage === "store") { if (onManageStore) onManageStore(); return; }
    if (view.manage === "portal") run("manage", () => openPlusPortal({ ask }));
  };

  const cards = !offering ? [] : web ? plusWebCards() : (store && store.state === "ready" ? plusStoreCards(store.packages, platform) : []);
  // The store has nothing to sell (the products are not created yet), or could not be reached: one line, no button.
  const storeLine = offering && !web && store && store.state !== "ready" ? plusOutcomeLine(store.state === "not_available" ? "not_available" : "store_unavailable")
    : offering && !web && store && store.state === "ready" && cards.length === 0 ? plusOutcomeLine("not_available") : null;
  const waiting = outcome === "pending" || outcome === "unconfirmed" || outcome === "started";
  const line = plusOutcomeLine(outcome);

  const link = { background: "none", border: "none", color: C.mutedHi, fontSize: 13, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", padding: `${SPACE.sm}px ${SPACE.xs}px`, minHeight: LAYOUT.minTap };
  const quiet = { width: "100%", minHeight: LAYOUT.minTap, background: "none", border: `1px solid ${C.border}`, borderRadius: 12, padding: SPACE.md, color: C.cream, fontWeight: 700, fontSize: 14, fontFamily: "inherit" };
  const text = { color: C.mutedHi, fontSize: 14, lineHeight: 1.6, overflowWrap: "anywhere" };
  const small = { color: C.muted, fontSize: 13, lineHeight: 1.6, overflowWrap: "anywhere" };

  return (
    <div data-plus-screen={view.mode} data-plus-platform={platform} style={{ background: C.bg, fontFamily: font, color: C.cream, display: "flex", justifyContent: "center", minHeight: "100%" }}>
      <div style={{ width: "100%", maxWidth: 430, padding: `${SPACE.xl}px ${SPACE.lg}px ${SPACE.xxl}px`, boxSizing: "border-box" }}>
        {onClose && <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button aria-label={PAYWALL_COPY.close} onClick={onClose} style={{ background: "none", border: "none", color: C.mutedHi, fontSize: 20, cursor: "pointer", minWidth: LAYOUT.minTap, minHeight: LAYOUT.minTap }}>✕</button>
        </div>}
        <h1 style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 24, fontWeight: 900, textAlign: "center", margin: `0 0 ${SPACE.sm}px`, overflowWrap: "anywhere" }}>{W("plus-buy-title")}</h1>

        {view.mode === "unavailable" && <div role="status" data-plus-unavailable="" style={{ ...text, textAlign: "center", marginBottom: SPACE.lg }}>{view.line}</div>}

        {view.mode === "have" && <div data-plus-have="">
          <div style={{ ...text, textAlign: "center", marginBottom: SPACE.lg }}>{view.line}</div>
          {view.manage && <button data-plus-manage={view.manage} onClick={manage} disabled={!!busy} style={{ ...quiet, cursor: busy ? "default" : "pointer" }}>Manage subscription</button>}
          {view.note && <div data-plus-manage-note="" style={{ ...small, textAlign: "center" }}>{view.note}</div>}
        </div>}

        {offering && <div data-plus-offer="">
          <div style={{ ...text, textAlign: "center", marginBottom: SPACE.lg }}>{view.line}</div>
          <ul style={{ listStyle: "none", padding: 0, margin: `0 0 ${SPACE.md}px`, display: "flex", flexDirection: "column", gap: SPACE.sm }}>
            {plusIncludes().map((x, i) => <li key={i} style={{ ...text, color: C.cream, display: "flex", gap: SPACE.sm }}><span aria-hidden="true" style={{ color: C.tealBright || C.teal }}>✓</span><span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{x}</span></li>)}
          </ul>
          <div style={{ ...small, marginBottom: SPACE.lg }}>{W("plus-buy-separate")}</div>

          {!web && !store && <div role="status" style={{ ...small, textAlign: "center", padding: `${SPACE.lg}px 0` }}>{PAYWALL_COPY.checking}</div>}
          {storeLine && <div role="status" data-plus-store-line={store.state} style={{ ...text, textAlign: "center", padding: `${SPACE.md}px 0` }}>{storeLine}</div>}

          <div style={{ display: "flex", flexDirection: "column", gap: LAYOUT.cardGap }}>
            {cards.map((card) => (
              <div key={card.planKey} data-plus-plan={card.planKey} style={{ background: C.card, border: `2px solid ${C.border}`, borderRadius: 16, padding: `${SPACE.lg}px ${SPACE.lg}px` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: SPACE.sm, flexWrap: "wrap" }}>
                  <div style={{ color: C.cream, fontWeight: 800, fontSize: 15 }}>{card.name}</div>
                  <div style={{ color: C.cream, fontWeight: 900, fontSize: 18, fontFamily: "'Playfair Display',serif", overflowWrap: "anywhere", minWidth: 0 }}>{card.price}</div>
                </div>
                {card.note && <div style={{ ...small, marginTop: SPACE.xs }}>{card.note}</div>}
                <button data-plus-buy={card.planKey} onClick={() => buy(card)} disabled={!!busy || waiting}
                  style={{ width: "100%", marginTop: GAP.textToControl, minHeight: LAYOUT.minTap, background: `linear-gradient(135deg,${C.purple},${C.purpleBright})`, border: "none", borderRadius: 12, padding: SPACE.md, color: buttonText, fontWeight: 800, fontSize: 14, cursor: (busy || waiting) ? "default" : "pointer", fontFamily: "inherit", opacity: (busy && busy !== card.planKey) || waiting ? 0.6 : 1, overflowWrap: "anywhere" }}>
                  {busy === card.planKey ? (web ? "Opening checkout…" : PAYWALL_COPY.checking) : card.button}
                </button>
              </div>
            ))}
          </div>
          {web && cards.length > 0 && <div data-plus-web-note="" style={{ ...small, marginTop: SPACE.md }}>{W("plus-buy-web-note")}</div>}
          {!web && cards.length > 0 && <div data-plus-store-disclosure="" style={{ ...small, marginTop: SPACE.md }}>{storeDisclosure(platform)}</div>}
        </div>}

        {line && <div role="status" data-plus-outcome={outcome} style={{ ...text, marginTop: SPACE.md }}>{line}</div>}
        {(waiting || view.mode === "unavailable") && <button data-plus-check="" onClick={check} disabled={!!busy} style={{ ...quiet, marginTop: SPACE.md, cursor: busy ? "default" : "pointer" }}>{PAYWALL_COPY.checkAgain}</button>}

        {/* A store app that sells: Restore purchases, and the two legal links, as on the plans screen. Never on the website. */}
        {!web && selling && view.mode !== "hidden" && (
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", columnGap: SPACE.md, marginTop: SPACE.lg }}>
            <button data-plus-restore="" onClick={restore} disabled={!!busy} style={link}>{busy === "restore" ? PAYWALL_COPY.checking : PAYWALL_COPY.restore}</button>
            {platform === "ios"
              ? <a href={APPLE_EULA_URL} target="_blank" rel="noopener noreferrer" style={{ ...link, display: "inline-flex", alignItems: "center" }}>{PAYWALL_COPY.terms}</a>
              : <button onClick={() => onViewLegal && onViewLegal("terms")} style={link}>{PAYWALL_COPY.terms}</button>}
            <button onClick={() => onViewLegal && onViewLegal("privacy")} style={link}>{PAYWALL_COPY.privacy}</button>
          </div>
        )}
      </div>
    </div>
  );
}
