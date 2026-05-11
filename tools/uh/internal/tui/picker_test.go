package tui

import (
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/AshCoolman/uh/internal/parser"
)

func testDockerRunInvocations() []parser.Invocation {
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

func testGitInvocations() []parser.Invocation {
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

func TestInitialCmdHasBase(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInvocations())
	if !strings.HasPrefix(m.cmd, "docker run ") {
		t.Errorf("cmd = %q, want prefix 'docker run '", m.cmd)
	}
}

func TestTypingAppendsToCmd(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInvocations())
	m2 := send(m, "-", "-", "r", "m").(Model)
	if !strings.HasSuffix(m2.cmd, "--rm") {
		t.Errorf("cmd = %q, want suffix '--rm'", m2.cmd)
	}
}

func TestSpaceTypesSpace(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInvocations())
	m2 := send(m, "a").(Model)
	m3 := sendSpecial(m2, tea.KeySpace).(Model)
	m4 := send(m3, "b").(Model)
	if !strings.HasSuffix(m4.cmd, "a b") {
		t.Errorf("cmd = %q, want suffix 'a b'", m4.cmd)
	}
}

func TestTabCompletesBoolFlag(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInvocations())
	// type partial to filter to --rm
	m2 := send(m, "-", "-", "r", "m").(Model)
	m3 := sendSpecial(m2, tea.KeyTab).(Model)
	if !strings.Contains(m3.cmd, "--rm ") {
		t.Errorf("cmd = %q, want '--rm ' after tab", m3.cmd)
	}
}

func TestEnterCompletesBoolFlag(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInvocations())
	m2 := send(m, "-", "-", "r", "m").(Model)
	m3 := sendSpecial(m2, tea.KeyEnter).(Model)
	if !strings.Contains(m3.cmd, "--rm ") {
		t.Errorf("cmd = %q, want '--rm ' after enter", m3.cmd)
	}
}

func TestUsedFlagsExcluded(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInvocations())
	// complete --rm
	m2 := send(m, "-", "-", "r", "m").(Model)
	m3 := sendSpecial(m2, tea.KeyTab).(Model)

	sugg := m3.suggestions()
	for _, s := range sugg {
		if s.Name == "--rm" {
			t.Error("--rm should be excluded from suggestions after use")
		}
	}
}

func TestValueFlagShowsValues(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInvocations())
	// filter to -v
	m2 := send(m, "-", "v").(Model)
	m3 := sendSpecial(m2, tea.KeyTab).(Model)
	if m3.showValues < 0 {
		t.Error("should be in value picker after tab on value flag")
	}
}

func TestValuePickerSelectsValue(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInvocations())
	m2 := send(m, "-", "v").(Model)
	m3 := sendSpecial(m2, tea.KeyTab).(Model)
	if m3.showValues < 0 {
		t.Fatal("should be in value picker")
	}
	m4 := sendSpecial(m3, tea.KeyEnter).(Model)
	if m4.showValues >= 0 {
		t.Error("should have left value picker")
	}
	// cmd should contain -v and a value
	if !strings.Contains(m4.cmd, "-v ") {
		t.Errorf("cmd = %q, want '-v' with value", m4.cmd)
	}
}

func TestValuePickerEscRemovesFlag(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInvocations())
	m2 := send(m, "-", "v").(Model)
	m3 := sendSpecial(m2, tea.KeyTab).(Model)
	m4 := sendSpecial(m3, tea.KeyEsc).(Model)
	if m4.showValues >= 0 {
		t.Error("should have left value picker")
	}
	if strings.Contains(m4.cmd, "-v") {
		t.Errorf("cmd = %q, -v should be removed after esc in value picker", m4.cmd)
	}
}

func TestCtrlXProducesExecute(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInvocations())
	m2 := sendSpecial(m, tea.KeyCtrlX).(Model)
	if !m2.done {
		t.Error("should be done")
	}
	if m2.result.Action != ActionExecute {
		t.Errorf("action = %v, want Execute", m2.result.Action)
	}
}

func TestCtrlYProducesCopy(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInvocations())
	m2 := sendSpecial(m, tea.KeyCtrlY).(Model)
	if !m2.done {
		t.Error("should be done")
	}
	if m2.result.Action != ActionCopy {
		t.Errorf("action = %v, want Copy", m2.result.Action)
	}
}

func TestEscQuits(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInvocations())
	m2 := sendSpecial(m, tea.KeyEsc).(Model)
	if !m2.done {
		t.Error("should be done")
	}
	if m2.result.Action != ActionQuit {
		t.Errorf("action = %v, want Quit", m2.result.Action)
	}
}

func TestBackspaceRemovesChar(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInvocations())
	m2 := send(m, "a", "b", "c").(Model)
	m3 := sendSpecial(m2, tea.KeyBackspace).(Model)
	if strings.HasSuffix(m3.cmd, "abc") {
		t.Errorf("cmd = %q, backspace should have removed last char", m3.cmd)
	}
	if !strings.HasSuffix(m3.cmd, "ab") {
		t.Errorf("cmd = %q, want suffix 'ab'", m3.cmd)
	}
}

func TestArrowsNavigateSuggestions(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInvocations())
	if m.cursor != 0 {
		t.Fatalf("initial cursor = %d", m.cursor)
	}
	m2 := sendSpecial(m, tea.KeyDown).(Model)
	if m2.cursor != 1 {
		t.Errorf("cursor after down = %d, want 1", m2.cursor)
	}
	m3 := sendSpecial(m2, tea.KeyUp).(Model)
	if m3.cursor != 0 {
		t.Errorf("cursor after up = %d, want 0", m3.cursor)
	}
}

func TestSubcmdPhaseDetected(t *testing.T) {
	m := New([]string{"git"}, testGitInvocations())
	if m.phase != phaseSubcmd {
		t.Fatal("should start in subcmd phase")
	}
	if len(m.subcmds) != 3 {
		t.Fatalf("subcmds = %d, want 3", len(m.subcmds))
	}
}

func TestSubcmdDrillDown(t *testing.T) {
	m := New([]string{"git"}, testGitInvocations())
	m2 := sendSpecial(m, tea.KeyEnter).(Model)
	if m2.phase != phaseInput {
		t.Fatal("should be in input phase after drill-down")
	}
	if !strings.HasPrefix(m2.cmd, "git commit ") {
		t.Errorf("cmd = %q, want prefix 'git commit '", m2.cmd)
	}
}

func TestSubcmdEscQuits(t *testing.T) {
	m := New([]string{"git"}, testGitInvocations())
	m2 := sendSpecial(m, tea.KeyEsc).(Model)
	if !m2.done {
		t.Error("esc in subcmd phase should quit")
	}
}

func TestSingleSubcmdSkipsPhase(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInvocations())
	if m.phase != phaseInput {
		t.Error("should skip subcmd phase when single subcommand")
	}
}

func TestEmptyInvocations(t *testing.T) {
	m := New([]string{"docker"}, nil)
	if strings.TrimSpace(m.cmd) != "docker" {
		t.Errorf("cmd = %q", m.cmd)
	}
}

func TestResultCommandTrimmed(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInvocations())
	m2 := sendSpecial(m, tea.KeyCtrlX).(Model)
	if strings.HasSuffix(m2.result.Command, " ") {
		t.Errorf("result command has trailing space: %q", m2.result.Command)
	}
}
