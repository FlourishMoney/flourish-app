// e2e/nightly/server.cjs
// -----------------------------------------------------------------------------
// THE NIGHTLY TEST'S OWN SERVER (e2e/nightly/README.md): the built website, and the REAL server functions from
// netlify/functions, hosted on this machine and pointed at the throwaway Supabase and at Plaid's SANDBOX.
//
// It stands in for Netlify, and only as far as the test needs:
//   - http://localhost:8888          the website build, with the site's own Content-Security-Policy from netlify.toml
//                                    (the one address swapped is Supabase's: the throwaway stack for production's);
//   - http://localhost:8888/api/*    each function, by netlify.toml's own /api redirects, called the way Netlify
//                                    calls a Lambda-style function (exports.handler(event));
//   - http://localhost:8889          the store-app build (static only: the store apps load their pages from the device).
// Netlify Blobs (the sign-up limiter's store) is the library's own local server, in a temp folder.
//
// IT REFUSES TO START if it could reach production: SUPABASE_URL must be this machine, PLAID_ENV must be "sandbox",
// and none of the keys that only production has may be set here.
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, "..", "..");
const WEB_PORT = 8888, STORE_PORT = 8889;
const PRODUCTION_SUPABASE_HOST = "qhcccjkmvijrybagkvyw.supabase.co";

/** Why this environment may not be used, or null. Exported for tests/nightlyE2e.test.cjs. */
function refusal(env) {
  let host = "";
  try { host = new URL(env.SUPABASE_URL || "").hostname; } catch { return "SUPABASE_URL is not set to the throwaway stack's address"; }
  if (host !== "127.0.0.1" && host !== "localhost") return `SUPABASE_URL is ${host}, not this machine: the nightly test only ever uses its own throwaway Supabase`;
  if ((env.PLAID_ENV || "") !== "sandbox") return `PLAID_ENV is "${env.PLAID_ENV || ""}", not "sandbox": the nightly test only ever uses Plaid's sandbox`;
  for (const k of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "REVENUECAT_SECRET_KEY", "ANTHROPIC_API_KEY", "RESEND_API_KEY"]) {
    if (env[k]) return `${k} is set: the nightly test must not hold a key that can charge, email or bill`;
  }
  return null;
}

/** netlify.toml's /api routes: { "/api/plaid": "plaid", … }. */
function apiRoutes(toml) {
  const out = {};
  for (const m of toml.matchAll(/from\s*=\s*"(\/api\/[^"]+)"\s*\n\s*to\s*=\s*"\/\.netlify\/functions\/([^"]+)"/g)) out[m[1]] = m[2];
  return out;
}

/** The site's own Content-Security-Policy, with the throwaway Supabase in place of production's. */
function contentSecurityPolicy(toml, supabaseUrl) {
  const m = toml.match(/Content-Security-Policy\s*=\s*"([^"]+)"/);
  if (!m || !m[1].includes(PRODUCTION_SUPABASE_HOST)) throw new Error("netlify.toml's Content-Security-Policy was not found, or no longer names Supabase");
  return m[1].split(PRODUCTION_SUPABASE_HOST).join(new URL(supabaseUrl).host);
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".jpg": "image/jpeg",
  ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain", ".xml": "application/xml" };

function serveStatic(dist, req, res, headers = {}) {
  let f = path.join(dist, decodeURIComponent(req.url.split("?")[0]));
  if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, "index.html");
  res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream", ...headers });
  fs.createReadStream(f).pipe(res);
}

async function main() {
  const why = refusal(process.env);
  if (why) { console.error(`✗ REFUSED: ${why}`); process.exit(2); }
  const webDist = path.resolve(process.env.E2E_WEB_DIST || ""), storeDist = path.resolve(process.env.E2E_STORE_DIST || "");
  for (const d of [webDist, storeDist]) if (!fs.existsSync(path.join(d, "index.html"))) { console.error(`✗ no built app in ${d}`); process.exit(2); }

  // Netlify Blobs, locally: the library's own server, and the context a function finds it by.
  const { BlobsServer } = require("@netlify/blobs/server");
  const token = "nightly-e2e-local";
  const blobs = new BlobsServer({ directory: fs.mkdtempSync(path.join(os.tmpdir(), "flourish-e2e-blobs-")), token });
  const { port: blobsPort } = await blobs.start();
  process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ edgeURL: `http://localhost:${blobsPort}`, uncachedEdgeURL: `http://localhost:${blobsPort}`, siteID: "flourish-e2e", token })).toString("base64");

  const toml = fs.readFileSync(path.join(ROOT, "netlify.toml"), "utf8");
  const routes = apiRoutes(toml);
  const csp = contentSecurityPolicy(toml, process.env.SUPABASE_URL);
  const handlers = {};
  const handlerFor = (name) => handlers[name] || (handlers[name] = require(path.join(ROOT, "netlify", "functions", `${name}.js`)).handler);

  const web = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${WEB_PORT}`);
    const fn = routes[url.pathname];
    if (!fn) return serveStatic(webDist, req, res, { "Content-Security-Policy": csp });
    const chunks = []; for await (const c of req) chunks.push(c);
    const event = {
      httpMethod: req.method, path: url.pathname, rawUrl: url.href, isBase64Encoded: false,
      headers: { ...req.headers, "x-nf-client-connection-ip": "127.0.0.1" },
      queryStringParameters: Object.fromEntries(url.searchParams), body: chunks.length ? Buffer.concat(chunks).toString("utf8") : null,
    };
    try {
      const out = (await handlerFor(fn)(event, {})) || {};
      res.writeHead(out.statusCode || 200, out.headers || {});
      res.end(out.body == null ? "" : out.isBase64Encoded ? Buffer.from(out.body, "base64") : out.body);
    } catch (e) {
      console.error(`[e2e server] ${fn} threw: ${e && e.message}`);
      res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "function_threw" }));
    }
  });
  const store = http.createServer((req, res) => serveStatic(storeDist, req, res));
  await new Promise((ok) => web.listen(WEB_PORT, ok));       // "localhost" may be ::1 or 127.0.0.1: listen on both
  await new Promise((ok) => store.listen(STORE_PORT, ok));
  console.log(`✓ nightly server: website http://localhost:${WEB_PORT} (${Object.keys(routes).length} API routes), store build http://localhost:${STORE_PORT}, Supabase ${new URL(process.env.SUPABASE_URL).host}, Plaid sandbox`);
}

module.exports = { refusal, apiRoutes, contentSecurityPolicy, WEB_PORT, STORE_PORT, PRODUCTION_SUPABASE_HOST };
if (require.main === module) main().catch((e) => { console.error(`✗ the nightly server did not start: ${e && e.message}`); process.exit(2); });
