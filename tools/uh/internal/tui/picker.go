package tui

import (
	"fmt"
	"os"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/AshCoolman/uh/internal/model"
	"github.com/AshCoolman/uh/internal/parser"
)

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
	customVal   string
}

type posRow struct {
	rp       model.Ranked
	selected bool
}

type phase int

const (
	phaseSubcmd phase = iota
	phaseFlags
)

type Model struct {
	baseTokens  []string
	invocations []parser.Invocation

	phase           phase
	subcmds         []model.Ranked
	subcmdIdx       int
	origBaseTokens  []string
	origInvocations []parser.Invocation

	space       model.OptionSpace
	flags       []flagRow
	positionals []posRow
	cursor      int
	subCursor   int
	inSub       bool
	typing      bool
	editingCmd  bool
	input       string

	result Result
	done   bool
	height int
	scroll int
}

func New(baseTokens []string, invocations []parser.Invocation) Model {
	m := Model{
		baseTokens:  baseTokens,
		invocations: invocations,
		height:      24,
	}

	subcmds := model.Subcommands(invocations)

	// show subcmd picker when there are multiple distinct first-positionals
	// that each appear more than once (filters out noise like image names)
	repeatedSubcmds := 0
	for _, sc := range subcmds {
		if sc.Count >= 2 {
			repeatedSubcmds++
		}
	}
	if repeatedSubcmds >= 2 {
		m.phase = phaseSubcmd
		m.subcmds = subcmds
		m.origBaseTokens = append([]string{}, baseTokens...)
		m.origInvocations = invocations
	} else {
		m.phase = phaseFlags
		m.buildFlagView(invocations)
	}

	return m
}

func (m *Model) buildFlagView(invocations []parser.Invocation) {
	space := model.Build(invocations)
	m.space = space
	m.flags = nil
	m.positionals = nil
	m.cursor = 0
	m.subCursor = 0
	m.inSub = false
	m.typing = false
	m.editingCmd = false
	m.input = ""
	m.scroll = 0

	for _, rf := range space.Flags {
		m.flags = append(m.flags, flagRow{rf: rf, chosenVal: -1})
	}
	for _, rp := range space.Positionals {
		m.positionals = append(m.positionals, posRow{rp: rp})
	}
}

func (m Model) Result() Result { return m.result }

func Run(baseTokens []string, invocations []parser.Invocation) (Result, error) {
	m := New(baseTokens, invocations)
	p := tea.NewProgram(m, tea.WithAltScreen(), tea.WithOutput(os.Stderr))
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
		if m.typing {
			return m.updateTyping(msg)
		}
		if m.phase == phaseSubcmd {
			return m.updateSubcmd(msg)
		}
		if m.inSub {
			return m.updateSub(msg)
		}
		return m.updateMain(msg)
	}
	return m, nil
}

// subcmd phase: pick a subcommand to drill into
func (m Model) updateSubcmd(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "q", "ctrl+c":
		m.result = Result{Command: m.buildCmd(), Action: ActionQuit}
		m.done = true
		return m, tea.Quit

	case "up", "k":
		if m.subcmdIdx > 0 {
			m.subcmdIdx--
		}

	case "down", "j":
		if m.subcmdIdx < len(m.subcmds)-1 {
			m.subcmdIdx++
		}

	case "enter", " ":
		sub := m.subcmds[m.subcmdIdx].Text
		m.baseTokens = append(m.baseTokens, sub)
		filtered := model.FilterByFirstPositional(m.invocations, sub)
		m.invocations = filtered
		m.phase = phaseFlags
		m.buildFlagView(filtered)
	}
	return m, nil
}

