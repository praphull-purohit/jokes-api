#!/usr/bin/env bash
# Checks status, content type and CORS of every route against a running deployment.
# Usage: scripts/smoke.sh http://localhost:8787
set -uo pipefail

base="${1:?usage: $0 <base-url>}"
html='text/html; charset=utf-8'
json='application/json; charset=utf-8'
failures=0

check() {
  local path=$1 want_status=$2 want_type=$3
  local headers status type cors
  headers=$(curl -s -o /dev/null -D - "$base$path" | tr -d '\r')
  status=$(awk 'NR==1 {print $2}' <<<"$headers")
  type=$(grep -i '^content-type:' <<<"$headers" | cut -d' ' -f2-)
  cors=$(grep -i '^access-control-allow-origin:' <<<"$headers" | cut -d' ' -f2-)
  if [[ $status == "$want_status" && $type == "$want_type" && $cors == '*' ]]; then
    echo "ok   $path"
  else
    echo "FAIL $path: status=$status type=$type cors=$cors"
    failures=$((failures + 1))
  fi
}

check / 200 "$html"
check /ping 200 "$html"
check /random_joke 200 "$json"
check /random_ten 200 "$json"
check /jokes/random 200 "$json"
check /jokes/ten 200 "$json"
check /types 200 "$json"
check /jokes/random/5 200 "$json"
check /jokes/random/abc 200 "$html"
check /jokes/random/100000 200 "$html"
check /jokes/programming/random 200 "$json"
check /jokes/programming/ten 200 "$json"
check /jokes/1 200 "$json"
check /jokes/0 404 "$json"
check /nope 404 "$html"

etag=$(curl -s -o /dev/null -D - "$base/types" | tr -d '\r' | grep -i '^etag:' | cut -d' ' -f2-)
status=$(curl -s -o /dev/null -w '%{http_code}' -H "If-None-Match: $etag" "$base/types")
if [[ -n $etag && $status == 304 ]]; then echo "ok   /types If-None-Match"; else echo "FAIL /types If-None-Match: etag=$etag status=$status"; failures=$((failures + 1)); fi

echo "$failures failure(s)"
exit $((failures > 0))
