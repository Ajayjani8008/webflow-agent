#!/usr/bin/env bash
# wf-sync.sh — one-command, checksum-verified sync of the live Webflow GOAT pack into the git repo.
# Replaces hand-copying, which has already produced drift (a stray rules/core.md on 2026-07-28).
#
#   ./wf-sync.sh            check only — report what differs, change nothing (exit 1 if drift)
#   ./wf-sync.sh --apply    copy live → repo, then verify every pair byte-for-byte
#
# Live is always the source of truth: it is what the agent actually loads.
# Never edits the live pack, never commits — review the diff and commit yourself.
set -euo pipefail

LIVE="$HOME/.claude"
MEM="$HOME/docs/memory/webflow"
REPO="$HOME/Ajay/My_Project/agent/webflow-agnet/webflow-goat-agent"
APPLY=0; [[ "${1:-}" == "--apply" ]] && APPLY=1

SKILLS=(build-reference cms-build component-build custom-code-once design-intake figma-setup
        html-intake motion-build pixel-verify portable-mode responsive-pass session-recovery
        url-intake webflow-help webflow-platform)

# live path : repo path
PAIRS=(
  "$LIVE/agents/webflow/webflow-goat.md:$REPO/agents/webflow-goat.md"
  "$LIVE/rules/webflow/core.md:$REPO/rules/webflow-core.md"
  "$MEM/error_learnings.md:$REPO/docs-memory/error_learnings.md"
  "$MEM/impossible_cases.md:$REPO/docs-memory/impossible_cases.md"
  "$MEM/how-to-use.md:$REPO/how-to-use.md"
  "$MEM/package.json:$REPO/scripts/package.json"
)
for s in "${SKILLS[@]}"; do PAIRS+=("$LIVE/skills/$s/SKILL.md:$REPO/skills/$s/SKILL.md"); done
for f in "$MEM"/scripts/*.js "$MEM"/scripts/*.sh; do
  [[ -e "$f" ]] || continue
  PAIRS+=("$f:$REPO/scripts/$(basename "$f")")
done
# the per-site template travels with the pack; real site state never does
for f in "$MEM"/sites/_template/*; do
  [[ -e "$f" ]] || continue
  PAIRS+=("$f:$REPO/docs-memory/sites/_template/$(basename "$f")")
done

sum() { shasum -a 256 "$1" 2>/dev/null | cut -d' ' -f1; }

drift=0; copied=0; missing=0
for pair in "${PAIRS[@]}"; do
  live="${pair%%:*}"; repo="${pair##*:}"
  rel="${live#"$HOME"/}"
  if [[ ! -f "$live" ]]; then echo "MISSING LIVE  $rel"; missing=$((missing+1)); continue; fi
  if [[ -f "$repo" ]] && [[ "$(sum "$live")" == "$(sum "$repo")" ]]; then continue; fi
  if (( APPLY )); then
    mkdir -p "$(dirname "$repo")"; cp "$live" "$repo"
    if [[ "$(sum "$live")" == "$(sum "$repo")" ]]; then echo "synced   $rel"; copied=$((copied+1))
    else echo "COPY FAILED VERIFY  $rel"; drift=$((drift+1)); fi
  else
    echo "$([[ -f "$repo" ]] && echo drift || echo 'repo missing')   $rel"; drift=$((drift+1))
  fi
done

echo
if (( APPLY )); then
  echo "wf-sync: $copied file(s) synced, $drift verify failure(s), $missing missing live file(s)"
  echo "next: run 'node \"$MEM/scripts/wf-lint.js\"' (repo-drift must be 0), then review 'git -C $(dirname "$REPO") diff' and commit"
  exit $(( drift + missing > 0 ? 1 : 0 ))
else
  (( drift == 0 && missing == 0 )) && echo "wf-sync: repo matches live (${#PAIRS[@]} files checked)" \
    || echo "wf-sync: $drift file(s) differ, $missing missing — run with --apply"
  exit $(( drift + missing > 0 ? 1 : 0 ))
fi
