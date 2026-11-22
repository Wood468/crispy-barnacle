#!/usr/bin/env bash
# Pictures (community infographics, copies of pictures from other sites, photos sent to the Telegram bot) are kept in a Cloudflare R2 bucket,
# not in git. `restore` copies them into the working folder so the scripts see what they always saw; `save` uploads whatever is new.
# Uses R2's S3 interface: the access key is the Account API token's id and the secret is the SHA-256 of the token value (Cloudflare's scheme),
# so one Account API token is all that is needed. With no token set (a fork, a local run) it does nothing and succeeds.
# The GitHub secret names are spelled CLOUDFARE_* (typo kept on purpose); the workflows map them to CLOUDFLARE_*.
set -euo pipefail
mode="${1:-}"; BUCKET="${R2_BUCKET:-go-field-notes-images}"
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then echo "R2 sync skipped: no Cloudflare token in this run."; exit 0; fi
# The token check is a Cloudflare API call that now and then answers 5xx. Try a few times; if it still fails, a restore carries on
# (the validator fails loudly if a picture is then missing) but a SAVE must fail: skipping it with exit 0 let the workflow commit data
# that points at pictures which never reached R2 (the lost "GO Weekly T16" picture, 2026-11-16).
id=""; v=""
for attempt in 1 2 3; do
  v=$(curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/tokens/verify" || true)
  id=$(printf %s "$v" | python3 -c "import sys,json;print(json.load(sys.stdin)['result']['id'])" 2>/dev/null) && [ -n "$id" ] && break
  id=""; [ "$attempt" -lt 3 ] && sleep "${R2_VERIFY_RETRY_DELAY:-5}"
done
if [ -z "$id" ]; then
  echo "::warning title=R2::token check failed: $(printf %s "$v" | tr -d '\n' | cut -c1-200)"
  if [ "$mode" = "save" ]; then echo "::error title=R2::token check failed after 3 tries, pictures NOT saved"; exit 1; fi
  exit 0
fi
export AWS_ACCESS_KEY_ID="$id" AWS_SECRET_ACCESS_KEY="$(printf %s "$CLOUDFLARE_API_TOKEN" | sha256sum | cut -d' ' -f1)" AWS_DEFAULT_REGION=auto
EP="https://$CLOUDFLARE_ACCOUNT_ID.r2.cloudflarestorage.com"
# key prefix -> folder
PAIRS="infographics:public/infographics img/ext:public/img/ext tg-inbox:data/tg-inbox archive:data/archive"
for pair in $PAIRS; do
  prefix="${pair%%:*}"; dir="${pair##*:}"
  # R2_ONLY=infographics restores or saves just that one folder (a quick run that only needs the pictures)
  if [ -n "${R2_ONLY:-}" ] && [ "$prefix" != "$R2_ONLY" ]; then continue; fi
  case "$mode" in
    restore) mkdir -p "$dir"; aws s3 sync "s3://$BUCKET/$prefix" "$dir" --endpoint-url "$EP" --only-show-errors || echo "::warning title=R2::restore of $prefix failed" ;;
    save)    [ -d "$dir" ] && { aws s3 sync "$dir" "s3://$BUCKET/$prefix" --endpoint-url "$EP" --only-show-errors || { echo "::error title=R2::saving $prefix failed"; exit 1; }; } ;;
    *) echo "usage: r2-sync.sh restore|save"; exit 2 ;;
  esac
done
echo "R2 $mode done."
