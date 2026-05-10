package main

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/AshCoolman/ah/internal/helpparse"
	"github.com/AshCoolman/ah/internal/tui"
)

var version = "dev"

type opts struct {
	dryRun   bool
	version  bool
	cmdTokens []string
}

func parseArgs(args []string) opts {
	var o opts
	var rest []string
	seenCmd := false

	for i := 0; i < len(args); i++ {
		a := args[i]

		if seenCmd {
			rest = append(rest, a)
			continue
		}

		switch {
		case a == "--dry-run":
			o.dryRun = true
		case a == "--version":
			o.version = true
		case a == "-h" || a == "--help":
			usage()
			os.Exit(0)
		default:
			seenCmd = true
			rest = append(rest, a)
		}
	}
	o.cmdTokens = rest
	return o
}

func runHelp(cmdTokens []string) (string, error) {
	args := append(append([]string{}, cmdTokens...), "--help")
	cmd := exec.Command(args[0], args[1:]...)
	out, err := cmd.CombinedOutput()
	text := string(out)
	if text != "" {
		return text, nil
	}
	return text, err
}

func main() {
	o := parseArgs(os.Args[1:])

	if o.version {
		fmt.Println("ah", version)
		os.Exit(0)
	}

	if len(o.cmdTokens) == 0 {
		usage()
		os.Exit(1)
	}

	helpText, err := runHelp(o.cmdTokens)
	if err != nil && helpText == "" {
		fmt.Fprintf(os.Stderr, "ah: %v\n", err)
		os.Exit(1)
	}

	parsed := helpparse.Parse(helpText)

	if o.dryRun {
		dumpParsed(o.cmdTokens, parsed)
		os.Exit(0)
	}

	result, err := tui.Run(o.cmdTokens, parsed)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ah: %v\n", err)
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

func dumpParsed(cmdTokens []string, parsed helpparse.HelpInfo) {
	base := strings.Join(cmdTokens, " ")
	fmt.Printf("ah: %s --help\n\n", base)

	if len(parsed.Flags) > 0 {
		fmt.Println("Flags:")
		for _, f := range parsed.Flags {
			kind := "value"
			if f.IsBool {
				kind = "bool"
			}
			desc := ""
			if f.Description != "" {
				desc = "  " + f.Description
			}
			if f.Short != "" && f.Long != "" {
				fmt.Printf("  %s, %s (%s)%s\n", f.Short, f.Long, kind, desc)
			} else if f.Long != "" {
				fmt.Printf("      %s (%s)%s\n", f.Long, kind, desc)
			} else {
				fmt.Printf("  %s (%s)%s\n", f.Short, kind, desc)
			}
		}
	}

	if len(parsed.Subcommands) > 0 {
		fmt.Println("\nSubcommands:")
		for _, s := range parsed.Subcommands {
			fmt.Printf("  %-20s %s\n", s.Name, s.Description)
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
	fmt.Fprintf(os.Stderr, "ah: no clipboard tool found (pbcopy/xclip/xsel)\n")
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
		fmt.Fprintf(os.Stderr, "ah: %v\n", err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprintf(os.Stderr, `ah — analyze help

Usage:
  ah <command...>                 interactive command builder from --help
  ah --dry-run <command...>      print parsed flags/subcommands, no TUI

  Flags for ah must come BEFORE the command.

TUI keys:
  [tab/enter]  complete suggestion
  [↑↓]         navigate suggestions
  ^x           execute the command
  ^y           copy to clipboard
  [esc]        quit

Examples:
  ah docker run                  docker run flags from --help
  ah git                         git subcommands
  ah curl                        curl flags
  ah --dry-run git commit        see parsed flags without TUI

Flags (must precede the command):
  --dry-run              print parsed help, no TUI
  --version              print version and exit
  -h, --help             show this help
`)
}
