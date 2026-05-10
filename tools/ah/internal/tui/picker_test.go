package tui

import (
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/AshCoolman/ah/internal/helpparse"
)

func testDockerRunInfo() helpparse.HelpInfo {
	return helpparse.HelpInfo{
		Flags: []helpparse.Flag{
			{Long: "--rm", IsBool: true, Description: "Automatically remove the container"},
			{Short: "-i", Long: "--interactive", IsBool: true, Description: "Keep STDIN open"},
			{Short: "-t", Long: "--tty", IsBool: true, Description: "Allocate a pseudo-TTY"},
			{Short: "-d", Long: "--detach", IsBool: true, Description: "Run in background"},
			{Short: "-v", Long: "--volume", ValueType: "list", Description: "Bind mount a volume"},
			{Short: "-p", Long: "--publish", ValueType: "list", Description: "Publish port(s)"},
			{Short: "-e", Long: "--env", ValueType: "list", Description: "Set environment variables"},
			{Short: "-w", Long: "--workdir", ValueType: "string", Description: "Working directory"},
		},
	}
}

func testGitInfo() helpparse.HelpInfo {
	return helpparse.HelpInfo{
		Subcommands: []helpparse.Subcommand{
			{Name: "commit", Description: "Record changes to the repository"},
			{Name: "push", Description: "Update remote refs"},
			{Name: "log", Description: "Show commit logs"},
		},
	}
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
	m := New([]string{"docker", "run"}, testDockerRunInfo())
	if !strings.HasPrefix(m.cmd, "docker run ") {
		t.Errorf("cmd = %q, want prefix 'docker run '", m.cmd)
	}
}

func TestTypingAppendsToCmd(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInfo())
	m2 := send(m, "-", "-", "r", "m").(Model)
	if !strings.HasSuffix(m2.cmd, "--rm") {
		t.Errorf("cmd = %q, want suffix '--rm'", m2.cmd)
	}
}

func TestSpaceTypesSpace(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInfo())
	m2 := send(m, "a").(Model)
	m3 := sendSpecial(m2, tea.KeySpace).(Model)
	m4 := send(m3, "b").(Model)
	if !strings.HasSuffix(m4.cmd, "a b") {
		t.Errorf("cmd = %q, want suffix 'a b'", m4.cmd)
	}
}

func TestTabCompletesBoolFlag(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInfo())
	m2 := send(m, "-", "-", "r", "m").(Model)
	m3 := sendSpecial(m2, tea.KeyTab).(Model)
	if !strings.Contains(m3.cmd, "--rm ") {
		t.Errorf("cmd = %q, want '--rm ' after tab", m3.cmd)
	}
}

func TestEnterCompletesBoolFlag(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInfo())
	m2 := send(m, "-", "-", "r", "m").(Model)
	m3 := sendSpecial(m2, tea.KeyEnter).(Model)
	if !strings.Contains(m3.cmd, "--rm ") {
		t.Errorf("cmd = %q, want '--rm ' after enter", m3.cmd)
	}
}

func TestUsedFlagsExcluded(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInfo())
	m2 := send(m, "-", "-", "r", "m").(Model)
	m3 := sendSpecial(m2, tea.KeyTab).(Model)

	sugg := m3.suggestions()
	for _, s := range sugg {
		if s.Name() == "--rm" {
			t.Error("--rm should be excluded from suggestions after use")
		}
	}
}

func TestCtrlXProducesExecute(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInfo())
	m2 := sendSpecial(m, tea.KeyCtrlX).(Model)
	if !m2.done {
		t.Error("should be done")
	}
	if m2.result.Action != ActionExecute {
		t.Errorf("action = %v, want Execute", m2.result.Action)
	}
}

func TestCtrlYProducesCopy(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInfo())
	m2 := sendSpecial(m, tea.KeyCtrlY).(Model)
	if !m2.done {
		t.Error("should be done")
	}
	if m2.result.Action != ActionCopy {
		t.Errorf("action = %v, want Copy", m2.result.Action)
	}
}

func TestEscQuits(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInfo())
	m2 := sendSpecial(m, tea.KeyEsc).(Model)
	if !m2.done {
		t.Error("should be done")
	}
	if m2.result.Action != ActionQuit {
		t.Errorf("action = %v, want Quit", m2.result.Action)
	}
}

func TestBackspaceRemovesChar(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInfo())
	m2 := send(m, "a", "b", "c").(Model)
	m3 := sendSpecial(m2, tea.KeyBackspace).(Model)
	if !strings.HasSuffix(m3.cmd, "ab") {
		t.Errorf("cmd = %q, want suffix 'ab'", m3.cmd)
	}
}

func TestArrowsNavigateSuggestions(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInfo())
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
	m := New([]string{"git"}, testGitInfo())
	if m.phase != phaseSubcmd {
		t.Fatal("should start in subcmd phase")
	}
}

func TestSubcmdDrillDown(t *testing.T) {
	m := New([]string{"git"}, testGitInfo())
	m2 := sendSpecial(m, tea.KeyEnter).(Model)
	if m2.phase != phaseInput {
		t.Fatal("should be in input phase after drill-down")
	}
	if !strings.HasPrefix(m2.cmd, "git commit ") {
		t.Errorf("cmd = %q, want prefix 'git commit '", m2.cmd)
	}
}

func TestSubcmdEscQuits(t *testing.T) {
	m := New([]string{"git"}, testGitInfo())
	m2 := sendSpecial(m, tea.KeyEsc).(Model)
	if !m2.done {
		t.Error("esc in subcmd phase should quit")
	}
}

func TestSingleSubcmdSkipsPhase(t *testing.T) {
	info := helpparse.HelpInfo{
		Subcommands: []helpparse.Subcommand{
			{Name: "only", Description: "The only subcommand"},
		},
	}
	m := New([]string{"tool"}, info)
	if m.phase != phaseInput {
		t.Error("should skip subcmd phase with < 2 subcommands")
	}
}

func TestEmptyInfo(t *testing.T) {
	m := New([]string{"docker"}, helpparse.HelpInfo{})
	if strings.TrimSpace(m.cmd) != "docker" {
		t.Errorf("cmd = %q", m.cmd)
	}
}

func TestResultCommandTrimmed(t *testing.T) {
	m := New([]string{"docker", "run"}, testDockerRunInfo())
	m2 := sendSpecial(m, tea.KeyCtrlX).(Model)
	if strings.HasSuffix(m2.result.Command, " ") {
		t.Errorf("result command has trailing space: %q", m2.result.Command)
	}
}

func TestFlagsPhaseWithSubcommands(t *testing.T) {
	info := helpparse.HelpInfo{
		Flags: []helpparse.Flag{
			{Long: "--verbose", IsBool: true},
		},
		Subcommands: []helpparse.Subcommand{
			{Name: "sub1", Description: "First"},
			{Name: "sub2", Description: "Second"},
		},
	}
	m := New([]string{"tool"}, info)
	if m.phase != phaseInput {
		t.Error("should go to input phase when flags present even with subcommands")
	}
}
