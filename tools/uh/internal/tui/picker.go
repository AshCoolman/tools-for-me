package tui

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/AshCoolman/uh/internal/model"
)

const preExpandN = 3

// lines reserved for header, divider, preview, help, padding
const chromeLines = 8

type Action int

const (
	ActionExecute Action = iota
	ActionCopy
	ActionQuit
)

type Result struct {
	Command string
	Action  Action
}

type flagRow struct {
	rf          model.RankedFlag
	expanded    bool
	selected    bool
	chosenVal   int
	chosenMulti []int
}

type posRow struct {
	rp       model.Ranked
	selected bool
}

type Model struct {
	baseTokens  []string
	flags       []flagRow
	positionals []posRow
	cursor      int
	subCursor   int
	inSub       bool
	result      Result
	done        bool
	height      int
	scroll      int
}

func New(baseTokens []string, space model.OptionSpace) Model {
	m := Model{baseTokens: baseTokens, height: 24}
	for _, rf := range space.Flags {
		m.flags = append(m.flags, flagRow{rf: rf, chosenVal: -1})
	}
	for _, rp := range space.Positionals {
		m.positionals = append(m.positionals, posRow{rp: rp})
	}
	return m
}

func (m Model) Result() Result { return m.result }

func Run(baseTokens []string, space model.OptionSpace) (Result, error) {
	m := New(baseTokens, space)
	p := tea.NewProgram(m, tea.WithAltScreen())
	final, err := p.Run()
	if err != nil {
		return Result{}, err
	}
	return final.(Model).result, nil
}

var (
	dim   = lipgloss.NewStyle().Foreground(lipgloss.Color("241"))
	hi    = lipgloss.NewStyle().Foreground(lipgloss.Color("212"))
	green = lipgloss.NewStyle().Foreground(lipgloss.Color("10"))
	hdr   = lipgloss.NewStyle().Foreground(lipgloss.Color("39")).Bold(true)
	pvw   = lipgloss.NewStyle().Foreground(lipgloss.Color("229")).Bold(true)
	subHi = lipgloss.NewStyle().Foreground(lipgloss.Color("141"))
)

func (m Model) Init() tea.Cmd { return nil }

func (m Model) totalMain() int {
	return len(m.flags) + len(m.positionals)
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.height = msg.Height
		return m, nil
	case tea.KeyMsg:
		if m.inSub {
			return m.updateSub(msg)
		}
		return m.updateMain(msg)
	}
	return m, nil
}

func (m Model) updateMain(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "q", "ctrl+c":
		m.result = Result{Command: m.buildCmd(), Action: ActionQuit}
		m.done = true
		return m, tea.Quit

	case "e":
		m.result = Result{Command: m.buildCmd(), Action: ActionExecute}
		m.done = true
		return m, tea.Quit

	case "c":
		m.result = Result{Command: m.buildCmd(), Action: ActionCopy}
		m.done = true
		return m, tea.Quit

	case "up", "k":
		if m.cursor > 0 {
			m.cursor--
		}

	case "down", "j":
		if m.cursor < m.totalMain()-1 {
			m.cursor++
		}

	case " ", "x":
		if m.cursor < len(m.flags) {
			f := &m.flags[m.cursor]
			if f.rf.IsBool {
				f.selected = !f.selected
			}
		} else {
			pi := m.cursor - len(m.flags)
			m.positionals[pi].selected = !m.positionals[pi].selected
		}

	case "enter":
		if m.cursor < len(m.flags) {
			f := &m.flags[m.cursor]
			if f.rf.IsBool {
				f.selected = !f.selected
			} else if len(f.rf.Values) > 0 {
				f.expanded = true
				m.inSub = true
				m.subCursor = 0
			}
		} else {
			pi := m.cursor - len(m.flags)
			m.positionals[pi].selected = !m.positionals[pi].selected
		}
	}
	return m, nil
}

func (m Model) updateSub(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	f := &m.flags[m.cursor]

	switch msg.String() {
	case "q", "ctrl+c":
		m.result = Result{Command: m.buildCmd(), Action: ActionQuit}
		m.done = true
		return m, tea.Quit

	case "esc":
		f.expanded = false
		m.inSub = false

	case "up", "k":
		if m.subCursor > 0 {
			m.subCursor--
		}

	case "down", "j":
		if m.subCursor < len(f.rf.Values)-1 {
			m.subCursor++
		}

	case "enter", " ":
		if f.rf.Repeatable {
			if msg.String() == "enter" {
				f.expanded = false
				m.inSub = false
				if m.cursor < m.totalMain()-1 {
					m.cursor++
				}
			} else {
				m.toggleMulti(f)
			}
		} else {
			f.chosenVal = m.subCursor
			f.selected = true
			f.expanded = false
			m.inSub = false
			if m.cursor < m.totalMain()-1 {
				m.cursor++
			}
		}

	case "x":
		if f.rf.Repeatable {
			m.toggleMulti(f)
		} else {
			f.chosenVal = m.subCursor
			f.selected = true
			f.expanded = false
			m.inSub = false
			if m.cursor < m.totalMain()-1 {
				m.cursor++
			}
		}
	}
	return m, nil
}

