// tests/foundingLink.test.cjs
// -----------------------------------------------------------------------------
// THE FOUNDING LINK AND ITS EMAIL (payments open 2026-10-26).
//
// The welcome email has promised every founding household since PR #53: "We'll email your link to the
// founding price when payments open on October 26." This pins that email and that link:
//   1. The link: https://flourishmoney.app/?checkout=founding, carrying nothing about the household. What
//      the app does with it (src/lib/foundingLink.js): nothing in a store app, the sign-in card when signed
//      out, the checkout screen once billing answers, nothing at all while billing is off.
//   2. The email names no price except the landing page's own sentence, word for word.
//   3. Its footer: why they got it, the consent version on record, the landing page's Contact block word
//      for word, a signed one-click unsubscribe link, and List-Unsubscribe headers.
//   4. It fails closed: no founding number 1 to 50, a test row, no consent that covers it, no signed
//      unsubscribe link: no email.
//   5. The sweep that sends it (netlify/functions/founding-link-sweep.js), run for real against a stubbed
//      fetch: off unless BILLING_ENABLED and FOUNDING_LINK_EMAIL are both exactly "true"; only rows billing
//      itself still honours; recorded once with the consent version; no address in any log line.
//   6. The wiring: the schedule, the App, and the welcome line that promised it.
// -----------------------------------------------------------------------------
"use strict";
// The emails refuse to send a "[WORDS: id]" placeholder (2026-10-29): sample words stand in (tests/_sampleWords.cjs).
const { sample: sampleWords } = require("./_sampleWords.cjs");
require("./_sampleWords.cjs").useSampleWords();
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const LIB = path.join(REPO, "netlify", "functions", "_lib");
const SWEEP = path.join(REPO, "netlify", "functions", "founding-link-sweep.js");
const E = require(path.join(LIB, "foundingLinkEmail.js"));
const U = require(path.join(LIB, "waitlistUnsubscribe.js"));
const { welcomeEmailPayload } = require(path.join(LIB, "waitlistWelcome.js"));
const { CONSENT_VERSION, LEGACY_CONSENT_VERSION } = require(path.join(LIB, "waitlistConsent.js"));
const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
const KEY_NAME = ["RESEND", "API", "KEY"].join("_");
const ADDRESS = "founder.household@example.com";
const ROW = Object.freeze({ id: "7d0c2a51-0b1e-4f7a-9c43-2a6f0e1d9b10", founding_position: 7, is_test: false, unsubscribed_at: null, consent_version: CONSENT_VERSION });

// A fake localStorage, and one that throws on every call (private mode, blocked storage).
const memoryStorage = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m }; };
const brokenStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };

