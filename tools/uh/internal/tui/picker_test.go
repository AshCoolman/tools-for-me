package tui

import (
	"testing"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/AshCoolman/uh/internal/parser"
)

// testInvocations simulates "docker run" history — only one subcommand
// so the TUI skips straight to flags phase.
func testInvocations() []parser.Invocation {
	cmds := []string{
		"docker run --rm -it -v $(pwd):/app node:18",
		"docker run --rm -it -v $(pwd):/app postgres:15",
		"docker run --rm -it node:18",
		"docker run --rm -v ~/.config:/config node:18",
		"docker run --rm -p 3000:3000 -p 8080:80 node:18",
	}
	base := []string{"docker", "run"}
	var invs []parser.Invocation
	for _, c := range cmds {
		invs = append(invs, parser.Parse(c, base))
	}
	return invs
}

func send(m tea.Model, keys ...string) tea.Model {
	for _, k := range keys {
		var cmd tea.Cmd
		m, cmd = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(k)})
		_ = cmd
	}
	return m
}

func sendSpecial(m tea.Model, key tea.KeyType) tea.Model {
	var cmd tea.Cmd
	m, cmd = m.Update(tea.KeyMsg{Type: key})
	_ = cmd
	return m
}

func TestToggleBoolFlag(t *testing.T) {
	m := New([]string{"docker", "run"}, testInvocations())

	// first flag should be --rm (highest count)
	if m.flags[0].rf.Name != "--rm" {
		t.Fatalf("first flag = %q, want --rm", m.flags[0].rf.Name)
	}

	m2 := send(m, "x").(Model)
	if !m2.flags[0].selected {
		t.Error("--rm should be selected after x")
	}
	cmd := m2.buildCmd()
	if cmd != "docker run --rm" {
		t.Errorf("cmd = %q", cmd)
	}

	m3 := send(m2, "x").(Model)
	if m3.flags[0].selected {
		t.Error("--rm should be deselected after second x")
	}
}

func TestStepIntoValueFlag(t *testing.T) {
	m := New([]string{"docker", "run"}, testInvocations())

	// find -v flag index
	vi := -1
	for i, f := range m.flags {
		if f.rf.Name == "-v" {
			vi = i
			break
		}
	}
	if vi < 0 {
		t.Fatal("-v not found")
	}

	// move cursor to -v
	cur := m
	for i := 0; i < vi; i++ {
		cur = send(cur, "j").(Model)
	}

	// step in
	cur = send(cur, "enter").(Model)
	if !cur.inSub {
		t.Fatal("should be in sub")
	}

	// select first value
	cur = send(cur, "enter").(Model)
	if cur.inSub {
		t.Error("should have stepped out")
	}
	if !cur.flags[vi].selected {
		t.Error("-v should be selected")
	}
}

func TestEscDiscardsSubSelection(t *testing.T) {
	m := New([]string{"docker", "run"}, testInvocations())

	vi := -1
	for i, f := range m.flags {
		if f.rf.Name == "-v" {
			vi = i
			break
		}
	}

	cur := m
	for i := 0; i < vi; i++ {
		cur = send(cur, "j").(Model)
	}

	cur = send(cur, "enter").(Model)
	cur = sendSpecial(cur, tea.KeyEsc).(Model)

	if cur.inSub {
		t.Error("should have stepped out")
	}
	if cur.flags[vi].selected {
		t.Error("-v should not be selected after esc")
	}
}

func TestRepeatableToggle(t *testing.T) {
	m := New([]string{"docker", "run"}, testInvocations())

	pi := -1
	for i, f := range m.flags {
		if f.rf.Name == "-p" {
			pi = i
			break
		}
	}
	if pi < 0 {
		t.Fatal("-p not found")
	}

	cur := m
	for i := 0; i < pi; i++ {
		cur = send(cur, "j").(Model)
	}

	cur = send(cur, "enter").(Model)
	if !cur.inSub {
		t.Fatal("should be in sub")
	}

	// toggle first value
	cur = send(cur, " ").(Model)
	if len(cur.flags[pi].chosenMulti) != 1 {
		t.Fatalf("chosenMulti = %v", cur.flags[pi].chosenMulti)
	}

	// toggle second
	cur = send(cur, "j", " ").(Model)
	if len(cur.flags[pi].chosenMulti) != 2 {
		t.Fatalf("chosenMulti = %v", cur.flags[pi].chosenMulti)
	}

	// enter to keep
	cur = send(cur, "enter").(Model)
	if cur.inSub {
		t.Error("should have stepped out")
	}
}

