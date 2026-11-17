#!/usr/bin/env bash
# designcritique setup: installs script dependencies and a browser, then reports companions.
# Usage: bash scripts/setup.sh [--project <dir>] [--install-companions] [--user] [--companions-only]
#   --install-companions  install the core companions: Impeccable and Anthropic's design plugin.
#                         Tries their own installers first; if those can't run or can't reach their
#                         servers, copies the skills from their GitHub repositories instead.
#   --user                with --install-companions: install for every project (~/.claude/skills)
#                         instead of into <project>/.claude/skills
#   --companions-only     install the companions from GitHub and nothing else: no script
#                         dependencies, browser or installers (for environment setup scripts, which
#                         run before Claude Code starts and before the plugin itself is installed)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$PWD"
INSTALL=0
USER_SCOPE=0
ONLY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --install-companions) INSTALL=1; shift ;;
    --user) USER_SCOPE=1; shift ;;
    --companions-only) ONLY=1; INSTALL=1; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if [[ $ONLY -eq 0 ]]; then
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
fi

if [[ $INSTALL -eq 1 ]]; then
  if [[ $USER_SCOPE -eq 1 ]]; then SKILLS="$HOME/.claude/skills"; else SKILLS="$PROJECT/.claude/skills"; fi
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  # Copy skill folders from a GitHub repository: from_github <owner/repo> <path in repo> <skill>...
  from_github() {
    local repo="$1" sub="$2"; shift 2
    local dir="$TMP/${repo//\//_}"
    [[ -d "$dir" ]] || git clone -q --depth 1 "https://github.com/$repo.git" "$dir"
    mkdir -p "$SKILLS"
    for skill in "$@"; do
      if [[ ! -f "$dir/$sub/$skill/SKILL.md" ]]; then echo "  $repo has no $sub/$skill; skipped" >&2; continue; fi
      rm -rf "${SKILLS:?}/$skill"
      cp -R "$dir/$sub/$skill" "$SKILLS/$skill"
    done
    echo "  copied $* from github.com/$repo ($(git -C "$dir" rev-parse --short HEAD)) into $SKILLS"
  }

  echo "Installing Impeccable…"
  if [[ $ONLY -eq 0 && $USER_SCOPE -eq 0 ]] && (cd "$PROJECT" && npx -y impeccable install -y --providers=claude --scope=project); then
    :
  else
    echo "  Impeccable's installer wasn't used or couldn't download; using its GitHub source."
    from_github pbakaus/impeccable .claude/skills impeccable
  fi

  echo "Installing Anthropic's design plugin…"
  if [[ $ONLY -eq 0 ]] && command -v claude >/dev/null 2>&1 \
    && { claude plugin marketplace add anthropics/knowledge-work-plugins >/dev/null 2>&1 || true; } \
    && claude plugin install design@knowledge-work-plugins; then
    :
  else
    echo "  The plugin installer wasn't available or failed; copying the design skills from GitHub."
    from_github anthropics/knowledge-work-plugins design/skills design-critique accessibility-review ux-copy user-research design-system
  fi
fi

if [[ $ONLY -eq 1 ]]; then
  echo "Companion skills in $SKILLS: $(ls "$SKILLS" | tr '\n' ' ')"
  exit 0
fi

echo
echo "Companions found for $PROJECT:"
(cd "$ROOT" && node scripts/companions.mjs --project "$PROJECT") | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);
for (const [k,v] of Object.entries(o)) console.log(`  ${v.found ? "yes" : "no "}  ${k.padEnd(20)} ${v.found ? v.path : "install: " + v.install}`);});'
echo
echo "MCP servers (check with /mcp in Claude Code): Mobbin or Refero for references, Figma for Figma frames."
