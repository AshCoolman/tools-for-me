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

type phase int

const (
	phaseSubcmd phase = iota
	phaseInput
)

type Model struct {
	baseTokens  []string
	invocations []parser.Invocation
	space       model.OptionSpace

	phase     phase
	subcmds   []model.Ranked
	subcmdIdx int

	cmd        string
	cursor     int
	showValues int
	valCursor  int

	result Result
	done   bool
	height int
}

func New(baseTokens []string, invocations []parser.Invocation) Model {
	m := Model{
		baseTokens:  baseTokens,
		invocations: invocations,
		showValues:  -1,
		height:      24,
	}

	subcmds := model.Subcommands(invocations)

	repeatedSubcmds := 0
	for _, sc := range subcmds {
		if sc.Count >= 2 {
			repeatedSubcmds++
		}
	}
	if repeatedSubcmds >= 2 {
		m.phase = phaseSubcmd
		m.subcmds = subcmds
	} else {
		m.phase = phaseInput
		m.space = model.Build(invocations)
		m.cmd = strings.Join(baseTokens, " ") + " "
	}

	return m
}

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
	dim     = lipgloss.NewStyle().Foreground(lipgloss.Color("241"))
	hi      = lipgloss.NewStyle().Foreground(lipgloss.Color("212"))
	green   = lipgloss.NewStyle().Foreground(lipgloss.Color("10"))
	hdr     = lipgloss.NewStyle().Foreground(lipgloss.Color("39")).Bold(true)
	pvw     = lipgloss.NewStyle().Foreground(lipgloss.Color("229")).Bold(true)
	matchSt = lipgloss.NewStyle().Foreground(lipgloss.Color("141"))
)

func (m Model) Init() tea.Cmd { return nil }

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.height = msg.Height
		return m, nil
	case tea.KeyMsg:
		if m.phase == phaseSubcmd {
			return m.updateSubcmd(msg)
		}
		if m.showValues >= 0 {
			return m.updateValues(msg)
		}
		return m.updateInput(msg)
	}
	return m, nil
}

func (m Model) updateSubcmd(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc", "ctrl+c":
		m.result = Result{Action: ActionQuit}
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
		newBase := append(append([]string{}, m.baseTokens...), sub)
		filtered := model.FilterByFirstPositional(m.invocations, sub)
		m.baseTokens = newBase
		m.invocations = filtered
		m.space = model.Build(filtered)
		m.phase = phaseInput
		m.cmd = strings.Join(newBase, " ") + " "
		m.cursor = 0
		m.showValues = -1
	}
	return m, nil
}

func (m Model) updateInput(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	sugg := m.suggestions()

	switch msg.Type {
	case tea.KeyCtrlX:
		m.result = Result{Command: strings.TrimSpace(m.cmd), Action: ActionExecute}
		m.done = true
		return m, tea.Quit

	case tea.KeyCtrlY:
		m.result = Result{Command: strings.TrimSpace(m.cmd), Action: ActionCopy}
		m.done = true
		return m, tea.Quit

	case tea.KeyEsc, tea.KeyCtrlC:
		m.result = Result{Action: ActionQuit}
		m.done = true
		return m, tea.Quit

	case tea.KeyTab, tea.KeyEnter:
		if len(sugg) > 0 && m.cursor < len(sugg) {
			opt := sugg[m.cursor]
			m.cmd = replacePartial(m.cmd, opt.Name)
			if !opt.IsBool && len(opt.Values) > 0 {
				m.showValues = m.cursor
				m.valCursor = 0
			} else {
				m.cmd += " "
			}
			m.cursor = 0
		}

	case tea.KeyDown:
		if m.cursor < len(sugg)-1 {
			m.cursor++
		}
	case tea.KeyUp:
		if m.cursor > 0 {
			m.cursor--
		}

	case tea.KeyBackspace:
		if len(m.cmd) > 0 {
			m.cmd = m.cmd[:len(m.cmd)-1]
			m.cursor = 0
		}

	case tea.KeySpace:
		m.cmd += " "
		m.cursor = 0

	case tea.KeyRunes:
		m.cmd += string(msg.Runes)
		m.cursor = 0
	}
	return m, nil
}

func (m Model) updateValues(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	sugg := m.suggestions()
	if m.showValues >= len(sugg) {
		m.showValues = -1
		return m, nil
	}
	opt := sugg[m.showValues]

	switch msg.Type {
	case tea.KeyEsc, tea.KeyBackspace:
		m.cmd = removeLast(m.cmd)
		m.showValues = -1
		m.cursor = 0

	case tea.KeyTab, tea.KeyEnter:
		if m.valCursor < len(opt.Values) {
			m.cmd += " " + opt.Values[m.valCursor].Text + " "
			m.showValues = -1
			m.cursor = 0
		}

	case tea.KeyUp:
		if m.valCursor > 0 {
			m.valCursor--
		}
	case tea.KeyDown:
		if m.valCursor < len(opt.Values)-1 {
			m.valCursor++
		}

	case tea.KeyRunes:
		m.cmd += " " + string(msg.Runes)
		m.showValues = -1
		m.cursor = 0
	}
	return m, nil
}

func lastToken(cmd string) string {
	if cmd == "" {
		return ""
	}
	parts := strings.Split(cmd, " ")
	return parts[len(parts)-1]
}

func (m Model) usedFlags() map[string]bool {
	used := make(map[string]bool)
	fields := strings.Fields(m.cmd)
	// last field is a partial token still being typed — don't count it as used
	if len(fields) > 0 && !strings.HasSuffix(m.cmd, " ") {
		fields = fields[:len(fields)-1]
	}
	for _, p := range fields {
		if strings.HasPrefix(p, "-") {
			used[p] = true
		}
	}
	return used
}

