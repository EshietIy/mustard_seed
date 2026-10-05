#!/usr/bin/env bash
# Refreshes api/openapi.json (the contract the app's client is generated from) from a
# running backend. The spec is only served outside production (/api/docs-json).
#
#   ./scripts/update-openapi.sh                       # local backend on :3000
#   ./scripts/update-openapi.sh https://msd-api.eshiet.i.ng
set -euo pipefail
origin="${1:-http://localhost:3000}"
cd "$(dirname "$0")/.."
tmp="$(mktemp)"
curl -fsS "$origin/api/docs-json" -o "$tmp"
python3 -c "import json,sys; d=json.load(open(sys.argv[1])); json.dump(d, open('api/openapi.json','w'), indent=2); open('api/openapi.json','a').write('\n')" "$tmp"
rm -f "$tmp"
echo "Updated api/openapi.json from $origin. Rebuild to regenerate the client."
