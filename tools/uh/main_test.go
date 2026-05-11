package main

import (
	"os"
	"reflect"
	"strings"
	"testing"

	"github.com/AshCoolman/uh/internal/history"
	"github.com/AshCoolman/uh/internal/model"
	"github.com/AshCoolman/uh/internal/parser"
)

func TestParseArgsDryRunBeforeBase(t *testing.T) {
	o := parseArgs([]string{"--dry-run", "git"})
	if !o.dryRun {
		t.Error("--dry-run before base should set dryRun")
	}
	if !reflect.DeepEqual(o.baseTokens, []string{"git"}) {
		t.Errorf("baseTokens = %v, want [git]", o.baseTokens)
	}
}

func TestParseArgsDryRunAfterBase(t *testing.T) {
	o := parseArgs([]string{"git", "--dry-run"})
	if o.dryRun {
		t.Error("--dry-run after base should NOT set dryRun — it belongs to git")
	}
	if !reflect.DeepEqual(o.baseTokens, []string{"git", "--dry-run"}) {
		t.Errorf("baseTokens = %v, want [git --dry-run]", o.baseTokens)
	}
}

func TestParseArgsUnknownFlagsAreBaseTokens(t *testing.T) {
	o := parseArgs([]string{"git", "--resume", "blah"})
	if !reflect.DeepEqual(o.baseTokens, []string{"git", "--resume", "blah"}) {
		t.Errorf("baseTokens = %v, want [git --resume blah]", o.baseTokens)
	}
}

func TestParseArgsHistoryFileBeforeBase(t *testing.T) {
	o := parseArgs([]string{"--history-file", "/tmp/hist", "git"})
	if o.historyFile != "/tmp/hist" {
		t.Errorf("historyFile = %q, want /tmp/hist", o.historyFile)
	}
	if !reflect.DeepEqual(o.baseTokens, []string{"git"}) {
		t.Errorf("baseTokens = %v, want [git]", o.baseTokens)
	}
}

func TestParseArgsHistoryFileAfterBase(t *testing.T) {
	o := parseArgs([]string{"git", "--history-file", "/tmp/hist"})
	if o.historyFile != "" {
		t.Error("--history-file after base should NOT be consumed by uh")
	}
	if !reflect.DeepEqual(o.baseTokens, []string{"git", "--history-file", "/tmp/hist"}) {
		t.Errorf("baseTokens = %v, want [git --history-file /tmp/hist]", o.baseTokens)
	}
}

func TestParseArgsVersionFlag(t *testing.T) {
	o := parseArgs([]string{"--version"})
	if !o.version {
		t.Error("--version should set version")
	}
}

func TestParseArgsBaseOnly(t *testing.T) {
	o := parseArgs([]string{"git"})
	if !reflect.DeepEqual(o.baseTokens, []string{"git"}) {
		t.Errorf("baseTokens = %v, want [git]", o.baseTokens)
	}
	if o.dryRun || o.version || o.historyFile != "" {
		t.Error("no flags should be set")
	}
}

func TestParseArgsDryRunThenBaseWithFlags(t *testing.T) {
	o := parseArgs([]string{"--dry-run", "git", "--oneline"})
	if !o.dryRun {
		t.Error("--dry-run should be set")
	}
	if !reflect.DeepEqual(o.baseTokens, []string{"git", "--oneline"}) {
		t.Errorf("baseTokens = %v, want [git --oneline]", o.baseTokens)
	}
}

func TestParseArgsMultiTokenBase(t *testing.T) {
	o := parseArgs([]string{"docker", "compose", "up", "-d"})
	if !reflect.DeepEqual(o.baseTokens, []string{"docker", "compose", "up", "-d"}) {
		t.Errorf("baseTokens = %v", o.baseTokens)
	}
}

func TestSkeletonBase(t *testing.T) {
	tests := []struct {
		name   string
		tokens []string
		want   []string
	}{
		{
			name:   "no change when only command",
			tokens: []string{"git"},
			want:   []string{"git"},
		},
		{
			name:   "strips positional values",
			tokens: []string{"claude", "--resume", "blah"},
			want:   []string{"claude", "--resume"},
		},
		{
			name:   "strips subcommand positionals",
			tokens: []string{"git", "log", "--oneline"},
			want:   []string{"git", "--oneline"},
		},
		{
			name:   "strips multiple positionals",
			tokens: []string{"docker", "run", "--rm", "node:18"},
			want:   []string{"docker", "--rm"},
		},
		{
			name:   "keeps all flags",
			tokens: []string{"git", "--oneline", "--graph"},
			want:   []string{"git", "--oneline", "--graph"},
		},
		{
			name:   "single token no change",
			tokens: []string{"claude"},
			want:   []string{"claude"},
		},
		{
			name:   "short flags kept",
			tokens: []string{"docker", "run", "-it", "--rm"},
			want:   []string{"docker", "-it", "--rm"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := skeletonBase(tt.tokens)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("skeletonBase(%v) = %v, want %v", tt.tokens, got, tt.want)
			}
		})
	}
}

