#!/usr/bin/env bash
# Pictures (community infographics, copies of pictures from other sites, photos sent to the Telegram bot) are kept in a Cloudflare R2 bucket,
# not in git. `restore` copies them into the working folder so the scripts see what they always saw; `save` uploads whatever is new.
# Uses R2's S3 interface: the access key is the Account API token's id and the secret is the SHA-256 of the token value (Cloudflare's scheme),
# so one Account API token is all that is needed. With no token set (a fork, a local run) it does nothing and succeeds.
# The GitHub secret names are spelled CLOUDFARE_* (typo kept on purpose); the workflows map them to CLOUDFLARE_*.
set -euo pipefail
mode="${1:-}"; BUCKET="${R2_BUCKET:-go-field-notes-images}"
# Strict mode is opt-in, so unrelated R2 uses keep their existing behaviour.
# The G47IX discovery restore opts in: failure must stop publication before public JSON changes.
strict_restore=0
if [ "$mode" = "restore" ] && [ "${R2_SYNC_STRICT_RESTORE:-0}" = "1" ]; then strict_restore=1; fi
restore_failures=0
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "::warning title=R2::sync skipped: Cloudflare credentials are not configured"
  if [ "$strict_restore" = "1" ]; then echo "::error title=R2::strict restore requires configured credentials"; exit 1; fi
  exit 0
fi
v=$(curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/tokens/verify")
id=$(printf %s "$v" | python3 -c "import sys,json;print(json.load(sys.stdin)['result']['id'])" 2>/dev/null) || {
  # A token-validation HTTP response may contain sensitive diagnostics. Do not echo it.
  echo "::warning title=R2::token verification failed (details redacted)"
  if [ "$strict_restore" = "1" ]; then echo "::error title=R2::strict restore cannot continue without a validated token"; exit 1; fi
  exit 0
}
export AWS_ACCESS_KEY_ID="$id" AWS_SECRET_ACCESS_KEY="$(printf %s "$CLOUDFLARE_API_TOKEN" | sha256sum | cut -d' ' -f1)" AWS_DEFAULT_REGION=auto
EP="https://$CLOUDFLARE_ACCOUNT_ID.r2.cloudflarestorage.com"
# key prefix -> folder
PAIRS="infographics:public/infographics img/ext:public/img/ext tg-inbox:data/tg-inbox archive:data/archive"
for pair in $PAIRS; do
  prefix="${pair%%:*}"; dir="${pair##*:}"
  # R2_ONLY=infographics restores or saves just that one folder (a quick run that only needs the pictures)
  if [ -n "${R2_ONLY:-}" ] && [ "$prefix" != "$R2_ONLY" ]; then continue; fi
  case "$mode" in
    restore)
      mkdir -p "$dir"
      if ! aws s3 sync "s3://$BUCKET/$prefix" "$dir" --endpoint-url "$EP" --only-show-errors; then
        restore_failures=$((restore_failures + 1))
        echo "::warning title=R2::restore of $prefix failed"
        if [ "$strict_restore" = "1" ]; then
          echo "::error title=R2::strict restore failed; no downstream publish should occur"
          exit 1
        fi
      fi
      ;;
    save)    [ -d "$dir" ] && { aws s3 sync "$dir" "s3://$BUCKET/$prefix" --endpoint-url "$EP" --only-show-errors || { echo "::error title=R2::saving $prefix failed"; exit 1; }; } ;;
    *) echo "usage: r2-sync.sh restore|save"; exit 2 ;;
  esac
done
if [ "$mode" = "restore" ] && [ "$restore_failures" -gt 0 ]; then
  echo "::warning title=R2::restore incomplete ($restore_failures prefix failure(s)); media availability remains unverified."
else
  echo "R2 $mode done."
fi
