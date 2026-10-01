#!/bin/sh
# Fail fast if the CSP origins are missing, rather than serving a site whose
# Content-Security-Policy silently blocks the API or images.
set -eu

for var in API_ORIGIN SUPABASE_STORAGE_ORIGIN; do
  eval "value=\${$var:-}"
  if [ -z "$value" ]; then
    echo "Fatal: $var must be set (e.g. https://api.mustardseed.ng)" >&2
    exit 1
  fi
  case "$value" in
    https://*|http://localhost*|http://127.0.0.1*) ;;
    *) echo "Fatal: $var must be an https origin, got '$value'" >&2; exit 1 ;;
  esac
done
