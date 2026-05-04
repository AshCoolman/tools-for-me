#!/usr/bin/env bash
# mini-speckit/install.sh — install or remove Claude command files and Codex
# skill registration for mini-speckit in the current repo.

set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACTION="${1:-install}"
TARGET="${2:-all}"
AGENTS_FILE="AGENTS.md"
NEXT_FILE="NEXT.md"
CODEX_MARKER_START="<!-- mini-speckit-codex start -->"
CODEX_MARKER_END="<!-- mini-speckit-codex end -->"
CODEX_SKILL_PATH="$SCRIPT_DIR/codex/skills/mini-speckit/SKILL.md"
CLAUDE_COMMANDS=(mini-speckit-specify.md mini-speckit-next.md spec-next-mini.md)

need_sources() {
  case "$1" in
    all|claude)
      for name in "${CLAUDE_COMMANDS[@]}"; do
        if [[ ! -f "$SCRIPT_DIR/commands/$name" ]]; then
          echo "ERROR: $SCRIPT_DIR/commands/$name not found. Is mini-speckit intact?" >&2
          exit 2
        fi
      done
      ;;
  esac
  case "$1" in
    all|codex)
      if [[ ! -f "$CODEX_SKILL_PATH" ]]; then
        echo "ERROR: $CODEX_SKILL_PATH not found. Is mini-speckit intact?" >&2
        exit 2
      fi
      ;;
  esac
}

seed_next() {
  if [[ -f "$NEXT_FILE" ]]; then
    return
  fi
  cp "$SCRIPT_DIR/NEXT.md.template" "$NEXT_FILE"
  echo "Seeded -> ./$NEXT_FILE"
}

install_claude() {
  mkdir -p .claude/commands
  for name in "${CLAUDE_COMMANDS[@]}"; do
    cp "$SCRIPT_DIR/commands/$name" ".claude/commands/$name"
  done
  echo "Installed -> ./.claude/commands/mini-speckit-specify.md"
  echo "Installed -> ./.claude/commands/mini-speckit-next.md"
  echo "Installed -> ./.claude/commands/spec-next-mini.md (compatibility alias)"
}

codex_block() {
  cat <<EOF2
$CODEX_MARKER_START
## mini-speckit Codex Skill

- mini-speckit: Use when the user wants to create, advance, or manage a mini-speckit single-file spec in \`specs/*.md\`, mentions \`mini-speckit\`, \`/mini-speckit-specify\`, \`/mini-speckit-next\`, or \`/spec-next-mini\`, or wants the lightweight alternative to full speckit. (file: $CODEX_SKILL_PATH)
$CODEX_MARKER_END
EOF2
}

write_codex_registration() {
  local tmp
  tmp="$(mktemp /tmp/mini-speckit-agents.XXXXXX)"

  if [[ -f "$AGENTS_FILE" ]]; then
    awk -v start="$CODEX_MARKER_START" -v end="$CODEX_MARKER_END" '
      $0 == start { skipping = 1; next }
      $0 == end { skipping = 0; next }
      !skipping { print }
    ' "$AGENTS_FILE" > "$tmp"
    cp "$tmp" "$AGENTS_FILE"
  else
    : > "$AGENTS_FILE"
  fi

  if [[ -s "$AGENTS_FILE" ]]; then
    printf "\n" >> "$AGENTS_FILE"
  fi
  codex_block >> "$AGENTS_FILE"
  rm -f "$tmp"
  echo "Registered mini-speckit Codex skill in ./AGENTS.md"
}

install_codex() {
  write_codex_registration
}

uninstall_claude() {
  local removed=0
  for name in "${CLAUDE_COMMANDS[@]}"; do
    if [[ -f ".claude/commands/$name" ]]; then
      rm -f ".claude/commands/$name"
      removed=1
    fi
  done
  if [[ "$removed" -eq 1 ]]; then
    echo "Removed mini-speckit Claude commands from ./.claude/commands/"
  else
    echo "Nothing to remove from ./.claude/commands/"
  fi
}

uninstall_codex() {
  local tmp
  if [[ ! -f "$AGENTS_FILE" ]]; then
    echo "Nothing to remove from ./AGENTS.md"
    return
  fi

  tmp="$(mktemp /tmp/mini-speckit-agents.XXXXXX)"
  awk -v start="$CODEX_MARKER_START" -v end="$CODEX_MARKER_END" '
    $0 == start { skipping = 1; next }
    $0 == end { skipping = 0; next }
    !skipping { print }
  ' "$AGENTS_FILE" > "$tmp"
  cp "$tmp" "$AGENTS_FILE"
  rm -f "$tmp"
  echo "Removed mini-speckit Codex registration from ./AGENTS.md"
}

show_status() {
  echo "package root: $SCRIPT_DIR"
  if [[ -f "$NEXT_FILE" ]]; then
    echo "NEXT.md: present"
  else
    echo "NEXT.md: missing"
  fi
  for name in "${CLAUDE_COMMANDS[@]}"; do
    if [[ -f ".claude/commands/$name" ]]; then
      echo "$name: installed"
    else
      echo "$name: missing"
    fi
  done
  if [[ -f "$AGENTS_FILE" ]] && grep -qF "$CODEX_MARKER_START" "$AGENTS_FILE"; then
    echo "Codex registration: present"
  else
    echo "Codex registration: missing"
  fi
}

case "$ACTION" in
  install)
    case "$TARGET" in
      all|claude|codex) ;;
      *)
        echo "Unknown install target: $TARGET" >&2
        echo "Run '$0 --help' for usage." >&2
        exit 2
        ;;
    esac
    need_sources "$TARGET"
    seed_next
    case "$TARGET" in
      all)
        install_claude
        install_codex
        ;;
      claude)
        install_claude
        ;;
      codex)
        install_codex
        ;;
    esac
    ;;
  uninstall)
    case "$TARGET" in
      all|claude|codex) ;;
      *)
        echo "Unknown uninstall target: $TARGET" >&2
        echo "Run '$0 --help' for usage." >&2
        exit 2
        ;;
    esac
    case "$TARGET" in
      all)
        uninstall_claude
        uninstall_codex
        ;;
      claude)
        uninstall_claude
        ;;
      codex)
        uninstall_codex
        ;;
    esac
    ;;
  status)
    show_status
    ;;
  -h|--help)
    cat <<'EOH'
Usage: mini-speckit install [all|claude|codex]
       mini-speckit uninstall [all|claude|codex]
       mini-speckit status

  install    Seed NEXT.md if missing, copy the Claude mini-speckit commands,
             and/or register the Codex mini-speckit skill in AGENTS.md.
  uninstall  Remove the Claude mini-speckit commands and/or remove the Codex
             mini-speckit registration from AGENTS.md.
  status     Show whether NEXT.md, Claude commands, and Codex registration are present.

Targets:
  all        Install/remove both integrations (default)
  claude     Install/remove only Claude command files
  codex      Install/remove only the AGENTS.md Codex registration
EOH
    ;;
  *)
    echo "Unknown arg: $ACTION" >&2
    echo "Run '$0 --help' for usage." >&2
    exit 2
    ;;
esac
