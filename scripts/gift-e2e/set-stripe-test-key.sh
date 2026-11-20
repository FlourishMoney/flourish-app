#!/bin/bash
# scripts/gift-e2e/set-stripe-test-key.sh
# One-shot: saves a Stripe TEST-mode secret key to ~/keys/flourish-stripe-test.env (mode 600) for the gift
# end-to-end test (scripts/gift-e2e/run.mjs). The key is typed hidden, is never printed, and must start with
# sk_test_: a live key is refused. Nothing is written inside the repo.
set -eu
dir="$HOME/keys"
out="$dir/flourish-stripe-test.env"
mkdir -p "$dir"
chmod 700 "$dir"
printf "Paste the Stripe TEST secret key (it starts with sk_test_), then press Return. Nothing will show: "
IFS= read -rs key
echo
key="$(printf '%s' "$key" | tr -d '[:space:]')"
case "$key" in
  sk_test_*) ;;
  *) echo "Not saved: that is not a Stripe test-mode secret key (it must start with sk_test_)."; exit 1 ;;
esac
if [ "${#key}" -lt 30 ]; then echo "Not saved: that key looks too short."; exit 1; fi
umask 077
tmp="$(mktemp "$dir/.stripe-test.XXXXXX")"
printf 'STRIPE_SECRET_KEY=%s\n' "$key" > "$tmp"
mv "$tmp" "$out"
chmod 600 "$out"
echo "Saved to $out. The key is not shown."
