// src/lib/authTheme.js
// -----------------------------------------------------------------------------
// THE SIGN-UP AND LOG-IN CARD'S COLOURS (audit H11, 2026-10-26).
//
// Log in and Try free used to jump from the cream-and-forest-green landing to a near-black card with mint
// #00D68F: a different brand. The card now uses the landing's own tokens (the .fll-* rules in App.jsx:
// the cream page, the white card, the forest-green button, the waitlist form's input and error colours),
// so the person stays in one brand from the landing to their first number.
//
// Every text colour clears WCAG AA 4.5:1 on the surface it sits on, and the button's fill clears it with
// white text; tests/openSignup.test.cjs measures each pair, so a change here cannot drift under it.
// -----------------------------------------------------------------------------
export const AUTH_C = Object.freeze({
  page: "#FDF6EC",        // the landing's page
  card: "#FFFFFF",        // the landing's cards (.fll-founding, .fll-done)
  ink: "#1c2b21",         // body text (.fll-root)
  heading: "#15321a",     // headings (.fll-done-t, .fll-label)
  muted: "#52624f",       // secondary text (.fll-done-b, .fll-consent)
  placeholder: "#66735f", // input placeholder, darkened from the landing's #7c8a7b to clear 4.5:1 on white
  inputBorder: "#9a8f78", // input edge, darkened from #e3dac6 so the field clears 3:1 (WCAG 1.4.11, a control edge)
  focus: "#2E8B2E",       // input focus ring (.fll-input:focus)
  btnFrom: "#2a842a",     // the main button (.fll-btn #2E8B2E, a shade darker so white text clears 4.5:1)
  btnTo: "#1f6b22",
  btnInk: "#FFFFFF",
  link: "#1b5e20",        // links (.fll-contact-link)
  error: "#b03224",       // inline and form errors (.fll-err #c0392b, darkened a little for 4.5:1 on the tint)
  errorBg: "rgba(192,57,43,0.07)",
  success: "#1b5e20",
  successBg: "rgba(46,139,46,0.10)",
  border: "rgba(46,139,46,0.22)", // the landing cards' edge
  tabBg: "rgba(46,139,46,0.08)",
});
