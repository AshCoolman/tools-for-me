#!/usr/bin/env bash
# mini-speckit/install.sh — install or remove host-native commands and skills
# in the current repo.

set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACTION="${1:-install}"
TARGET="${2:-all}"
NEXT_FILE="NEXT.md"
LEGACY_AGENTS_FILE="AGENTS.md"
LEGACY_GEMINI_FILE="GEMINI.md"
CODEX_MARKER_START="<!-- mini-speckit-codex start -->"
CODEX_MARKER_END="<!-- mini-speckit-codex end -->"
GEMINI_MARKER_START="<!-- mini-speckit-gemini start -->"
GEMINI_MARKER_END="<!-- mini-speckit-gemini end -->"
CLAUDE_COMMANDS=(mini-speckit-specify.md mini-speckit-next.md spec-next-mini.md)
GEMINI_COMMANDS=("mini-speckit/specify.toml" "mini-speckit/next.toml")
SKILL_SOURCE_DIR="$SCRIPT_DIR/skills/mini-speckit"

need_sources() {
  case "$1" in
    all|claude)
      local name
      for name in "${CLAUDE_COMMANDS[@]}"; do
        if [[ ! -f "$SCRIPT_DIR/commands/$name" ]]; then
          echo "ERROR: $SCRIPT_DIR/commands/$name not found. Is mini-speckit intact?" >&2
          exit 2
        fi
      done
      ;;
  esac

  case "$1" in
    all|codex|gemini)
      if [[ ! -f "$SKILL_SOURCE_DIR/SKILL.md" ]]; then
        echo "ERROR: $SKILL_SOURCE_DIR/SKILL.md not found. Is mini-speckit intact?" >&2
        exit 2
      fi
      ;;
  esac

  case "$1" in
    all|gemini)
      local name
      for name in "${GEMINI_COMMANDS[@]}"; do
        if [[ ! -f "$SCRIPT_DIR/gemini/commands/$name" ]]; then
          echo "ERROR: $SCRIPT_DIR/gemini/commands/$name not found. Is mini-speckit intact?" >&2
          exit 2
        fi
      done
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

strip_block() {
  local file="$1"
  local start="$2"
  local end="$3"
  local tmp

  tmp="$(mktemp /tmp/mini-speckit-block.XXXXXX)"
  if [[ -f "$file" ]]; then
    awk -v start="$start" -v end="$end" '
      $0 == start { skipping = 1; next }
      $0 == end { skipping = 0; next }
      !skipping { print }
    ' "$file" > "$tmp"
    cp "$tmp" "$file"
  fi
  rm -f "$tmp"
}

cleanup_legacy_codex() {
  if [[ -f "$LEGACY_AGENTS_FILE" ]] && grep -qF "$CODEX_MARKER_START" "$LEGACY_AGENTS_FILE"; then
    strip_block "$LEGACY_AGENTS_FILE" "$CODEX_MARKER_START" "$CODEX_MARKER_END"
    echo "Removed legacy mini-speckit Codex block from ./AGENTS.md"
  fi
}

cleanup_legacy_gemini() {
  if [[ -f "$LEGACY_GEMINI_FILE" ]] && grep -qF "$GEMINI_MARKER_START" "$LEGACY_GEMINI_FILE"; then
    strip_block "$LEGACY_GEMINI_FILE" "$GEMINI_MARKER_START" "$GEMINI_MARKER_END"
    echo "Removed legacy mini-speckit Gemini block from ./GEMINI.md"
  fi
}

install_skill_dir() {
  local dest="$1"
  rm -rf "$dest"
  mkdir -p "$dest"
  cp -R "$SKILL_SOURCE_DIR/." "$dest/"
}

install_claude() {
  local name
  mkdir -p .claude/commands
  for name in "${CLAUDE_COMMANDS[@]}"; do
    cp "$SCRIPT_DIR/commands/$name" ".claude/commands/$name"
  done
  echo "Installed -> ./.claude/commands/mini-speckit-specify.md"
  echo "Installed -> ./.claude/commands/mini-speckit-next.md"
  echo "Installed -> ./.claude/commands/spec-next-mini.md (compatibility alias)"
}

install_codex() {
  cleanup_legacy_codex
  install_skill_dir ".codex/skills/mini-speckit"
  echo "Installed -> ./.codex/skills/mini-speckit/SKILL.md"
}

install_gemini() {
  local name
  cleanup_legacy_gemini
  mkdir -p .gemini/commands/mini-speckit
  for name in "${GEMINI_COMMANDS[@]}"; do
    cp "$SCRIPT_DIR/gemini/commands/$name" ".gemini/commands/$name"
  done
  install_skill_dir ".gemini/skills/mini-speckit"
  echo "Installed -> ./.gemini/commands/mini-speckit/specify.toml"
  echo "Installed -> ./.gemini/commands/mini-speckit/next.toml"
  echo "Installed -> ./.gemini/skills/mini-speckit/SKILL.md"
}

