package tui

import (
	"testing"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/AshCoolman/uh/internal/model"
)

func testSpace() model.OptionSpace {
	return model.OptionSpace{
		Flags: []model.RankedFlag{
			{Name: "--rm", Count: 10, IsBool: true},
			{Name: "-it", Count: 8, IsBool: true},
			{Name: "-v", Count: 6, Values: []model.Ranked{
				{Text: "$(pwd):/app", Count: 4},
				{Text: "~/.config:/config", Count: 2},
			}},
			{Name: "-p", Count: 5, Repeatable: true, Values: []model.Ranked{
				{Text: "3000:3000", Count: 3},
				{Text: "8080:80", Count: 2},
			}},
		},
		Positionals: []model.Ranked{
			{Text: "node:18", Count: 7},
			{Text: "postgres:15", Count: 3},
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

func TestToggleBoolFlag(t *testing.T) {
	m := New([]string{"docker", "run"}, testSpace())

	// cursor starts at 0 (--rm), toggle with x
	m2 := send(m, "x").(Model)
	if !m2.flags[0].selected {
		t.Error("--rm should be selected after x")
	}
	cmd := m2.buildCmd()
	if cmd != "docker run --rm" {
		t.Errorf("cmd = %q", cmd)
	}

	// toggle off
	m3 := send(m2, "x").(Model)
	if m3.flags[0].selected {
		t.Error("--rm should be deselected after second x")
	}
}

func TestStepIntoValueFlag(t *testing.T) {
	m := New([]string{"docker", "run"}, testSpace())

	// move to -v (index 2)
	m2 := send(m, "j", "j").(Model)
	if m2.cursor != 2 {
		t.Fatalf("cursor = %d, want 2", m2.cursor)
	}

	// enter to step in
	m3 := send(m2, "enter").(Model)
	if !m3.inSub {
		t.Fatal("should be in sub after enter")
	}
	if !m3.flags[2].expanded {
		t.Fatal("-v should be expanded")
	}

	// enter to select first value
	m4 := send(m3, "enter").(Model)
	if m4.inSub {
		t.Error("should have stepped out")
	}
	if !m4.flags[2].selected {
		t.Error("-v should be selected")
	}
	if m4.flags[2].chosenVal != 0 {
		t.Errorf("chosenVal = %d, want 0", m4.flags[2].chosenVal)
	}
	cmd := m4.buildCmd()
	if cmd != "docker run -v $(pwd):/app" {
		t.Errorf("cmd = %q", cmd)
	}
}

func TestEscDiscardsSubSelection(t *testing.T) {
	m := New([]string{"docker", "run"}, testSpace())

	// move to -v, step in, esc out
	m2 := send(m, "j", "j", "enter").(Model)
	m3 := sendSpecial(m2, tea.KeyEsc).(Model)

	if m3.inSub {
		t.Error("should have stepped out")
	}
	if m3.flags[2].selected {
		t.Error("-v should not be selected after esc")
	}
}

func TestRepeatableToggle(t *testing.T) {
	m := New([]string{"docker", "run"}, testSpace())

	// move to -p (index 3), step in
	m2 := send(m, "j", "j", "j", "enter").(Model)
	if !m2.inSub {
		t.Fatal("should be in sub")
	}

	// toggle first value with space
	m3 := send(m2, " ").(Model)
	if len(m3.flags[3].chosenMulti) != 1 {
		t.Fatalf("chosenMulti = %v", m3.flags[3].chosenMulti)
	}

	// toggle second value
	m4 := send(m3, "j", " ").(Model)
	if len(m4.flags[3].chosenMulti) != 2 {
		t.Fatalf("chosenMulti = %v", m4.flags[3].chosenMulti)
	}

	// enter to keep and step out
	m5 := send(m4, "enter").(Model)
	if m5.inSub {
		t.Error("should have stepped out")
	}

	cmd := m5.buildCmd()
	if cmd != "docker run -p 3000:3000 -p 8080:80" {
		t.Errorf("cmd = %q", cmd)
	}
}

func TestPositionalToggle(t *testing.T) {
	m := New([]string{"docker", "run"}, testSpace())

	// move past flags to first positional (index 4)
	m2 := send(m, "j", "j", "j", "j", "x").(Model)
	if !m2.positionals[0].selected {
		t.Error("node:18 should be selected")
	}
	cmd := m2.buildCmd()
	if cmd != "docker run node:18" {
		t.Errorf("cmd = %q", cmd)
	}
}

func TestFullBuild(t *testing.T) {
	m := New([]string{"docker", "run"}, testSpace())

	// --rm on, -it on, -v=$(pwd):/app, positional=node:18
	m2 := send(m,
		"x",           // toggle --rm
		"j", "x",      // toggle -it
		"j", "enter",  // step into -v
		"enter",       // select $(pwd):/app
		// cursor auto-advanced to -p, skip it
		"j",           // move to node:18
		"x",           // toggle
	).(Model)

	cmd := m2.buildCmd()
	want := "docker run --rm -it -v $(pwd):/app node:18"
	if cmd != want {
		t.Errorf("cmd = %q, want %q", cmd, want)
	}
}

func TestExecuteAction(t *testing.T) {
	m := New([]string{"docker", "run"}, testSpace())
	m2 := send(m, "x", "e").(Model)
	if !m2.done {
		t.Error("should be done")
	}
	if m2.result.Action != ActionExecute {
		t.Errorf("action = %v, want Execute", m2.result.Action)
	}
	if m2.result.Command != "docker run --rm" {
		t.Errorf("cmd = %q", m2.result.Command)
	}
}

func TestCopyAction(t *testing.T) {
	m := New([]string{"docker", "run"}, testSpace())
	m2 := send(m, "x", "c").(Model)
	if m2.result.Action != ActionCopy {
		t.Errorf("action = %v, want Copy", m2.result.Action)
	}
}

func TestEmptySpace(t *testing.T) {
	m := New([]string{"docker"}, model.OptionSpace{})
	cmd := m.buildCmd()
	if cmd != "docker" {
		t.Errorf("cmd = %q", cmd)
	}
}
