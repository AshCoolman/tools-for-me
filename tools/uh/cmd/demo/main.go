package main

import (
	"fmt"
	"os"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type flagKind int

const (
	boolFlag flagKind = iota
	valueFlag
	repeatableFlag
)

type row struct {
	name        string
	kind        flagKind
	count       int
	values      []valRow
	expanded    bool
	selected    bool
	chosenVal   int
	chosenMulti []int
}

type valRow struct {
	text  string
	count int
}

type positional struct {
	text     string
	count    int
	selected bool
}

const preExpandN = 3

type model struct {
	base        string
	sub         string
	rows        []row
	positionals []positional
	cursor      int
	subCursor   int
	inSub       bool
	result      string
	done        bool
}

func mockData() model {
	return model{
		base: "docker",
		sub:  "run",
		rows: []row{
			{name: "--rm", kind: boolFlag, count: 20, chosenVal: -1},
			{name: "-it", kind: boolFlag, count: 18, chosenVal: -1},
			{name: "-d", kind: boolFlag, count: 7, chosenVal: -1},
			{name: "-t", kind: valueFlag, count: 14, chosenVal: -1, values: []valRow{
				{"my-app-1", 9},
				{"my-app-2", 5},
				{"worker-3", 2},
			}},
			{name: "-v", kind: valueFlag, count: 14, chosenVal: -1, values: []valRow{
				{"$(pwd):/app", 9},
				{"~/.config:/config", 5},
				{"/var/log:/logs", 2},
			}},
			{name: "--network", kind: valueFlag, count: 3, chosenVal: -1, values: []valRow{
				{"host", 2},
				{"bridge", 1},
			}},
			{name: "-p", kind: repeatableFlag, count: 10, chosenVal: -1, values: []valRow{
				{"3000:3000", 6},
				{"8080:80", 4},
				{"5432:5432", 3},
			}},
			{name: "-e", kind: repeatableFlag, count: 8, chosenVal: -1, values: []valRow{
				{"NODE_ENV=production", 5},
				{"DEBUG=true", 3},
				{"PORT=3000", 2},
			}},
		},
		positionals: []positional{
			{"node:18-alpine", 11, false},
			{"postgres:15", 6, false},
			{"nginx:latest", 3, false},
		},
	}
}

var (
	dim     = lipgloss.NewStyle().Foreground(lipgloss.Color("241"))
	hi      = lipgloss.NewStyle().Foreground(lipgloss.Color("212"))
	green   = lipgloss.NewStyle().Foreground(lipgloss.Color("10"))
	header  = lipgloss.NewStyle().Foreground(lipgloss.Color("39")).Bold(true)
	pvw     = lipgloss.NewStyle().Foreground(lipgloss.Color("229")).Bold(true)
	subHi   = lipgloss.NewStyle().Foreground(lipgloss.Color("141"))
)

func (m model) Init() tea.Cmd { return nil }

func (m model) totalMain() int {
	return len(m.rows) + len(m.positionals)
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		if m.inSub {
			return m.updateSub(msg)
		}
		return m.updateMain(msg)
	}
	return m, nil
}

// root level: enter=step-in, x/space=toggle bool, e=execute, c=copy, q=quit
func (m model) updateMain(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "q", "ctrl+c":
		m.done = true
		return m, tea.Quit

	case "e":
		m.result = m.buildCmd()
		m.done = true
		return m, tea.Quit

	case "c":
		m.result = m.buildCmd()
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
		if m.cursor < len(m.rows) {
			r := &m.rows[m.cursor]
			if r.kind == boolFlag {
				r.selected = !r.selected
			}
		} else {
			pi := m.cursor - len(m.rows)
			m.positionals[pi].selected = !m.positionals[pi].selected
		}

	case "enter":
		if m.cursor < len(m.rows) {
			r := &m.rows[m.cursor]
			if r.kind == boolFlag {
				r.selected = !r.selected
			} else {
				if r.selected {
					// re-enter to change value
					r.expanded = true
					m.inSub = true
					m.subCursor = 0
				} else {
					r.expanded = true
					m.inSub = true
					m.subCursor = 0
				}
			}
		} else {
			pi := m.cursor - len(m.rows)
			m.positionals[pi].selected = !m.positionals[pi].selected
		}
	}
	return m, nil
}