uninstall_claude() {
  local removed=0
  local name
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
  local removed=0
  if [[ -d ".codex/skills/mini-speckit" ]]; then
    rm -rf ".codex/skills/mini-speckit"
    removed=1
  fi
  cleanup_legacy_codex
  if [[ "$removed" -eq 1 ]]; then
    echo "Removed mini-speckit Codex skill from ./.codex/skills/"
  else
    echo "Nothing to remove from ./.codex/skills/"
  fi
}

uninstall_gemini() {
  local removed=0
  local name
  for name in "${GEMINI_COMMANDS[@]}"; do
    if [[ -f ".gemini/commands/$name" ]]; then
      rm -f ".gemini/commands/$name"
      removed=1
    fi
  done
  if [[ -d ".gemini/skills/mini-speckit" ]]; then
    rm -rf ".gemini/skills/mini-speckit"
    removed=1
  fi
  cleanup_legacy_gemini
  if [[ "$removed" -eq 1 ]]; then
    echo "Removed mini-speckit Gemini commands and skill from ./.gemini/"
  else
    echo "Nothing to remove from ./.gemini/"
  fi
}

show_status() {
  local name

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

  if [[ -f ".codex/skills/mini-speckit/SKILL.md" ]]; then
    echo "Codex skill: present"
  else
    echo "Codex skill: missing"
  fi

  for name in "${GEMINI_COMMANDS[@]}"; do
    if [[ -f ".gemini/commands/$name" ]]; then
      echo "Gemini command $name: present"
    else
      echo "Gemini command $name: missing"
    fi
  done

  if [[ -f ".gemini/skills/mini-speckit/SKILL.md" ]]; then
    echo "Gemini skill: present"
  else
    echo "Gemini skill: missing"
  fi

  if [[ -f "$LEGACY_AGENTS_FILE" ]] && grep -qF "$CODEX_MARKER_START" "$LEGACY_AGENTS_FILE"; then
    echo "Legacy AGENTS.md block: present"
  else
    echo "Legacy AGENTS.md block: absent"
  fi

  if [[ -f "$LEGACY_GEMINI_FILE" ]] && grep -qF "$GEMINI_MARKER_START" "$LEGACY_GEMINI_FILE"; then
    echo "Legacy GEMINI.md block: present"
  else
    echo "Legacy GEMINI.md block: absent"
  fi
}

show_help() {
  cat <<'EOH'
Usage: mini-speckit install [all|claude|codex|gemini]
       mini-speckit uninstall [all|claude|codex|gemini]
       mini-speckit status

  install    Seed NEXT.md if missing, copy the Claude mini-speckit commands,
             install the Codex skill into .codex/skills, and install the
             Gemini commands and skill into .gemini/.
  uninstall  Remove the Claude mini-speckit commands, remove the Codex
             skill from .codex/skills, and remove the Gemini commands and
             skill from .gemini/.
  status     Show whether NEXT.md plus the installed integrations exist.

Targets:
  all        Install/remove every integration
  claude     Install/remove only the .claude command files
  codex      Install/remove only the .codex skill
  gemini     Install/remove only the .gemini commands and skill
EOH
}

case "$ACTION" in
  install)
    case "$TARGET" in
      all|claude|codex|gemini) ;;
      *)
        echo "Unknown install target: $TARGET" >&2
        show_help >&2
        exit 2
        ;;
    esac
    need_sources "$TARGET"
    seed_next
    case "$TARGET" in
      all)
        install_claude
        install_codex
        install_gemini
        ;;
      claude)
        install_claude
        ;;
      codex)
        install_codex
        ;;
      gemini)
        install_gemini
        ;;
    esac
    ;;
  uninstall)
    case "$TARGET" in
      all|claude|codex|gemini) ;;
      *)
        echo "Unknown uninstall target: $TARGET" >&2
        show_help >&2
        exit 2
        ;;
    esac
    case "$TARGET" in
      all)
        uninstall_claude
        uninstall_codex
        uninstall_gemini
        ;;
      claude)
        uninstall_claude
        ;;
      codex)
        uninstall_codex
        ;;
      gemini)
        uninstall_gemini
        ;;
    esac
    ;;
  status)
    show_status
    ;;
  -h|--help|help)
    show_help
    ;;
  *)
    echo "Unknown action: $ACTION" >&2
    show_help >&2
    exit 2
    ;;
esac