func (m *Model) toggleMulti(f *flagRow) {
	found := -1
	for i, v := range f.chosenMulti {
		if v == m.subCursor {
			found = i
			break
		}
	}
	if found >= 0 {
		f.chosenMulti = append(f.chosenMulti[:found], f.chosenMulti[found+1:]...)
	} else {
		f.chosenMulti = append(f.chosenMulti, m.subCursor)
	}
	f.selected = len(f.chosenMulti) > 0
}

func (m Model) buildCmd() string {
	parts := append([]string{}, m.baseTokens...)
	for _, f := range m.flags {
		if !f.selected {
			continue
		}
		if f.rf.IsBool {
			parts = append(parts, f.rf.Name)
		} else if f.rf.Repeatable {
			for _, vi := range f.chosenMulti {
				if vi < len(f.rf.Values) {
					parts = append(parts, f.rf.Name, f.rf.Values[vi].Text)
				}
			}
		} else {
			if f.chosenVal >= 0 && f.chosenVal < len(f.rf.Values) {
				parts = append(parts, f.rf.Name, f.rf.Values[f.chosenVal].Text)
			}
		}
	}
	for _, p := range m.positionals {
		if p.selected {
			parts = append(parts, p.rp.Text)
		}
	}
	return strings.Join(parts, " ")
}

// line is a rendered line with a tag indicating which cursor position it belongs to
type line struct {
	text      string
	mainIdx   int // -1 if not a main row
	subIdx    int // -1 if not a sub row
}

func (m Model) buildLines() ([]line, int) {
	var lines []line
	cursorLine := 0

	for i, f := range m.flags {
		isHere := i == m.cursor && !m.inSub
		lines = append(lines, line{text: m.flagRowStr(f, isHere), mainIdx: i, subIdx: -1})

		if isHere || (i == m.cursor && m.inSub) {
			cursorLine = len(lines) - 1
		}

		if f.expanded && i == m.cursor && m.inSub {
			for si, v := range f.rf.Values {
				isSub := si == m.subCursor
				lines = append(lines, line{text: m.expandedValueStr(f, v, si, isSub), mainIdx: i, subIdx: si})
				if isSub {
					cursorLine = len(lines) - 1
				}
			}
		} else if !f.selected && !f.expanded && !f.rf.IsBool {
			for _, l := range m.preExpandedStrs(f) {
				lines = append(lines, line{text: l, mainIdx: -1, subIdx: -1})
			}
		}
	}

	lines = append(lines, line{text: dim.Render("  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄"), mainIdx: -1, subIdx: -1})

	for i, p := range m.positionals {
		idx := len(m.flags) + i
		isHere := idx == m.cursor && !m.inSub
		lines = append(lines, line{text: m.posRowStr(p, isHere), mainIdx: idx, subIdx: -1})
		if isHere {
			cursorLine = len(lines) - 1
		}
	}

	return lines, cursorLine
}