(async () => {
  const t = create();
  const savedEnv = { ...process.env };
  process.env.SUPABASE_SECRET_KEY = "test-service-role";
  delete process.env.WAITLIST_UNSUBSCRIBE_SECRET;
  const L = await import("../src/lib/foundingLink.js");
  const O = await import("../src/lib/foundingOffer.js");

  // ── 1. the link ──────────────────────────────────────────────────────────────────────────────────
  {
    t.eq(L.FOUNDING_LINK_URL, E.FOUNDING_LINK_URL, "1a the app and the email agree on the link");
    const u = new URL(L.FOUNDING_LINK_URL);
    t.eq([u.origin, u.pathname, [...u.searchParams.keys()].join(","), u.searchParams.get("checkout")],
      ["https://flourishmoney.app", "/", "checkout", "founding"], "1b it is flourishmoney.app/?checkout=founding and nothing else: no address, no id, no token");
    for (const [q, want] of [["?checkout=founding", true], ["checkout=founding", true], ["?src=email&checkout=founding", true],
      ["?checkout=Founding", false], ["?checkout=annual", false], ["", false], [null, false], [undefined, false]]) {
      t.eq(L.foundingLinkInUrl(q), want, `1c foundingLinkInUrl(${JSON.stringify(q)}) is ${want}`);
    }
    t.eq([L.withoutFoundingLink("?checkout=founding"), L.withoutFoundingLink("?src=email&checkout=founding"), L.withoutFoundingLink("?billing=success")],
      ["", "?src=email", "?billing=success"], "1d the parameter comes off the address bar; anything else stays");

    const ON = { enabled: true, paid: false, founding: { available: true, cohortLimit: 50 } };
    const ON_NOT_FOUNDING = { enabled: true, paid: false, founding: { available: false, cohortLimit: 50 } };
    const act = (o) => L.foundingLinkAction({ requested: true, native: false, signedIn: true, asked: true, status: ON, ...o });
    t.eq(act({ requested: false }), "none", "1e no link, nothing to do");
    for (const status of [ON, ON_NOT_FOUNDING, null]) {
      for (const signedIn of [true, false]) {
        t.eq(act({ native: true, signedIn, status }), "forget", `1f a store app forgets the link (signed ${signedIn ? "in" : "out"}, billing ${status ? "on" : "off"})`);
      }
    }
    t.eq(act({ signedIn: false }), "sign_in", "1g signed out on the web: the sign-in card");
    t.eq(act({ asked: false }), "wait", "1h signed in, the status has not come back: wait");
    for (const off of [null, undefined, {}, { enabled: false }, { enabled: "true" }, { error: "not_found" }]) {
      t.eq(act({ status: off }), "forget", `1i billing off (${JSON.stringify(off)}): forgotten, no screen and no price`);
    }
    t.eq([act({}), act({ status: ON_NOT_FOUNDING })], ["open", "open"], "1j billing on: the checkout screen, founding price or not");
    t.eq(L.foundingLinkNotice(ON), null, "1k the founding price is offered: no extra line");
    t.eq(L.foundingLinkNotice({ ...ON_NOT_FOUNDING, paid: true }), null, "1l already paying: no extra line (the screen offers the portal)");
    t.eq(L.foundingLinkNotice(ON_NOT_FOUNDING), { kind: "founding", text: L.FOUNDING_NOT_MATCHED_NOTE },
      "1m not available to this account: one line says it is matched to the waitlist address");
    t.eq(L.foundingLinkNotice(null), null, "1n billing off: no line");

    const s = memoryStorage(), T0 = Date.parse("2026-10-26T14:00:00Z");
    t.eq(L.foundingLinkPending(s, T0), false, "1o nothing remembered yet");
    L.rememberFoundingLink(s, T0);
    t.eq([L.foundingLinkPending(s, T0 + 3600000), L.foundingLinkPending(s, T0 + L.FOUNDING_LINK_TTL_MS - 1)], [true, true], "1p remembered on this device for 7 days");
    t.eq([L.foundingLinkPending(s, T0 + L.FOUNDING_LINK_TTL_MS), s._m.has(L.FOUNDING_LINK_PENDING_KEY)], [false, false], "1q …then forgotten and removed");
    L.rememberFoundingLink(s, T0); L.forgetFoundingLink(s);
    t.eq(L.foundingLinkPending(s, T0), false, "1r forgetting clears it");
    let threw = false;
    try { t.eq([L.rememberFoundingLink(brokenStorage, T0), L.foundingLinkPending(brokenStorage, T0)], [false, false], "1s blocked storage: nothing remembered"); L.forgetFoundingLink(brokenStorage); }
    catch { threw = true; }
    t.ok(!threw, "1t …and nothing throws");
    for (const [name, text] of [["sign-in", L.FOUNDING_SIGN_IN_NOTE], ["checkout", L.FOUNDING_NOT_MATCHED_NOTE]]) {
      t.ok(!/\$\s?\d|\d+\.\d\d/.test(text) && !/\bweb ?app\b|\bupgrade\b|flourish plus/i.test(text), `1u the ${name} line names no price, no "web app", no upgrade`);
    }
  }

  // ── 2. the email: its words, and its one price line ─────────────────────────────────────────────
  // Since 2026-10-27 it leads to the stores first (docs/product/FOUNDING-STORE-EMAIL-WORDS.md, approved that day): its
  // price line is the landing sentence's first sentence only (the second says "Paid on flourishmoney.app").
  const payload = E.foundingLinkEmailPayload(ADDRESS, ROW);
  {
    t.ok(payload !== null, "2a a founding household with current consent gets the email");
    t.eq(payload.subject, sampleWords("founding-email-subject"), "2b the subject");
    t.eq(E.foundingLinkParagraphs(7), [
      "Payments for flourish are open.",
      sampleWords("founding-email-position"),               // 2026-10-29: the founding number is no longer named; words to come
      "$79.99 a year plus tax, for as long as you stay subscribed.",
      "Your link: https://flourishmoney.app/get?ref=founding",
      { badges: E.STORE_BADGES },
      sampleWords("founding-email-store-steps"),
      { small: sampleWords("founding-email-computer"), url: "https://flourishmoney.app/?checkout=founding" },
      "Questions? Just reply to this email.",
      "Amanda, founder of flourish",
    ], "2c the words, exactly (changing one is a deliberate edit here)");
    t.eq(E.LANDING_PRICE_SENTENCE, O.foundingOfferCopy().price, "2d the landing page keeps its own price sentence, word for word (src/lib/foundingOffer.js)");
    const MONEY = /\$\s?\d[\d,]*(?:\.\d+)?/g;
    for (const [part, body] of [["text", payload.text], ["html", payload.html]]) {
      const stripped = body.split(E.FOUNDING_EMAIL_PRICE_LINE).join("");
      t.eq(stripped.match(MONEY), null, `2e the ${part} names no price outside its price line`);
      t.eq((body.match(MONEY) || []).length, 1, `2f the ${part} names exactly one price, its price line's`);
      t.ok(body.includes(E.FOUNDING_EMAIL_PRICE_LINE) && !body.includes("Paid on flourishmoney.app"), `2f2 the ${part} has its price line, and no longer says "Paid on flourishmoney.app"`);
    }
    t.ok(O.foundingOfferCopy().price.startsWith(`${E.FOUNDING_EMAIL_PRICE_LINE} `), "2f3 the price line is the landing sentence's first sentence, word for word");
    t.ok(payload.text.includes(E.FOUNDING_GET_URL) && payload.html.includes(`href="${E.FOUNDING_GET_URL}"`), "2g the text and the html both carry the device link");
    t.ok(payload.text.includes(E.FOUNDING_LINK_URL) && payload.html.includes(`href="${E.FOUNDING_LINK_URL}"`), "2g2 …and the website's founding link");
    t.eq([payload.text.includes(ADDRESS), payload.html.includes(ADDRESS), JSON.stringify(payload.headers).includes(ADDRESS)], [false, false, false],
      "2h the address is only in `to`: not in the body, the html or the headers");
    t.eq(payload.to, [ADDRESS], "2i one recipient");
    for (const p of [1, null]) {
      const w = welcomeEmailPayload(ADDRESS, ROW.id, p);
      t.eq(w && (`${w.text}\n${w.html}`).match(MONEY), null, `2j the welcome email (position ${p}) still names no price at all`);
    }
  }

  // ── 3. the footer (CASL) ─────────────────────────────────────────────────────────────────────────
  {
    // The landing page's Contact block, read from the page itself.
    const block = (APP.match(/<div id="contact" className="fll-contact">([\s\S]*?)<\/div>/) || [, ""])[1];
    const contact = [...block.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => m[1].replace(/<[^>]+>/g, "").trim());
    t.eq(contact.length, 2, "3a (the landing Contact block has its two lines)");
    t.eq(E.CONTACT_BLOCK, contact, "3b the email's Contact lines are the landing page's, word for word");
    const footer = payload.text.split("\n\n").slice(-5);
    const url = U.unsubscribeUrl(ROW.id);
    t.eq(footer, [
      "You're receiving this because you joined the waitlist at flourishmoney.app.",
      `Consent on record: version ${CONSENT_VERSION}.`,
      ...contact,
      `Unsubscribe with one click: ${url}`,
    ], "3c the text footer: why, the consent version on record, the Contact block, one-click unsubscribe");
    const q = new URL(url).searchParams;
    t.ok(U.verifyUnsubscribeToken(q.get("id"), q.get("t")) && q.get("id") === ROW.id, "3d the unsubscribe link is signed for this row");
    t.ok(!url.includes("@"), "3e …and carries no address");
    t.eq([payload.headers["List-Unsubscribe"], payload.headers["List-Unsubscribe-Post"]],
      [`<${url}>, <mailto:hello@flourishmoney.app?subject=unsubscribe>`, "List-Unsubscribe=One-Click"], "3f RFC 8058 one-click headers");
    for (const line of [`Consent on record: version ${CONSENT_VERSION}.`, ...contact]) t.ok(payload.html.includes(line), `3g the html footer has "${line}"`);
    t.ok(payload.html.includes(`href="${url}"`), "3h the html footer links the same unsubscribe");
    t.eq(payload.tags, [{ name: "kind", value: "founding_link" }, { name: "consent_version", value: CONSENT_VERSION }],
      "3i Resend keeps which email it was and the consent version it went out under");
    const older = E.foundingLinkEmailPayload(ADDRESS, { ...ROW, consent_version: "2026-10-01" });
    t.ok(older && older.text.includes("Consent on record: version 2026-10-01.") && older.tags[1].value === "2026-10-01",
      "3j a row that agreed to an earlier wording is told, and tagged with, its own version");
  }

  // ── 4. fails closed ──────────────────────────────────────────────────────────────────────────────
  {
    for (const [why, to, row] of [
      ["no address", "", ROW], ["a blank address", "   ", ROW], ["no row", ADDRESS, null], ["no row id", ADDRESS, { ...ROW, id: null }],
      ["no founding number", ADDRESS, { ...ROW, founding_position: null }], ["number 0", ADDRESS, { ...ROW, founding_position: 0 }],
      ['the string "7"', ADDRESS, { ...ROW, founding_position: "7" }],
      ["number 7.5", ADDRESS, { ...ROW, founding_position: 7.5 }], ["a test row", ADDRESS, { ...ROW, is_test: true }],
      ["an unsubscribed row", ADDRESS, { ...ROW, unsubscribed_at: "2026-10-20T00:00:00Z" }],
      ["consent from before the consent line", ADDRESS, { ...ROW, consent_version: LEGACY_CONSENT_VERSION }],
      ["no consent version", ADDRESS, { ...ROW, consent_version: null }], ["an unknown consent version", ADDRESS, { ...ROW, consent_version: "2099-01-01" }],
    ]) t.eq(E.foundingLinkEmailPayload(to, row), null, `4a ${why}: no email`);
    // 0017: a number past 50 is a real household (issued after test numbers were voided). It gets its
    // founding link email, and the number itself is never shown (Amanda, 2026-10-14).
    {
      const p53 = E.foundingLinkEmailPayload(ADDRESS, { ...ROW, founding_position: 53 });
      t.ok(p53 && p53.text.includes(sampleWords("founding-email-position")) && !/#53|\b53\b/.test(p53.text) && !/#53/.test(p53.html),
        "4a2 number 53 (past 50, after voided test numbers): the founding link email, never the number");
      const p50 = E.foundingLinkEmailPayload(ADDRESS, { ...ROW, founding_position: 50 });
      t.ok(p50 && !/#50 of 50/.test(p50.text) && p50.text.includes(sampleWords("founding-email-position")), "4a3 number 50: no number named either (2026-10-29: the line is words to come)");
    }
    const sk = process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
    t.eq(E.foundingLinkEmailPayload(ADDRESS, ROW), null, "4b no signing secret, so no unsubscribe link: no email");
    process.env.SUPABASE_SECRET_KEY = sk;
  }

  // ── 5. the sweep, run for real against a stubbed fetch ──────────────────────────────────────────
  {
    const OTHER = { ...ROW, id: "0a8e9b77-3f4c-4d2b-8e1a-5c6d7e8f9a0b", founding_position: 3, email: "second.household@example.com" };
    const FIRST = { ...ROW, email: ADDRESS, metadata: { placement: "hero" } };
    async function sweep({ env = {}, rows = [FIRST, OTHER], lookup = null, lookupStatus = 200, resendOk = true, recordOk = true, countHeader = "*/0", countStatus = 200, opts = {} } = {}) {
      const calls = [], logs = [];
      const realFetch = global.fetch, realLog = console.log, realErr = console.error, realWarn = console.warn;
      process.env.SUPABASE_URL = "https://example.supabase.co";
      process.env[KEY_NAME] = "re_TESTONLY_notarealkey";
      process.env.BILLING_ENABLED = "true";
      process.env.FOUNDING_LINK_EMAIL = "true";
      for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
      const honour = lookup || ((email) => [FIRST, OTHER].find(r => r.email === email)?.founding_position ?? null);
      global.fetch = async (url, o = {}) => {
        const u = String(url);
        const call = { url: u, method: o.method || "GET", headers: o.headers || {}, body: o.body };
        calls.push(call);
        if (u.includes("api.resend.com")) return { ok: resendOk, status: resendOk ? 200 : 500, json: async () => ({}) };
        if (u.includes("/rpc/waitlist_founding_number_for_email")) {
          if (lookupStatus !== 200) return { ok: false, status: lookupStatus, json: async () => ({}) };
          return { ok: true, status: 200, json: async () => honour(JSON.parse(o.body).p_email) };
        }
        if (call.method === "PATCH") return { ok: recordOk, status: recordOk ? 204 : 500, json: async () => ({}) };
        if (u.includes("sent_at=gte.")) return { ok: countStatus === 200, status: countStatus, headers: { get: k => (k === "content-range" ? countHeader : null) }, json: async () => [] };
        if (u.includes("/rest/v1/waitlist?select=")) return { ok: true, status: 200, json: async () => rows };
        return { ok: false, status: 599, json: async () => ({}) };
      };
      const cap = (...a) => logs.push(a.map(x => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
      console.log = cap; console.error = cap; console.warn = cap;
      let result;
      try {
        delete require.cache[require.resolve(SWEEP)];
        result = await require(SWEEP).runFoundingLinkSweep(opts);
      } finally {
        global.fetch = realFetch; console.log = realLog; console.error = realErr; console.warn = realWarn;
      }
      return { result, calls, logs, resend: calls.filter(c => c.url.includes("api.resend.com")), patches: calls.filter(c => c.method === "PATCH") };
    }

    // The switches.
    for (const [why, env, skipped] of [
      ["BILLING_ENABLED unset", { BILLING_ENABLED: undefined }, "billing_off"],
      ["BILLING_ENABLED \"TRUE\"", { BILLING_ENABLED: "TRUE" }, "billing_off"],
      ["FOUNDING_LINK_EMAIL unset", { FOUNDING_LINK_EMAIL: undefined }, "founding_link_email_off"],
      ["FOUNDING_LINK_EMAIL \"1\"", { FOUNDING_LINK_EMAIL: "1" }, "founding_link_email_off"],
      ["no Resend key", { [KEY_NAME]: undefined }, "no_api_key"],
    ]) {
      const r = await sweep({ env });
      t.eq([r.result.skipped, r.calls.length], [skipped, 0], `5a ${why}: nothing read, sent or written`);
    }

    // The happy path.
    {
      const r = await sweep();
      t.eq([r.result.sent, r.resend.length, r.patches.length], [2, 2, 2], "5b two founding households owed their email: two sent, two recorded");
      const select = decodeURIComponent(r.calls.find(c => c.url.includes("/rest/v1/waitlist?select=id,email,")).url);
      for (const f of ["founding_position=gte.1", "founding_position=lte.50", "is_test=is.false", "unsubscribed_at=is.null",
        // The pre-2026-10-01 version is asked for too since 2026-10-25 (a recorded personal relationship can give those
        // rows the founding link email); each row is then decided on its own (tests/foundingFriendsFamily.test.cjs).
        `consent_version=in.(2026-10-01,2026-10-05,2026-10-06,2026-10-26,2026-10-22,${LEGACY_CONSENT_VERSION})`, "metadata->founding_link=is.null", "order=founding_position.asc"]) {
        t.ok(select.includes(f), `5c the select asks for ${f}`);
      }
      t.ok(!/consent_version=(neq|not)\./.test(select) && /&founding_position=gte\.1&founding_position=lte\.50/.test(select),
        "5c2 …and names the allowed versions outright, never \"anything but\", and with signup shut only founding holders");
      t.eq(r.resend.map(c => c.headers["Idempotency-Key"]), [`founding-link/${FIRST.id}`, `founding-link/${OTHER.id}`], "5d one Idempotency-Key per row, from its id alone");
      const sentTo = r.resend.map(c => JSON.parse(c.body).to[0]);
      t.eq(sentTo, [ADDRESS, OTHER.email], "5e each to its own address");
      const rec = JSON.parse(r.patches[0].body).metadata;
      t.eq([rec.placement, rec.founding_link.consent_version, rec.founding_link.position, typeof rec.founding_link.sent_at],
        ["hero", CONSENT_VERSION, 7, "string"], "5f the record: sent_at, the consent version it went out under, the number; the row's other metadata kept");
      t.ok(r.patches.every(p => p.url.includes("metadata->founding_link=is.null")), "5g the record is written only where none is there yet");
      const lookups = r.calls.filter(c => c.url.includes("/rpc/waitlist_founding_number_for_email"));
      t.eq(lookups.length, 2, "5h billing's own lookup is asked for each row before its email");
      t.ok(r.calls.indexOf(lookups[0]) < r.calls.indexOf(r.resend[0]), "5i …before the send");
    }

    // Only rows billing itself still honours.
    {
      const r = await sweep({ lookup: (email) => (email === ADDRESS ? null : 3) });
      t.eq([r.result.sent, r.result.notHonoured, r.resend.map(c => JSON.parse(c.body).to[0])], [1, 1, [OTHER.email]],
        "5j a number billing no longer honours (ended, or a test row) gets no email; the next row still does");
      const r2 = await sweep({ lookup: () => 12 });
      t.eq([r2.result.sent, r2.resend.length], [0, 0], "5k a lookup that answers a different number: no email");
      const r3 = await sweep({ lookupStatus: 404 });
      t.eq([r3.result.skipped, r3.result.sent, r3.resend.length, r3.patches.length], ["lookup_failed", 0, 0, 0],
        "5l the lookup itself fails (0016 not applied): the run stops, nothing sent");
    }

    // Rows the select should never have returned are refused anyway.
    {
      const bad = [
        { ...FIRST, consent_version: LEGACY_CONSENT_VERSION }, { ...FIRST, is_test: true }, { ...FIRST, unsubscribed_at: "2026-10-20T00:00:00Z" },
        { ...FIRST, metadata: { founding_link: { sent_at: "2026-10-26T15:00:00Z" } } }, { ...FIRST, founding_position: 51 }, { ...FIRST, email: "" },
      ];
      const r = await sweep({ rows: bad });
      t.eq([r.result.sent, r.resend.length, r.patches.length], [0, 0, 0], "5m legacy consent, a test row, unsubscribed, already sent, number 51, no address: none sent");
    }

    // Failures.
    {
      const r = await sweep({ resendOk: false });
      t.eq([r.result.sent, r.result.failed, r.patches.length], [0, 2, 0], "5n Resend refuses: nothing recorded, so the next run tries again");
      const r2 = await sweep({ recordOk: false });
      t.eq([r2.result.sent, r2.resend.length, r2.result.skipped], [1, 1, "record_failed"], "5o a send that cannot be recorded stops the run");
      const r3 = await sweep({ countStatus: 500 });
      t.eq([r3.result.skipped, r3.resend.length], ["daily_count_unreadable", 0], "5p the daily count cannot be read: nothing sent");
      const r4 = await sweep({ countHeader: "*/40" });
      t.eq([r4.result.skipped, r4.resend.length], ["daily_cap_reached", 0], "5q 40 sent in the last 24 hours: nothing more");
      const r5 = await sweep({ opts: { perRunCap: 1 } });
      t.eq([r5.result.sent, r5.resend.length], [1, 1], "5r the per-run cap holds");
      const mod = require(SWEEP);
      t.eq([mod.PER_RUN_CAP, mod.RUN_BUDGET_MS, mod.DAILY_CAP], [10, 20000, 40], "5s the real caps: 10 a run, 20 s, 40 a day");
    }

    // Logs.
    {
      const all = [];
      for (const o of [{}, { resendOk: false }, { recordOk: false }, { lookupStatus: 500 }, { countStatus: 500 }]) all.push(...(await sweep(o)).logs);
      const joined = all.join("\n");
      t.ok(all.length > 0, "5t (the runs did log)");
      t.eq([joined.includes("@"), joined.includes(FIRST.id), joined.includes(OTHER.id), joined.includes("re_TESTONLY")], [false, false, false, false],
        "5u no log line holds an address, a row id or a key");
    }
  }

  // ── 6. the wiring ───────────────────────────────────────────────────────────────────────────────
  {
    const toml = fs.readFileSync(path.join(REPO, "netlify.toml"), "utf8");
    t.ok(/\[functions\."founding-link-sweep"\]\s*\n\s*schedule = "\*\/15 \* \* \* \*"/.test(toml), "6a the sweep runs every 15 minutes");
    t.ok(/from "\.\/lib\/foundingLink\.js"/.test(APP), "6b the App reads the link through src/lib/foundingLink.js");
    t.ok(/foundingLinkAction\(\{ requested: foundingLink, native: nativeApp,/.test(APP), "6c …and asks it what to do");
    t.ok(/foundingNote=\{foundingLink \? FOUNDING_SIGN_IN_NOTE : null\}/.test(APP), "6d the sign-in card gets the waitlist-address line when the link brought them");
    t.ok(/useState\(isNativeApp\(\) \|\| !!foundingNote\)/.test(APP), "6e …and opens straight to sign-in");
    t.eq((APP.match(/<UpgradeScreen\b/g) || []).length, 1, "6f still one way to mount the checkout screen (behind billingUi.show)");
    // 2026-10-20: a store app asks /api/billing whether the household pays on the web, and keeps only that
    // (billing.js answers it with { enabled, paid }), so the founding offer can never reach it.
    t.ok(/setBillingStatus\(nativeApp \? \{ enabled: body\?\.enabled === true, paid: body\?\.paid === true \} : body\)/.test(APP),
      "6g a store app keeps only enabled and paid from /api/billing: never the founding offer");
    t.ok(/if \(isNativeRequest\(event\)\) return json\(200, CORS, \{ enabled: true, paid: isPaidSubscription\(row\) \}\);/.test(fs.readFileSync(path.join(REPO, "netlify", "functions", "billing.js"), "utf8")),
      "6g2 …and the server tells a store app nothing about the founding price in the first place");
    const srcFiles = [APP, ...fs.readdirSync(path.join(REPO, "src", "lib")).map(f => fs.readFileSync(path.join(REPO, "src", "lib", f), "utf8"))].join("\n");
    t.ok(!/FOUNDING_LINK_EMAIL|VITE_FOUNDING/.test(srcFiles), "6h the send switch is a server variable: never in src/, never VITE_");
    const welcome = require(path.join(LIB, "foundingWaitlist.js")).foundingWelcomeLine(7);
    t.eq(welcome, sampleWords("welcome-founding-line"), "6i the welcome email's founding line is words to come (2026-10-29: it promised a link to a held price)");
  }

  process.env = savedEnv;
  t.summary("foundingLink.test");
})();
