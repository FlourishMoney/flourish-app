// src/lib/plaidLinkOpen.js
// -----------------------------------------------------------------------------
// IS PLAID LINK OPEN? (1.1.7). Some banks confirm a sign-in in their own app ("did you just sign in?"), so the person
// leaves flourish with Link open and comes back to it. Link (Plaid's web script) waits for that approval and carries
// on by itself, as long as nothing under it starts over. Coming back to the app is a hidden-to-visible change, and on
// it supabase-js announces SIGNED_IN again with the same session, the app re-reads its data, and the store, bank and
// household checks run. During onboarding the re-read swapped the screen for its loader, so the screen that had opened
// Link was replaced and the person had to start again.
//
// While Link is open: the session keeps the same account object (no re-read), and the resume checks wait. Everything
// refreshes as before once Link closes. One flag for every Link the app opens (onboarding, Settings, reconnect).
// -----------------------------------------------------------------------------

// Only one Link is ever on screen, so this is a yes or no, never a count that could be left above zero.
let open = false;

export function markPlaidLinkOpen() { open = true; }
export function markPlaidLinkClosed() { open = false; }
export function isPlaidLinkOpen() { return open; }