func TestSkeletonBaseNoChange(t *testing.T) {
	tokens := []string{"git"}
	skel := skeletonBase(tokens)
	if !reflect.DeepEqual(skel, tokens) {
		t.Errorf("skeleton of single token should be unchanged")
	}
}

func TestSkeletonBaseSameAsInput(t *testing.T) {
	tokens := []string{"git", "--oneline"}
	skel := skeletonBase(tokens)
	if !reflect.DeepEqual(skel, tokens) {
		t.Errorf("skeleton with no positionals should be unchanged, got %v", skel)
	}
}

func TestSkeletonBaseReturnsDifferent(t *testing.T) {
	tokens := []string{"claude", "--resume", "abc-123"}
	skel := skeletonBase(tokens)
	if reflect.DeepEqual(skel, tokens) {
		t.Error("skeleton should differ from input when positionals present")
	}
	if len(skel) != 2 || skel[0] != "claude" || skel[1] != "--resume" {
		t.Errorf("got %v, want [claude --resume]", skel)
	}
}

// Verify that skeletonBase is a no-op when input has no positionals to strip
func TestSkeletonBaseIsNoOpForFlagOnly(t *testing.T) {
	for _, tokens := range [][]string{
		{"git"},
		{"git", "--oneline"},
		{"git", "--oneline", "--graph"},
		{"docker", "-it", "--rm"},
	} {
		skel := skeletonBase(tokens)
		if !reflect.DeepEqual(skel, tokens) {
			t.Errorf("skeletonBase(%v) = %v, expected no-op", tokens, skel)
		}
	}
}

// End-to-end: skeleton fallback widens the search but keeps original baseTokens.
// Parser strips by count (3), consuming the wildcard value position.
// Only flags AFTER that position appear as suggestions.
func TestSkeletonFallbackFindsDownstreamFlags(t *testing.T) {
	histDir := t.TempDir()
	histFile := histDir + "/history"
	content := strings.Join([]string{
		"claude --resume abc-123 --dangerously-skip-permissions",
		"claude --resume def-456",
		"claude --resume ghi-789 --verbose",
		"claude --verbose",
		"ls -la",
	}, "\n")
	if err := os.WriteFile(histFile, []byte(content), 0600); err != nil {
		t.Fatal(err)
	}

	baseTokens := []string{"claude", "--resume", "blah"}

	// Primary: 0 results
	lines, _ := history.Read(histFile, baseTokens)
	if len(lines) != 0 {
		t.Fatalf("primary should find 0, got %d", len(lines))
	}

	// Skeleton widens search but baseTokens stays ["claude", "--resume", "blah"]
	skelBase := skeletonBase(baseTokens)
	skelLines, _ := history.Read(histFile, skelBase)
	if len(skelLines) != 3 {
		t.Fatalf("skeleton should find 3, got %d", len(skelLines))
	}

	// Parse with ORIGINAL baseTokens (len=3), not skelBase.
	// Parser strips 3 tokens: "claude", "--resume", <value>.
	// Only tokens after position 3 become flags/positionals.
	var invocations []parser.Invocation
	for _, line := range skelLines {
		invocations = append(invocations, parser.Parse(line, baseTokens))
	}

	space := model.Build(invocations)

	foundDSP := false
	foundVerbose := false
	for _, f := range space.Flags {
		if f.Name == "--dangerously-skip-permissions" {
			foundDSP = true
		}
		if f.Name == "--verbose" {
			foundVerbose = true
		}
	}
	if !foundDSP {
		t.Error("--dangerously-skip-permissions should appear as downstream flag")
	}
	if !foundVerbose {
		t.Error("--verbose should appear as downstream flag")
	}

	// The resume values (abc-123, etc.) should NOT appear as flags
	for _, f := range space.Flags {
		if f.Name == "--resume" {
			t.Error("--resume should not appear — it's a base token, not downstream")
		}
	}
}

// Verify that abc-123 etc. don't leak into the flag list when
// parsing with 3-token base against skeleton-widened results.
func TestSkeletonFallbackValuesNotFlags(t *testing.T) {
	histDir := t.TempDir()
	histFile := histDir + "/history"
	content := strings.Join([]string{
		"claude --resume abc-123 --verbose",
		"claude --resume def-456 --verbose",
	}, "\n")
	if err := os.WriteFile(histFile, []byte(content), 0600); err != nil {
		t.Fatal(err)
	}

	baseTokens := []string{"claude", "--resume", "blah"}
	skelBase := skeletonBase(baseTokens)
	skelLines, _ := history.Read(histFile, skelBase)

	var invocations []parser.Invocation
	for _, line := range skelLines {
		invocations = append(invocations, parser.Parse(line, baseTokens))
	}

	space := model.Build(invocations)

	if len(space.Flags) != 1 || space.Flags[0].Name != "--verbose" {
		t.Errorf("expected only --verbose flag, got %v", space.Flags)
	}
	if len(space.Positionals) != 0 {
		t.Errorf("expected no positionals, got %v", space.Positionals)
	}
}