// sub level: enter=store-and-step-out, esc=discard-and-step-out, x=toggle (repeatable)
func (m model) updateSub(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	r := &m.rows[m.cursor]

	switch msg.String() {
	case "q", "ctrl+c":
		m.done = true
		return m, tea.Quit

	case "esc":
		// discard and back out
		r.expanded = false
		m.inSub = false

	case "up", "k":
		if m.subCursor > 0 {
			m.subCursor--
		}

	case "down", "j":
		if m.subCursor < len(r.values)-1 {
			m.subCursor++
		}

	case "enter", " ":
		if r.kind == repeatableFlag {
			// enter on repeatable = store current toggles and step out
			if msg.String() == "enter" {
				r.expanded = false
				m.inSub = false
				if m.cursor < m.totalMain()-1 {
					m.cursor++
				}
			} else {
				m.toggleMulti(r)
			}
		} else {
			// single-value: pick and step out
			r.chosenVal = m.subCursor
			r.selected = true
			r.expanded = false
			m.inSub = false
			if m.cursor < m.totalMain()-1 {
				m.cursor++
			}
		}

	case "x":
		if r.kind == repeatableFlag {
			m.toggleMulti(r)
		} else {
			// single-value: same as enter
			r.chosenVal = m.subCursor
			r.selected = true
			r.expanded = false
			m.inSub = false
			if m.cursor < m.totalMain()-1 {
				m.cursor++
			}
		}
	}
	return m, nil
}

func (m *model) toggleMulti(r *row) {
	found := -1
	for i, v := range r.chosenMulti {
		if v == m.subCursor {
			found = i
			break
		}
	}
	if found >= 0 {
		r.chosenMulti = append(r.chosenMulti[:found], r.chosenMulti[found+1:]...)
	} else {
		r.chosenMulti = append(r.chosenMulti, m.subCursor)
	}
	r.selected = len(r.chosenMulti) > 0
}

func (m model) buildCmd() string {
	parts := []string{m.base, m.sub}
	for _, r := range m.rows {
		if !r.selected {
			continue
		}
		switch r.kind {
		case boolFlag:
			parts = append(parts, r.name)
		case valueFlag:
			if r.chosenVal >= 0 && r.chosenVal < len(r.values) {
				parts = append(parts, r.name, r.values[r.chosenVal].text)
			}
		case repeatableFlag:
			for _, vi := range r.chosenMulti {
				if vi < len(r.values) {
					parts = append(parts, r.name, r.values[vi].text)
				}
			}
		}
	}
	for _, p := range m.positionals {
		if p.selected {
			parts = append(parts, p.text)
		}
	}
	return strings.Join(parts, " ")
}

