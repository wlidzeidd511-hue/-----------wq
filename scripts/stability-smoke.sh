#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
ITERATIONS="${ITERATIONS:-12}"
SLEEP_SECONDS="${SLEEP_SECONDS:-5}"
REQUEST_TIMEOUT_SECONDS="${REQUEST_TIMEOUT_SECONDS:-20}"
INVOICE_TOKEN="${INVOICE_TOKEN:-}"

routes=("/" "/track" "/team" "/account" "/dashboard/control" "/contact")
if [[ -n "$INVOICE_TOKEN" ]]; then
  routes+=("/invoice/$INVOICE_TOKEN")
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

printf 'Stability smoke: %s iterations against %s\n' "$ITERATIONS" "$BASE_URL"

for iteration in $(seq 1 "$ITERATIONS"); do
  for route in "${routes[@]}"; do
    body_file="$tmp_dir/body-${iteration}-$(printf '%s' "$route" | tr '/?' '__').html"
    status="$(curl --location --silent --show-error \
      --max-time "$REQUEST_TIMEOUT_SECONDS" \
      --output "$body_file" \
      --write-out '%{http_code}' \
      "${BASE_URL}${route}")"

    if [[ ! "$status" =~ ^(2|3)[0-9]{2}$ ]]; then
      printf 'FAIL iteration=%s route=%s status=%s\n' "$iteration" "$route" "$status" >&2
      exit 1
    fi

    if [[ ! -s "$body_file" ]]; then
      printf 'FAIL iteration=%s route=%s empty_response=true\n' "$iteration" "$route" >&2
      exit 1
    fi
  done

  printf 'PASS iteration=%s routes=%s\n' "$iteration" "${#routes[@]}"
  if [[ "$iteration" -lt "$ITERATIONS" && "$SLEEP_SECONDS" != "0" ]]; then
    sleep "$SLEEP_SECONDS"
  fi
done

printf 'Stability smoke completed successfully.\n'
