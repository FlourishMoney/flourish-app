// scripts/prerender-entry.jsx: the SSR entry scripts/prerender-pages.mjs builds. It renders two public pages exactly as
// FlourishApp does for a visitor who is not signed in (src/App.jsx): the landing (the auth gate's AuthScreen) and /support
// (SupportPage in its legal-page wrapper). Handlers do nothing, and no effect runs in a server render, so nothing is
// fetched, counted or stored.
import { renderToString } from "react-dom/server";
import { AuthScreen, SupportPage, faqFor, C } from "../src/App.jsx";
import { safeX } from "../src/lib/safeArea.js";
import { APP_STORE_URL, PLAY_STORE_URL } from "../src/lib/storeLinks.js";

export function renderHome({ tpfOn = false } = {}) {
  return renderToString(<AuthScreen onAuth={() => {}} onTryDemo={() => {}} foundingNote={null} startOnLogin={false} tpfOn={tpfOn} />);
}

// FlourishApp's legalShell, as it wraps /support (src/App.jsx, "Legal screens").
export function renderSupport() {
  const legalShell = { background: C.bg, minHeight: "100dvh", padding: "max(20px, env(safe-area-inset-top)) 16px 0", ...safeX(16), fontFamily: "'Plus Jakarta Sans',sans-serif" };
  return renderToString(<div style={legalShell}><SupportPage onBack={() => {}} country="CA" /></div>);
}

// The questions and answers /support shows, for its FAQPage JSON-LD: the same list the page renders.
export const supportFaq = () => faqFor("CA").map(({ q, a }) => ({ q, a }));

// The two store pages, for the JSON-LD and /llms.txt (scripts/build-seo.mjs): one copy, in src/lib/storeLinks.js.
export const stores = () => ({ appStore: APP_STORE_URL, play: PLAY_STORE_URL });