func (m model) View() string {
	if m.done {
		if m.result != "" {
			return fmt.Sprintf("\n  %s\n\n", m.result)
		}
		return ""
	}

	var b strings.Builder
	b.WriteString("\n")
	b.WriteString(header.Render(fmt.Sprintf("  uh · unwrap history · %s %s", m.base, m.sub)))
	b.WriteString("\n\n")

	for i, r := range m.rows {
		isHere := i == m.cursor && !m.inSub
		m.renderRow(&b, r, isHere)

		if r.expanded && i == m.cursor && m.inSub {
			m.renderExpandedValues(&b, r)
		} else if !r.selected && !r.expanded && r.kind != boolFlag {
			m.renderPreExpanded(&b, r)
		}
	}

	b.WriteString(dim.Render("  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄"))
	b.WriteString("\n")

	for i, p := range m.positionals {
		idx := len(m.rows) + i
		isHere := idx == m.cursor && !m.inSub
		m.renderPositional(&b, p, isHere)
	}

	b.WriteString("\n")
	cmd := m.buildCmd()
	b.WriteString(dim.Render("  ─── preview ───────────────────────────────"))
	b.WriteString("\n")
	b.WriteString("  " + pvw.Render(cmd))
	b.WriteString("\n")

	if m.inSub {
		r := m.rows[m.cursor]
		if r.kind == repeatableFlag {
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

func (m model) renderRow(b *strings.Builder, r row, isHere bool) {
	cursor := "  "
	if isHere {
		cursor = hi.Render("> ")
	}

	box := m.checkbox(r)

	label := r.name
	valStr := ""

	switch r.kind {
	case boolFlag:
		// just the name
	case valueFlag:
		if r.selected && r.chosenVal >= 0 && r.chosenVal < len(r.values) {
			valStr = " " + r.values[r.chosenVal].text
		}
	case repeatableFlag:
		if r.selected && len(r.chosenMulti) > 0 {
			names := []string{}
			for _, vi := range r.chosenMulti {
				if vi < len(r.values) {
					names = append(names, r.values[vi].text)
				}
			}
			valStr = " " + strings.Join(names, ", ")
		}
	}

	name := label + valStr
	if isHere {
		name = hi.Render(label + valStr)
	}

	count := dim.Render(fmt.Sprintf(" (%d×)", r.count))
	b.WriteString(fmt.Sprintf("  %s%s %s%s\n", cursor, box, name, count))
}

// show top N values as a dim preview when not expanded and not selected
func (m model) renderPreExpanded(b *strings.Builder, r row) {
	n := preExpandN
	if n > len(r.values) {
		n = len(r.values)
	}
	for i := 0; i < n; i++ {
		v := r.values[i]
		text := dim.Render(fmt.Sprintf("       %s (%d×)", v.text, v.count))
		b.WriteString(text + "\n")
	}
	if len(r.values) > n {
		b.WriteString(dim.Render(fmt.Sprintf("       +%d more", len(r.values)-n)) + "\n")
	}
}

func (m model) renderExpandedValues(b *strings.Builder, r row) {
	for i, v := range r.values {
		isHere := i == m.subCursor

		cursor := "       "
		if isHere {
			cursor = "     " + subHi.Render("> ")
		}

		box := dim.Render("[ ]")
		if r.kind == repeatableFlag {
			for _, vi := range r.chosenMulti {
				if vi == i {
					box = green.Render("[x]")
					break
				}
			}
		}

		text := v.text
		if isHere {
			text = subHi.Render(text)
		}
		count := dim.Render(fmt.Sprintf(" (%d×)", v.count))
		b.WriteString(fmt.Sprintf("%s%s %s%s\n", cursor, box, text, count))
	}
}

func (m model) checkbox(r row) string {
	if r.expanded {
		return dim.Render("[-]")
	}
	if r.selected {
		return green.Render("[x]")
	}
	return dim.Render("[ ]")
}

func (m model) renderPositional(b *strings.Builder, p positional, isHere bool) {
	cursor := "  "
	if isHere {
		cursor = hi.Render("> ")
	}
	box := dim.Render("[ ]")
	if p.selected {
		box = green.Render("[x]")
	}
	name := p.text
	if isHere {
		name = hi.Render(name)
	}
	count := dim.Render(fmt.Sprintf(" (%d×)", p.count))
	b.WriteString(fmt.Sprintf("  %s%s %s%s\n", cursor, box, name, count))
}

func main() {
	p := tea.NewProgram(mockData(), tea.WithAltScreen(), tea.WithOutput(os.Stderr))
	result, err := p.Run()
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	if final := result.(model); final.result != "" {
		fmt.Println(final.result)
	}
}