func (m Model) suggestions() []model.RankedFlag {
	partial := strings.ToLower(lastToken(m.cmd))
	used := m.usedFlags()

	var out []model.RankedFlag
	for _, f := range m.space.Flags {
		if used[f.Name] && !f.Repeatable {
			continue
		}
		if partial == "" || strings.Contains(strings.ToLower(f.Name), partial) {
			out = append(out, f)
		}
	}
	return out
}

func replacePartial(cmd string, flag string) string {
	partial := lastToken(cmd)
	if partial == "" {
		return cmd + flag
	}
	return cmd[:len(cmd)-len(partial)] + flag
}

func removeLast(cmd string) string {
	trimmed := strings.TrimRight(cmd, " ")
	idx := strings.LastIndex(trimmed, " ")
	if idx < 0 {
		return ""
	}
	return trimmed[:idx+1]
}

func (m Model) View() string {
	if m.done {
		if m.result.Action != ActionQuit && m.result.Command != "" {
			return fmt.Sprintf("\n  %s\n\n", m.result.Command)
		}
		return ""
	}

	if m.phase == phaseSubcmd {
		return m.viewSubcmd()
	}
	return m.viewInput()
}

func (m Model) viewSubcmd() string {
	var b strings.Builder
	b.WriteString("\n")

	total := len(m.invocations)
	b.WriteString(hdr.Render(fmt.Sprintf("  uh · %s · %d invocations",
		strings.Join(m.baseTokens, " "), total)))
	b.WriteString("\n\n")

	visible := m.height - 8
	if visible < 3 {
		visible = 3
	}

	scroll := 0
	if m.subcmdIdx >= visible {
		scroll = m.subcmdIdx - visible + 1
	}

	if scroll > 0 {
		b.WriteString(dim.Render("  ↑") + "\n")
	}

	end := scroll + visible
	if end > len(m.subcmds) {
		end = len(m.subcmds)
	}

	for i := scroll; i < end; i++ {
		sc := m.subcmds[i]
		isHere := i == m.subcmdIdx
		prefix := "  "
		if isHere {
			prefix = hi.Render("> ")
		}
		name := sc.Text
		if isHere {
			name = hi.Render(name)
		}
		count := dim.Render(fmt.Sprintf(" (%d×)", sc.Count))
		b.WriteString(fmt.Sprintf("  %s  %s%s\n", prefix, name, count))
	}

	if end < len(m.subcmds) {
		b.WriteString(dim.Render("  ↓") + "\n")
	}

	b.WriteString("\n")
	b.WriteString(dim.Render("  [enter] select  [esc] quit"))
	b.WriteString("\n")

	return b.String()
}

func (m Model) viewInput() string {
	var b strings.Builder
	sugg := m.suggestions()

	b.WriteString("\n")
	b.WriteString("  " + pvw.Render(m.cmd) + dim.Render("█"))
	b.WriteString("\n\n")

	chrome := 6
	visible := m.height - chrome
	if visible < 3 {
		visible = 3
	}

	scroll := 0
	if m.cursor >= visible {
		scroll = m.cursor - visible + 1
	}
	end := scroll + visible
	if end > len(sugg) {
		end = len(sugg)
	}

	if scroll > 0 {
		b.WriteString(dim.Render("  ↑") + "\n")
	}

	partial := lastToken(m.cmd)

	for i := scroll; i < end; i++ {
		opt := sugg[i]
		isCursor := i == m.cursor && m.showValues < 0

		prefix := "  "
		if isCursor {
			prefix = hi.Render("> ")
		}

		name := opt.Name
		if isCursor {
			name = hi.Render(name)
		} else if partial != "" {
			name = highlightMatch(name, partial)
		}

		kind := ""
		if !opt.IsBool {
			kind = dim.Render(" ›")
		}

		count := dim.Render(fmt.Sprintf(" (%d×)", opt.Count))
		b.WriteString(fmt.Sprintf("  %s%s%s%s\n", prefix, name, kind, count))

		if i == m.showValues {
			for vi, v := range opt.Values {
				isVal := vi == m.valCursor
				vPrefix := "       "
				if isVal {
					vPrefix = "     " + matchSt.Render("> ")
				}
				vText := v.Text
				if isVal {
					vText = matchSt.Render(vText)
				}
				vCount := dim.Render(fmt.Sprintf(" (%d×)", v.Count))
				b.WriteString(fmt.Sprintf("%s%s%s\n", vPrefix, vText, vCount))
			}
		}
	}

	if end < len(sugg) {
		b.WriteString(dim.Render("  ↓") + "\n")
	}

	b.WriteString("\n")
	if m.showValues >= 0 {
		b.WriteString(dim.Render("  [enter/tab] pick value  [esc] back  or just type"))
	} else {
		b.WriteString(dim.Render("  [tab/enter] complete  [↑↓] navigate  ^x run  ^y copy  [esc] quit"))
	}
	b.WriteString("\n")

	return b.String()
}

func highlightMatch(text string, query string) string {
	lower := strings.ToLower(text)
	qLower := strings.ToLower(query)
	idx := strings.Index(lower, qLower)
	if idx < 0 {
		return text
	}
	before := text[:idx]
	match := text[idx : idx+len(query)]
	after := text[idx+len(query):]
	return dim.Render(before) + matchSt.Render(match) + dim.Render(after)
}