func (m Model) View() string {
	if m.done {
		if m.result.Action != ActionQuit {
			return fmt.Sprintf("\n  %s\n\n", m.result.Command)
		}
		return ""
	}

	var b strings.Builder

	// header
	total := 0
	for _, f := range m.flags {
		total += f.rf.Count
	}
	headerStr := hdr.Render(fmt.Sprintf("  uh · %s · %d invocations",
		strings.Join(m.baseTokens, " "), total))

	// build all content lines
	allLines, cursorLine := m.buildLines()

	// viewport: how many content lines fit
	visible := m.height - chromeLines
	if visible < 3 {
		visible = 3
	}

	// scroll to keep cursor visible
	scroll := m.scroll
	if cursorLine < scroll {
		scroll = cursorLine
	}
	if cursorLine >= scroll+visible {
		scroll = cursorLine - visible + 1
	}
	if scroll < 0 {
		scroll = 0
	}
	// (persist for next render via value receiver — doesn't mutate, but that's ok
	// since bubbletea re-renders from the model returned by Update)

	// render header
	b.WriteString("\n")
	b.WriteString(headerStr)

	if len(allLines) > visible {
		b.WriteString(dim.Render(fmt.Sprintf("  (%d/%d)", cursorLine+1, len(allLines))))
	}
	b.WriteString("\n\n")

	// render visible window
	end := scroll + visible
	if end > len(allLines) {
		end = len(allLines)
	}

	if scroll > 0 {
		b.WriteString(dim.Render("  ↑ more") + "\n")
	}

	for i := scroll; i < end; i++ {
		b.WriteString(allLines[i].text + "\n")
	}

	if end < len(allLines) {
		b.WriteString(dim.Render("  ↓ more") + "\n")
	}

	// preview (pinned)
	b.WriteString("\n")
	cmd := m.buildCmd()
	b.WriteString(dim.Render("  ─── preview ───────────────────────────────"))
	b.WriteString("\n")
	b.WriteString("  " + pvw.Render(cmd))
	b.WriteString("\n")

	if m.inSub {
		f := m.flags[m.cursor]
		if f.rf.Repeatable {
			b.WriteString(dim.Render("  ──── [x] toggle  [enter] keep  [esc] discard ──"))
		} else {
			b.WriteString(dim.Render("  ──── [enter] select  [esc] discard ─────────────"))
		}
	} else {
		b.WriteString(dim.Render("  ──── [enter] step in  [x] toggle  (e)xecute  (c)opy  (q)uit ──"))
	}
	b.WriteString("\n")

	return b.String()
}

func (m Model) flagRowStr(f flagRow, isHere bool) string {
	cursor := "  "
	if isHere {
		cursor = hi.Render("> ")
	}

	box := m.checkbox(f)
	label := f.rf.Name
	valStr := ""

	if !f.rf.IsBool {
		if f.selected && !f.rf.Repeatable && f.chosenVal >= 0 && f.chosenVal < len(f.rf.Values) {
			valStr = " " + f.rf.Values[f.chosenVal].Text
		} else if f.selected && f.rf.Repeatable && len(f.chosenMulti) > 0 {
			names := []string{}
			for _, vi := range f.chosenMulti {
				if vi < len(f.rf.Values) {
					names = append(names, f.rf.Values[vi].Text)
				}
			}
			valStr = " " + strings.Join(names, ", ")
		}
	}

	name := label + valStr
	if isHere {
		name = hi.Render(label + valStr)
	}

	count := dim.Render(fmt.Sprintf(" (%d×)", f.rf.Count))
	return fmt.Sprintf("  %s%s %s%s", cursor, box, name, count)
}

func (m Model) checkbox(f flagRow) string {
	if f.expanded {
		return dim.Render("[-]")
	}
	if f.selected {
		return green.Render("[x]")
	}
	return dim.Render("[ ]")
}

func (m Model) preExpandedStrs(f flagRow) []string {
	var out []string
	n := preExpandN
	if n > len(f.rf.Values) {
		n = len(f.rf.Values)
	}
	for i := 0; i < n; i++ {
		v := f.rf.Values[i]
		out = append(out, dim.Render(fmt.Sprintf("       %s (%d×)", v.Text, v.Count)))
	}
	if len(f.rf.Values) > n {
		out = append(out, dim.Render(fmt.Sprintf("       +%d more", len(f.rf.Values)-n)))
	}
	return out
}

func (m Model) expandedValueStr(f flagRow, v model.Ranked, idx int, isHere bool) string {
	cursor := "       "
	if isHere {
		cursor = "     " + subHi.Render("> ")
	}

	box := dim.Render("[ ]")
	if f.rf.Repeatable {
		for _, vi := range f.chosenMulti {
			if vi == idx {
				box = green.Render("[x]")
				break
			}
		}
	}

	text := v.Text
	if isHere {
		text = subHi.Render(text)
	}
	count := dim.Render(fmt.Sprintf(" (%d×)", v.Count))
	return fmt.Sprintf("%s%s %s%s", cursor, box, text, count)
}

func (m Model) posRowStr(p posRow, isHere bool) string {
	cursor := "  "
	if isHere {
		cursor = hi.Render("> ")
	}
	box := dim.Render("[ ]")
	if p.selected {
		box = green.Render("[x]")
	}
	name := p.rp.Text
	if isHere {
		name = hi.Render(name)
	}
	count := dim.Render(fmt.Sprintf(" (%d×)", p.rp.Count))
	return fmt.Sprintf("  %s%s %s%s", cursor, box, name, count)
}