func TestExecuteAction(t *testing.T) {
	m := New([]string{"docker", "run"}, testInvocations())
	m2 := send(m, "x", "e").(Model)
	if !m2.done {
		t.Error("should be done")
	}
	if m2.result.Action != ActionExecute {
		t.Errorf("action = %v, want Execute", m2.result.Action)
	}
}

func TestCopyAction(t *testing.T) {
	m := New([]string{"docker", "run"}, testInvocations())
	m2 := send(m, "x", "c").(Model)
	if m2.result.Action != ActionCopy {
		t.Errorf("action = %v, want Copy", m2.result.Action)
	}
}

func TestEmptyInvocations(t *testing.T) {
	m := New([]string{"docker"}, nil)
	cmd := m.buildCmd()
	if cmd != "docker" {
		t.Errorf("cmd = %q", cmd)
	}
}

// testSubcmdInvocations simulates "git" history with multiple subcommands
func testSubcmdInvocations() []parser.Invocation {
	cmds := []string{
		"git commit -m 'init'",
		"git commit -m 'update'",
		"git commit --amend",
		"git push origin main",
		"git push --force",
		"git log --oneline",
		"git log --oneline -5",
	}
	base := []string{"git"}
	var invs []parser.Invocation
	for _, c := range cmds {
		invs = append(invs, parser.Parse(c, base))
	}
	return invs
}

func TestSubcmdPhase(t *testing.T) {
	m := New([]string{"git"}, testSubcmdInvocations())

	if m.phase != phaseSubcmd {
		t.Fatal("should start in subcmd phase")
	}
	if len(m.subcmds) != 3 {
		t.Fatalf("subcmds = %d, want 3", len(m.subcmds))
	}
	// commit should be first (3 invocations)
	if m.subcmds[0].Text != "commit" {
		t.Errorf("first subcmd = %q, want commit", m.subcmds[0].Text)
	}
}

func TestSubcmdDrillDown(t *testing.T) {
	m := New([]string{"git"}, testSubcmdInvocations())

	// select "commit" (first item, enter)
	m2 := send(m, "enter").(Model)

	if m2.phase != phaseFlags {
		t.Fatal("should be in flags phase after drill-down")
	}

	// baseTokens should now include "commit"
	if len(m2.baseTokens) != 2 || m2.baseTokens[1] != "commit" {
		t.Errorf("baseTokens = %v", m2.baseTokens)
	}

	// should have flags from git commit only (-m, --amend)
	hasM := false
	hasOneline := false
	for _, f := range m2.flags {
		if f.rf.Name == "-m" {
			hasM = true
		}
		if f.rf.Name == "--oneline" {
			hasOneline = true
		}
	}
	if !hasM {
		t.Error("-m should be present for git commit")
	}
	if hasOneline {
		t.Error("--oneline should NOT be present (that's git log)")
	}
}

func TestSubcmdBackNavigation(t *testing.T) {
	m := New([]string{"git"}, testSubcmdInvocations())

	// drill into "commit"
	m2 := send(m, "enter").(Model)
	if m2.phase != phaseFlags {
		t.Fatal("should be in flags phase")
	}
	if len(m2.baseTokens) != 2 {
		t.Fatalf("baseTokens = %v", m2.baseTokens)
	}

	// press esc to go back
	m3 := sendSpecial(m2, tea.KeyEsc).(Model)
	if m3.phase != phaseSubcmd {
		t.Fatal("should be back in subcmd phase")
	}
	if len(m3.baseTokens) != 1 || m3.baseTokens[0] != "git" {
		t.Errorf("baseTokens should be restored to [git], got %v", m3.baseTokens)
	}
	if len(m3.subcmds) != 3 {
		t.Errorf("subcmds should still have 3, got %d", len(m3.subcmds))
	}
}

func TestBuildFlagViewResetsTyping(t *testing.T) {
	m := New([]string{"docker", "run"}, testInvocations())
	m.typing = true
	m.input = "foo"
	m.buildFlagView(testInvocations())
	if m.typing {
		t.Error("typing should be reset")
	}
	if m.input != "" {
		t.Error("input should be reset")
	}
}

func TestSingleSubcmdSkipsPhase(t *testing.T) {
	m := New([]string{"docker", "run"}, testInvocations())
	if m.phase != phaseFlags {
		t.Error("should skip subcmd phase when only one subcommand")
	}
}

func TestEscDoesNothingWithoutDrillDown(t *testing.T) {
	m := New([]string{"docker", "run"}, testInvocations())
	m2 := sendSpecial(m, tea.KeyEsc).(Model)
	if m2.phase != phaseFlags {
		t.Error("esc should do nothing when there was no subcmd phase")
	}
}
