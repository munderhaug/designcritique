#!/usr/bin/env bash
# designcritique setup: installs script dependencies and a browser, then reports companions.
# Usage: bash scripts/setup.sh [--project <dir>] [--with-impeccable]
#   --with-impeccable  also install Impeccable into the project (writes .claude/skills there)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$PWD"
WITH_IMPECCABLE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --with-impeccable) WITH_IMPECCABLE=1; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if [[ ! -d "$ROOT/node_modules" ]]; then
  echo "Installing script dependencies…"
  npm install --prefix "$ROOT" --no-audit --no-fund --silent
fi

browser_ok() {
  (cd "$ROOT" && node -e "require('playwright').chromium.launch($1).then(b=>b.close()).catch(()=>process.exit(1))") 2>/dev/null
}
if ! browser_ok "" && ! browser_ok "{channel:'chrome'}"; then
  echo "Installing Chromium for Playwright…"
  (cd "$ROOT" && npx playwright install chromium)
fi

if [[ $WITH_IMPECCABLE -eq 1 ]]; then
  echo "Installing Impeccable into $PROJECT…"
  (cd "$PROJECT" && npx impeccable install -y --providers=claude --scope=project)
fi

echo
echo "Companions found for $PROJECT:"
(cd "$ROOT" && node scripts/companions.mjs --project "$PROJECT") | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);
for (const [k,v] of Object.entries(o)) console.log(`  ${v.found ? "yes" : "no "}  ${k.padEnd(20)} ${v.found ? v.path : "install: " + v.install}`);});'
echo
echo "MCP servers (check with /mcp in Claude Code): Mobbin for references, Figma for Figma frames."
