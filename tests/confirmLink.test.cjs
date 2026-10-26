// tests/confirmLink.test.cjs
// -----------------------------------------------------------------------------
// WHAT THE CONFIRMATION LINK SAID (audit 2026-10-26, B5): src/lib/confirmLink.js confirmLinkResult.
// Supabase answers in the hash (implicit flow) or the query (PKCE). An error there is a failed link; its own
// description is shown only when it is plain text. (The page itself: tests/confirmedLink.browser.)
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

(async () => {
  const t = create();
  const { confirmLinkResult: R } = await import("../src/lib/confirmLink.js");
  t.eq(R({ hash: "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired", search: "" }),
    { failed: true, code: "otp_expired", description: "Email link is invalid or has expired" }, "1 an expired link, in the hash");
  t.eq(R({ hash: "", search: "?error=server_error&error_code=unexpected_failure" }), { failed: true, code: "unexpected_failure", description: null }, "2 a failed link, in the query");
  t.eq(R({ hash: "#access_token=x&type=signup", search: "" }), { failed: false, code: null, description: null }, "3 a link that worked");
  t.eq(R({ hash: "", search: "" }), { failed: false, code: null, description: null }, "4 nothing at all (the page decides by the session)");
  t.eq(R({ hash: "#error=x&error_description=%3Cimg%20src%3Dx%3E", search: "" }).description, null, "5 a description that is not plain text is not shown");
  t.eq(R(null), { failed: false, code: null, description: null }, "6 no location");
  t.summary("confirmLink");
})();
