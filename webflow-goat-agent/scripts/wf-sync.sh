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
# Repo location varies per machine — export WF_REPO to override, else probe known clones.
REPO="${WF_REPO:-}"
if [[ -z "$REPO" ]]; then
  for c in "$HOME/My_Projects/My_Agents/webflow-agent-main/webflow-agent/webflow-goat-agent" \
           "$HOME/Ajay/My_Project/agent/webflow-agnet/webflow-goat-agent"; do
    [[ -d "$c" ]] && REPO="$c" && break
  done
  REPO="${REPO:-$HOME/My_Projects/My_Agents/webflow-agent/webflow-goat-agent}"
fi
APPLY=0; [[ "${1:-}" == "--apply" ]] && APPLY=1

SKILLS=(build-reference cms-build component-build custom-code-once design-intake figma-setup
        html-intake motion-build pixel-verify portable-mode responsive-pass session-recovery
        url-intake webflow-core webflow-help webflow-platform)

# live path <TAB> repo path — a TAB separator, because a Windows repo path
# contains a drive-letter colon and ${pair##*:} would eat it.
TAB=$'	'
PAIRS=(
  "$LIVE/agents/webflow/webflow-goat.md$TAB$REPO/agents/webflow-goat.md"
  "$HOME/CLAUDE.md$TAB$REPO/CLAUDE.md"
  "$LIVE/rules/common/agents.md$TAB$REPO/rules/common-agents.md"
  "$MEM/CHANGELOG.md$TAB$REPO/CHANGELOG.md"
  "$MEM/v2-rationale.md$TAB$REPO/docs-memory/v2-rationale.md"
  "$MEM/error_learnings.md$TAB$REPO/docs-memory/error_learnings.md"
  "$MEM/impossible_cases.md$TAB$REPO/docs-memory/impossible_cases.md"
  "$MEM/how-to-use.md$TAB$REPO/how-to-use.md"
)
for s in "${SKILLS[@]}"; do PAIRS+=("$LIVE/skills/$s/SKILL.md$TAB$REPO/skills/$s/SKILL.md"); done
# scripts/*.json carries DATA the scripts depend on (skeletons.json) — it must travel with the pack.
# Machine-local state (dotfiles such as .wf-lint-baseline.json) is skipped by the basename guard below.
for f in "$MEM"/scripts/*.js "$MEM"/scripts/*.sh "$MEM"/scripts/*.json; do
  [[ "$(basename "$f")" == .* ]] && continue
  [[ -e "$f" ]] || continue
  PAIRS+=("$f$TAB$REPO/scripts/$(basename "$f")")
done
# the per-site template always travels with the pack (files at the top level, plus specs/)
for f in "$MEM"/sites/_template/*; do
  [[ -f "$f" ]] || continue
  PAIRS+=("$f$TAB$REPO/docs-memory/sites/_template/$(basename "$f")")
done
for f in "$MEM"/sites/_template/specs/*; do
  [[ -f "$f" ]] || continue
  PAIRS+=("$f$TAB$REPO/docs-memory/sites/_template/specs/$(basename "$f")")
done
# real sites: sync the three state files IF the repo already tracks that site, so outstanding
# Designer work and the class registry survive a restore. Caches (figma-cache/ref-cache) never
# travel — they are large, refetchable, and site-specific. A site the repo does not track yet
# stays local until you `mkdir` it in the repo, so nothing is published by accident.
for d in "$MEM"/sites/*/; do
  site="$(basename "$d")"
  [[ "$site" == "_template" ]] && continue
  [[ -d "$REPO/docs-memory/sites/$site" ]] || continue
  for n in registry.md build_state.json pending_designer_work.md; do
    [[ -f "$d$n" ]] && PAIRS+=("$d$n$TAB$REPO/docs-memory/sites/$site/$n")
  done
done

sum() { shasum -a 256 "$1" 2>/dev/null | cut -d' ' -f1; }

drift=0; copied=0; missing=0
for pair in "${PAIRS[@]}"; do
  live="${pair%%"$TAB"*}"; repo="${pair##*"$TAB"}"
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
