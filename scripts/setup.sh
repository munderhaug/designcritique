#!/usr/bin/env bash
# designcritique setup: installs script dependencies and a browser, then reports companions.
# Usage: bash scripts/setup.sh [--project <dir>] [--install-companions]
#   --install-companions  install the core companions: Impeccable into the project
#                         (writes .claude/skills there) and Anthropic's design plugin for the user
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$PWD"
INSTALL=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --install-companions) INSTALL=1; shift ;;
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

if [[ $INSTALL -eq 1 ]]; then
  echo "Installing Impeccable into $PROJECT…"
  (cd "$PROJECT" && npx impeccable install -y --providers=claude --scope=project)
  if command -v claude >/dev/null 2>&1; then
    echo "Installing Anthropic's design plugin…"
    claude plugin marketplace add anthropics/knowledge-work-plugins || true
    claude plugin install design@knowledge-work-plugins
  else
    echo "Claude Code CLI not found; in Claude Code run: /plugin marketplace add anthropics/knowledge-work-plugins, then /plugin install design@knowledge-work-plugins"
  fi
fi

echo
echo "Companions found for $PROJECT:"
(cd "$ROOT" && node scripts/companions.mjs --project "$PROJECT") | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);
for (const [k,v] of Object.entries(o)) console.log(`  ${v.found ? "yes" : "no "}  ${k.padEnd(20)} ${v.found ? v.path : "install: " + v.install}`);});'
echo
echo "MCP servers (check with /mcp in Claude Code): Mobbin or Refero for references, Figma for Figma frames."
