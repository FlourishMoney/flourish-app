#!/usr/bin/env bash
#
# scripts/ship-ios.sh — one-command, drift-proof iOS ship.
#
# Guarantees the iOS build you archive matches deployed main, or refuses and tells you why.
# Never hand-remember `cap sync` again: run this, and either it hands you a build that matches
# origin/main, or it stops before touching anything.
#
# Sequence (stops at the FIRST failure — nothing is built or synced until every gate passes):
#   1. on branch main
#   2. local main == origin/main (after `git fetch`)
#   3. no uncommitted changes to TRACKED files
#        (untracked files — assets, scripts — are noted but not blocking: they aren't bundled and
#         don't change the committed SHA the build is stamped with)
#   4. npm run test:math   — the MATH-LOCK gate must pass
#   5. npm run build       — stamps the SHA into dist/ (see vite.config.js)
#   6. npx cap sync ios    — copies that exact dist/ into the iOS project
#   7. prints the SHA shipped + the Xcode archive reminder
#
set -euo pipefail

# Always operate from the repo root, however the script was invoked.
cd "$(dirname "$0")/.."

RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; BLD=$'\033[1m'; RST=$'\033[0m'
step() { printf "\n${BLD}▸ %s${RST}\n" "$1"; }
die()  { printf "${RED}✗ %s${RST}\n" "$1" >&2; exit 1; }
ok()   { printf "${GRN}✓ %s${RST}\n" "$1"; }

# ── 1. on branch main ────────────────────────────────────────────────────────
step "Branch"
BRANCH="$(git symbolic-ref --short HEAD 2>/dev/null || echo DETACHED)"
[ "$BRANCH" = "main" ] || die "Not on main (on '$BRANCH'). Ship only from main so what you archive is what's deployed."
ok "on main"

# ── 2. local main == origin/main ─────────────────────────────────────────────
step "Sync with origin/main"
git fetch --quiet origin main || die "git fetch failed — check your network/remote and retry."
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"
if [ "$LOCAL" != "$REMOTE" ]; then
  die "local main ($(git rev-parse --short HEAD)) != origin/main ($(git rev-parse --short origin/main)). Push or pull first — otherwise iOS would ship code that isn't deployed to the web."
fi
ok "local main == origin/main ($(git rev-parse --short HEAD))"

# ── 3. clean tree (tracked files only) ───────────────────────────────────────
step "Working tree"
if ! git diff-index --quiet HEAD --; then
  printf "${RED}Uncommitted changes to tracked files:${RST}\n"
  git --no-pager diff --name-status HEAD | sed 's/^/  /'
  die "tree is dirty. Commit, stash, or discard these before shipping — the build would otherwise not match origin/main."
fi
if git ls-files --others --exclude-standard | grep -q .; then
  printf "${YEL}Note — untracked files present (not bundled, not blocking):${RST}\n"
  git ls-files --others --exclude-standard | sed 's/^/  /'
fi
ok "tracked tree clean"

SHA="$(git rev-parse --short HEAD)"

# ── 4. MATH-LOCK ─────────────────────────────────────────────────────────────
step "MATH-LOCK (npm run test:math)"
npm run test:math || die "MATH-LOCK failed — refusing to ship a red build."
ok "MATH-LOCK green"

# ── 5. build (stamps the SHA into dist/) ─────────────────────────────────────
step "Build web bundle (npm run build) — stamping SHA $SHA"
VITE_BUILD_SHA="$SHA" npm run build || die "build failed."
ok "dist/ built and stamped $SHA"

# ── 6. sync into the iOS project ─────────────────────────────────────────────
step "Sync into iOS (npx cap sync ios)"
npx cap sync ios || die "cap sync ios failed."
ok "iOS project now bundles dist/ at $SHA"

# ── 7. hand off to Xcode ─────────────────────────────────────────────────────
printf "\n${GRN}${BLD}Ready to archive — shipping %s${RST}\n" "$SHA"
printf "  Web to compare against: https://flourishmoney.app → Settings should read \"Build %s\"\n" "$SHA"
printf "\n${BLD}Next — archive from Xcode:${RST}\n"
printf "  npx cap open ios      # then  Product ▸ Archive ▸ Distribute App\n"
printf "\nOnce it's on TestFlight/the App Store, the app's Settings ▸ About line must read \"Build %s\".\n" "$SHA"
printf "If it differs from flourishmoney.app, something shipped stale — investigate before release.\n"
