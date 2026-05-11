package main

import (
	"fmt"
	"os"
	"os/exec"
	"reflect"
	"strings"

	"github.com/AshCoolman/uh/internal/history"
	"github.com/AshCoolman/uh/internal/model"
	"github.com/AshCoolman/uh/internal/parser"
	"github.com/AshCoolman/uh/internal/tui"
)

var version = "dev"

type opts struct {
	dryRun      bool
	historyFile string
	version     bool
	baseTokens  []string
}

// parseArgs extracts uh's own flags from the FRONT of argv only.
// Once the first non-flag arg appears, everything after it
// (including flags) becomes base tokens.
//   uh --dry-run git --oneline  → dryRun=true, base=["git","--oneline"]
//   uh git --dry-run            → dryRun=false, base=["git","--dry-run"]
func parseArgs(args []string) opts {
	var o opts
	var rest []string
	seenBase := false

	for i := 0; i < len(args); i++ {
		a := args[i]

		if seenBase {
			rest = append(rest, a)
			continue
		}

		switch {
		case a == "--dry-run":
			o.dryRun = true
		case a == "--version":
			o.version = true
		case a == "--history-file" && i+1 < len(args):
			i++
			o.historyFile = args[i]
		case a == "-h" || a == "--help":
			usage()
			os.Exit(0)
		default:
			seenBase = true
			rest = append(rest, a)
		}
	}
	o.baseTokens = rest
	return o
}

func main() {
	o := parseArgs(os.Args[1:])

	if o.version {
		fmt.Println("uh", version)
		os.Exit(0)
	}

	if len(o.baseTokens) == 0 {
		usage()
		os.Exit(1)
	}

	baseTokens := o.baseTokens

	// resolve history file
	histPath := o.historyFile
	if histPath == "" {
		histPath = history.DetectFile()
	}
	if histPath == "" {
		fmt.Fprintf(os.Stderr, "uh: no history file found (set $HISTFILE or use --history-file)\n")
		os.Exit(1)
	}

	// read and filter history
	lines, err := history.Read(histPath, baseTokens)
	if err != nil {
		fmt.Fprintf(os.Stderr, "uh: %v\n", err)
		os.Exit(1)
	}

	// skeleton fallback: if primary results are sparse, widen the search
	// by stripping positional values from base tokens (keep first token + flags).
	// baseTokens is NOT changed — the parser strips by count, so the wildcard
	// position is consumed as a base token regardless of its actual value.
	// Only tokens AFTER that position appear as suggestions.
	skelBase := skeletonBase(baseTokens)
	if len(lines) < 10 && !reflect.DeepEqual(skelBase, baseTokens) {
		skelLines, err := history.Read(histPath, skelBase)
		if err == nil && len(skelLines) > len(lines) {
			lines = skelLines
			fmt.Fprintf(os.Stderr, "uh: widened to %s * (%d matches)\n",
				strings.Join(skelBase, " "), len(lines))
		}
	}

	if len(lines) == 0 {
		fmt.Fprintf(os.Stderr, "uh: no history entries found for %q\n", strings.Join(baseTokens, " "))
		os.Exit(1)
	}

	// parse invocations
	var invocations []parser.Invocation
	for _, line := range lines {
		invocations = append(invocations, parser.Parse(line, baseTokens))
	}

	// dry-run: just dump the option space summary
	if o.dryRun {
		space := model.Build(invocations)
		dumpSpace(baseTokens, space, len(lines))
		os.Exit(0)
	}

	// launch TUI with invocations (supports drill-down)
	result, err := tui.Run(baseTokens, invocations)
	if err != nil {
		fmt.Fprintf(os.Stderr, "uh: %v\n", err)
		os.Exit(1)
	}

	switch result.Action {
	case tui.ActionQuit:
		os.Exit(0)
	case tui.ActionCopy:
		copyToClipboard(result.Command)
	case tui.ActionExecute:
		execute(result.Command)
	}
}

// skeletonBase reduces base tokens to first token + flags only,
// dropping positional values. Used for fallback search when primary
// results are sparse.
func skeletonBase(tokens []string) []string {
	if len(tokens) <= 1 {
		return tokens
	}
	out := []string{tokens[0]}
	for _, t := range tokens[1:] {
		if strings.HasPrefix(t, "-") {
			out = append(out, t)
		}
	}
	return out
}

func dumpSpace(baseTokens []string, space model.OptionSpace, total int) {
	base := strings.Join(baseTokens, " ")
	fmt.Printf("uh: %d invocations of %q\n\n", total, base)

	if len(space.Flags) > 0 {
		fmt.Println("Flags:")
		for _, f := range space.Flags {
			kind := "value"
			if f.IsBool {
				kind = "bool"
			}
			if f.Repeatable {
				kind = "repeatable"
			}
			fmt.Printf("  %s (%d×, %s)\n", f.Name, f.Count, kind)
			for _, v := range f.Values {
				fmt.Printf("    %s (%d×)\n", v.Text, v.Count)
			}
		}
	}

	if len(space.Positionals) > 0 {
		fmt.Println("\nPositionals:")
		for _, p := range space.Positionals {
			fmt.Printf("  %s (%d×)\n", p.Text, p.Count)
		}
	}
}

func copyToClipboard(cmd string) {
	for _, clip := range [][]string{
		{"pbcopy"},
		{"xclip", "-selection", "clipboard"},
		{"xsel", "--clipboard", "--input"},
	} {
		bin, err := exec.LookPath(clip[0])
		if err != nil {
			continue
		}
		c := exec.Command(bin, clip[1:]...)
		c.Stdin = strings.NewReader(cmd)
		if err := c.Run(); err == nil {
			fmt.Fprintf(os.Stderr, "copied: %s\n", cmd)
			return
		}
	}
	fmt.Fprintf(os.Stderr, "uh: no clipboard tool found (pbcopy/xclip/xsel)\n")
	fmt.Println(cmd)
}

func execute(cmd string) {
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/sh"
	}
	c := exec.Command(shell, "-c", cmd)
	c.Stdin = os.Stdin
	c.Stdout = os.Stdout
	c.Stderr = os.Stderr
	if err := c.Run(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			os.Exit(exitErr.ExitCode())
		}
		fmt.Fprintf(os.Stderr, "uh: %v\n", err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprintf(os.Stderr, `uh — unwrap history

Usage:
  uh <command...>                        interactive command builder from history
  uh --dry-run <command...>              print option space summary, no TUI
  uh --history-file <path> <command...>  override history file

  Flags for uh must come BEFORE the command. Everything after the
  first non-flag argument is treated as the command to search for.

TUI keys:
  [tab/enter]  complete suggestion
  [↑↓]         navigate suggestions
  ^x           execute the command
  ^y           copy to clipboard
  [esc]        quit

Examples:
  uh git                       all git commands
  uh docker compose            multi-token: "docker compose" invocations
  uh claude --resume           "claude --resume" invocations
  uh --dry-run git             see flags/values without TUI

Flags (must precede the command):
  --dry-run              print option space, no TUI
  --history-file <path>  override auto-detected history file
  --version              print version and exit
  -h, --help             show this help
`)
}
