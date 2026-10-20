#!/usr/bin/env bash
# Pictures (community infographics, copies of pictures from other sites, photos sent to the Telegram bot) are kept in a Cloudflare R2 bucket,
# not in git. `restore` copies them into the working folder so the scripts see what they always saw; `save` uploads whatever is new.
# Uses R2's S3 interface: the access key is the Account API token's id and the secret is the SHA-256 of the token value (Cloudflare's scheme),
# so one Account API token is all that is needed. With no token set (a fork, a local run) it does nothing and succeeds.
# The GitHub secret names are spelled CLOUDFARE_* (typo kept on purpose); the workflows map them to CLOUDFLARE_*.
set -euo pipefail
mode="${1:-}"; BUCKET="${R2_BUCKET:-go-field-notes-images}"
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then echo "R2 sync skipped: no Cloudflare token in this run."; exit 0; fi
v=$(curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/tokens/verify")
id=$(printf %s "$v" | python3 -c "import sys,json;print(json.load(sys.stdin)['result']['id'])" 2>/dev/null) || { echo "::warning title=R2::token check failed: $(printf %s "$v" | tr -d '\n' | cut -c1-200)"; exit 0; }
export AWS_ACCESS_KEY_ID="$id" AWS_SECRET_ACCESS_KEY="$(printf %s "$CLOUDFLARE_API_TOKEN" | sha256sum | cut -d' ' -f1)" AWS_DEFAULT_REGION=auto
EP="https://$CLOUDFLARE_ACCOUNT_ID.r2.cloudflarestorage.com"
# key prefix -> folder
PAIRS="infographics:public/infographics img/ext:public/img/ext tg-inbox:data/tg-inbox"
for pair in $PAIRS; do
  prefix="${pair%%:*}"; dir="${pair##*:}"
  case "$mode" in
    restore) mkdir -p "$dir"; aws s3 sync "s3://$BUCKET/$prefix" "$dir" --endpoint-url "$EP" --only-show-errors || echo "::warning title=R2::restore of $prefix failed" ;;
    save)    [ -d "$dir" ] && { aws s3 sync "$dir" "s3://$BUCKET/$prefix" --endpoint-url "$EP" --only-show-errors || { echo "::error title=R2::saving $prefix failed"; exit 1; }; } ;;
    *) echo "usage: r2-sync.sh restore|save"; exit 2 ;;
  esac
done
echo "R2 $mode done."