func (m Model) updateMain(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "q", "ctrl+c":
		m.result = Result{Command: m.buildCmd(), Action: ActionQuit}
		m.done = true
		return m, tea.Quit

	case "esc":
		if m.origBaseTokens != nil {
			m.baseTokens = m.origBaseTokens
			m.invocations = m.origInvocations
			m.phase = phaseSubcmd
			m.origBaseTokens = nil
			m.origInvocations = nil
			m.flags = nil
			m.positionals = nil
			m.cursor = 0
			m.subCursor = 0
			m.inSub = false
			m.typing = false
			m.scroll = 0
		}

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
			f.selected = !f.selected
			if !f.selected {
				f.chosenVal = -1
				f.chosenMulti = nil
				f.customVal = ""
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

	case "i":
		m.editingCmd = true
		m.typing = true
		m.input = m.buildCmd()
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

	case "i":
		m.typing = true
		m.input = ""
	}
	return m, nil
}

func (m Model) updateTyping(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.Type {
	case tea.KeyEsc:
		m.typing = false
		m.editingCmd = false
		m.input = ""
	case tea.KeyEnter:
		if m.editingCmd {
			if m.input != "" {
				m.result = Result{Command: m.input, Action: ActionCopy}
				m.done = true
				return m, tea.Quit
			}
		} else if m.input != "" && m.cursor < len(m.flags) {
			f := &m.flags[m.cursor]
			f.customVal = m.input
			f.selected = true
			f.chosenVal = -1
			f.expanded = false
			m.inSub = false
			if m.cursor < m.totalMain()-1 {
				m.cursor++
			}
		}
		m.typing = false
		m.editingCmd = false
		m.input = ""
	case tea.KeyBackspace:
		if len(m.input) > 0 {
			m.input = m.input[:len(m.input)-1]
		}
	case tea.KeySpace:
		m.input += " "
	default:
		if msg.Type == tea.KeyRunes {
			m.input += string(msg.Runes)
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
			if len(f.chosenMulti) > 0 {
				for _, vi := range f.chosenMulti {
					if vi < len(f.rf.Values) {
						parts = append(parts, f.rf.Name, f.rf.Values[vi].Text)
					}
				}
			} else {
				parts = append(parts, f.rf.Name)
			}
		} else {
			if f.customVal != "" {
				parts = append(parts, f.rf.Name, f.customVal)
			} else if f.chosenVal >= 0 && f.chosenVal < len(f.rf.Values) {
				parts = append(parts, f.rf.Name, f.rf.Values[f.chosenVal].Text)
			} else {
				parts = append(parts, f.rf.Name)
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

type line struct {
	text    string
	mainIdx int
	subIdx  int
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
		}

		// show typing input inline when in insert mode on this flag
		if i == m.cursor && m.typing && !m.editingCmd {
			inputLine := fmt.Sprintf("       %s %s█",
				subHi.Render("|"), subHi.Render(m.input))
			lines = append(lines, line{text: inputLine, mainIdx: -1, subIdx: -1})
			cursorLine = len(lines) - 1
		}
	}

	if len(m.positionals) > 0 {
		lines = append(lines, line{text: dim.Render("  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄"), mainIdx: -1, subIdx: -1})

		for i, p := range m.positionals {
			idx := len(m.flags) + i
			isHere := idx == m.cursor && !m.inSub
			lines = append(lines, line{text: m.posRowStr(p, isHere), mainIdx: idx, subIdx: -1})
			if isHere {
				cursorLine = len(lines) - 1
			}
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

	if m.phase == phaseSubcmd {
		return m.viewSubcmd()
	}
	return m.viewFlags()
}

func (m Model) viewSubcmd() string {
	var b strings.Builder
	b.WriteString("\n")

	total := len(m.invocations)
	b.WriteString(hdr.Render(fmt.Sprintf("  uh · %s · %d invocations",
		strings.Join(m.baseTokens, " "), total)))
	b.WriteString("\n\n")

	visible := m.height - chromeLines
	if visible < 3 {
		visible = 3
	}

	scroll := m.scroll
	if m.subcmdIdx < scroll {
		scroll = m.subcmdIdx
	}
	if m.subcmdIdx >= scroll+visible {
		scroll = m.subcmdIdx - visible + 1
	}

	if len(m.subcmds) > visible {
		b.WriteString(hdr.Render(fmt.Sprintf("  (%d/%d)", m.subcmdIdx+1, len(m.subcmds))))
		b.WriteString("\n")
	}

	if scroll > 0 {
		b.WriteString(dim.Render("  ↑ more") + "\n")
	}

	end := scroll + visible
	if end > len(m.subcmds) {
		end = len(m.subcmds)
	}

	for i := scroll; i < end; i++ {
		sc := m.subcmds[i]
		isHere := i == m.subcmdIdx
		cursor := "  "
		if isHere {
			cursor = hi.Render("> ")
		}
		name := sc.Text
		if isHere {
			name = hi.Render(name)
		}
		count := dim.Render(fmt.Sprintf(" (%d×)", sc.Count))
		b.WriteString(fmt.Sprintf("  %s  %s%s\n", cursor, name, count))
	}

	if end < len(m.subcmds) {
		b.WriteString(dim.Render("  ↓ more") + "\n")
	}

	b.WriteString("\n")
	b.WriteString(dim.Render("  ─── preview ───────────────────────────────"))
	b.WriteString("\n")
	base := strings.Join(m.baseTokens, " ")
	if m.subcmdIdx < len(m.subcmds) {
		base += " " + m.subcmds[m.subcmdIdx].Text
	}
	b.WriteString("  " + pvw.Render(base+" ..."))
	b.WriteString("\n")
	b.WriteString(dim.Render("  ──── [enter] drill in  (q)uit ──────────────"))
	b.WriteString("\n")

	return b.String()
}

func (m Model) viewFlags() string {
	var b strings.Builder
	b.WriteString("\n")

	total := len(m.invocations)
	b.WriteString(hdr.Render(fmt.Sprintf("  uh · %s · %d invocations",
		strings.Join(m.baseTokens, " "), total)))

	allLines, cursorLine := m.buildLines()

	visible := m.height - chromeLines
	if visible < 3 {
		visible = 3
	}

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

	if len(allLines) > visible {
		b.WriteString(dim.Render(fmt.Sprintf("  (%d/%d)", cursorLine+1, len(allLines))))
	}
	b.WriteString("\n\n")

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

	b.WriteString("\n")
	b.WriteString(dim.Render("  ─── preview ───────────────────────────────"))
	b.WriteString("\n")
	if m.editingCmd {
		b.WriteString("  " + pvw.Render(m.input+"█"))
	} else {
		cmd := m.buildCmd()
		b.WriteString("  " + pvw.Render(cmd))
	}
	b.WriteString("\n")

	if m.editingCmd {
		b.WriteString(dim.Render("  ──── editing command  [enter] copy  [esc] cancel ──"))
	} else if m.typing {
		b.WriteString(dim.Render("  ──── type a value  [enter] confirm  [esc] cancel ──"))
	} else if m.inSub {
		f := m.flags[m.cursor]
		if f.rf.Repeatable {
			b.WriteString(dim.Render("  ──── [x] toggle  [enter] keep  [esc] discard  (i) type ──"))
		} else {
			b.WriteString(dim.Render("  ──── [enter] select  [esc] discard  (i) type ──"))
		}
	} else if m.origBaseTokens != nil {
		b.WriteString(dim.Render("  ──── [esc] back  [enter] step in  [x] toggle  (i) type  (e)xecute  (c)opy  (q)uit ──"))
	} else {
		b.WriteString(dim.Render("  ──── [enter] step in  [x] toggle  (i) type  (e)xecute  (c)opy  (q)uit ──"))
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
		if f.selected && f.customVal != "" {
			valStr = " " + f.customVal
		} else if f.selected && !f.rf.Repeatable && f.chosenVal >= 0 && f.chosenVal < len(f.rf.Values) {
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
