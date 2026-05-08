package tui

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/AshCoolman/uh/internal/model"
)

const preExpandN = 3

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
	baseTokens []string
	flags      []flagRow
	positionals []posRow
	cursor     int
	subCursor  int
	inSub      bool
	result     Result
	done       bool
}

func New(baseTokens []string, space model.OptionSpace) Model {
	m := Model{baseTokens: baseTokens}
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
	dim    = lipgloss.NewStyle().Foreground(lipgloss.Color("241"))
	hi     = lipgloss.NewStyle().Foreground(lipgloss.Color("212"))
	green  = lipgloss.NewStyle().Foreground(lipgloss.Color("10"))
	hdr    = lipgloss.NewStyle().Foreground(lipgloss.Color("39")).Bold(true)
	pvw    = lipgloss.NewStyle().Foreground(lipgloss.Color("229")).Bold(true)
	subHi  = lipgloss.NewStyle().Foreground(lipgloss.Color("141"))
)

func (m Model) Init() tea.Cmd { return nil }

func (m Model) totalMain() int {
	return len(m.flags) + len(m.positionals)
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
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

func (m Model) View() string {
	if m.done {
		if m.result.Action != ActionQuit {
			return fmt.Sprintf("\n  %s\n\n", m.result.Command)
		}
		return ""
	}

	var b strings.Builder
	b.WriteString("\n")

	total := 0
	for _, f := range m.flags {
		total += f.rf.Count
	}
	b.WriteString(hdr.Render(fmt.Sprintf("  uh · %s · %d invocations",
		strings.Join(m.baseTokens, " "), total)))
	b.WriteString("\n\n")

	for i, f := range m.flags {
		isHere := i == m.cursor && !m.inSub
		m.renderFlagRow(&b, f, isHere)

		if f.expanded && i == m.cursor && m.inSub {
			m.renderExpandedValues(&b, f)
		} else if !f.selected && !f.expanded && !f.rf.IsBool {
			m.renderPreExpanded(&b, f)
		}
	}

	b.WriteString(dim.Render("  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄"))
	b.WriteString("\n")

	for i, p := range m.positionals {
		idx := len(m.flags) + i
		isHere := idx == m.cursor && !m.inSub
		m.renderPosRow(&b, p, isHere)
	}

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

func (m Model) renderFlagRow(b *strings.Builder, f flagRow, isHere bool) {
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
	b.WriteString(fmt.Sprintf("  %s%s %s%s\n", cursor, box, name, count))
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

func (m Model) renderPreExpanded(b *strings.Builder, f flagRow) {
	n := preExpandN
	if n > len(f.rf.Values) {
		n = len(f.rf.Values)
	}
	for i := 0; i < n; i++ {
		v := f.rf.Values[i]
		text := dim.Render(fmt.Sprintf("       %s (%d×)", v.Text, v.Count))
		b.WriteString(text + "\n")
	}
	if len(f.rf.Values) > n {
		b.WriteString(dim.Render(fmt.Sprintf("       +%d more", len(f.rf.Values)-n)) + "\n")
	}
}

func (m Model) renderExpandedValues(b *strings.Builder, f flagRow) {
	for i, v := range f.rf.Values {
		isHere := i == m.subCursor

		cursor := "       "
		if isHere {
			cursor = "     " + subHi.Render("> ")
		}

		box := dim.Render("[ ]")
		if f.rf.Repeatable {
			for _, vi := range f.chosenMulti {
				if vi == i {
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
		b.WriteString(fmt.Sprintf("%s%s %s%s\n", cursor, box, text, count))
	}
}

func (m Model) renderPosRow(b *strings.Builder, p posRow, isHere bool) {
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
	b.WriteString(fmt.Sprintf("  %s%s %s%s\n", cursor, box, name, count))
}
