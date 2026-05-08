package main

import (
	"fmt"
	"os"
	"os/exec"
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

// parseArgs extracts uh's own flags from anywhere in argv,
// leaving the rest as base tokens. This lets users write
// `uh git --dry-run` instead of `uh --dry-run git`.
func parseArgs(args []string) opts {
	var o opts
	var rest []string

	known := map[string]bool{
		"--dry-run": true, "--version": true,
		"--history-file": true, "-h": true, "--help": true,
	}

	for i := 0; i < len(args); i++ {
		a := args[i]
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
		case strings.HasPrefix(a, "-") && known[a]:
			// already handled above
		default:
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
	case tui.ActionCommit:
		// print to stdout — shell wrapper pushes onto prompt
		fmt.Println(result.Command)
	case tui.ActionExecute:
		execute(result.Command)
	}
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
  uh <command...> --dry-run              print option space summary, no TUI
  uh <command...> --history-file <path>  override history file

TUI keys:
  (e)xecute    run the command directly
  (c)ommit     print to stdout (use shell wrapper for prompt population)
  (i)nsert     type a custom value
  (q)uit       exit without action

Shell wrapper (add to .zshrc for prompt population):
  uh() { local cmd; cmd="$(command uh "$@")" && print -z "$cmd" }

Examples:
  uh git                       all git commands
  uh docker compose            multi-token: "docker compose" invocations
  uh curl --dry-run            see flags/values without TUI

Flags:
  --dry-run              print option space, no TUI
  --history-file <path>  override auto-detected history file
  --version              print version and exit
  -h, --help             show this help
`)
}
