package main

import (
	"flag"
	"fmt"
	"os"
)

var version = "dev"

func main() {
	dryRun := flag.Bool("dry-run", false, "print composed command without executing")
	copyFlag := flag.Bool("copy", false, "copy composed command to clipboard")
	historyFile := flag.String("history-file", "", "override auto-detected history file")
	showVersion := flag.Bool("version", false, "print version and exit")
	flag.Usage = usage
	flag.Parse()

	if *showVersion {
		fmt.Println("uh", version)
		os.Exit(0)
	}

	if flag.NArg() < 1 {
		usage()
		os.Exit(1)
	}

	baseCmd := flag.Arg(0)

	// TODO: wire up history reader, parser, model, TUI
	_, _, _ = *dryRun, *copyFlag, *historyFile
	fmt.Fprintf(os.Stderr, "uh: not yet implemented (base command: %s)\n", baseCmd)
	os.Exit(2)
}

func usage() {
	fmt.Fprintf(os.Stderr, `uh — unwrap history

Usage:
  uh <command>                 interactive command builder from history
  uh <command> --dry-run       print composed command, no TUI
  uh <command> --copy          copy composed command to clipboard
  uh <command> --history-file <path>  override history file

Flags:
`)
	flag.PrintDefaults()
}
