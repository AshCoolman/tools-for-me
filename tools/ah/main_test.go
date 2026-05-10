package main

import (
	"reflect"
	"testing"
)

func TestParseArgsDryRunBeforeCmd(t *testing.T) {
	o := parseArgs([]string{"--dry-run", "git"})
	if !o.dryRun {
		t.Error("--dry-run before cmd should set dryRun")
	}
	if !reflect.DeepEqual(o.cmdTokens, []string{"git"}) {
		t.Errorf("cmdTokens = %v, want [git]", o.cmdTokens)
	}
}

func TestParseArgsDryRunAfterCmd(t *testing.T) {
	o := parseArgs([]string{"git", "--dry-run"})
	if o.dryRun {
		t.Error("--dry-run after cmd should NOT set dryRun")
	}
	if !reflect.DeepEqual(o.cmdTokens, []string{"git", "--dry-run"}) {
		t.Errorf("cmdTokens = %v, want [git --dry-run]", o.cmdTokens)
	}
}

func TestParseArgsVersionFlag(t *testing.T) {
	o := parseArgs([]string{"--version"})
	if !o.version {
		t.Error("--version should set version")
	}
}

func TestParseArgsCmdOnly(t *testing.T) {
	o := parseArgs([]string{"docker", "run"})
	if !reflect.DeepEqual(o.cmdTokens, []string{"docker", "run"}) {
		t.Errorf("cmdTokens = %v, want [docker run]", o.cmdTokens)
	}
	if o.dryRun || o.version {
		t.Error("no flags should be set")
	}
}

func TestParseArgsDryRunThenMultiCmd(t *testing.T) {
	o := parseArgs([]string{"--dry-run", "docker", "compose", "up"})
	if !o.dryRun {
		t.Error("--dry-run should be set")
	}
	if !reflect.DeepEqual(o.cmdTokens, []string{"docker", "compose", "up"}) {
		t.Errorf("cmdTokens = %v, want [docker compose up]", o.cmdTokens)
	}
}

func TestParseArgsEmpty(t *testing.T) {
	o := parseArgs(nil)
	if len(o.cmdTokens) != 0 {
		t.Errorf("cmdTokens = %v, want empty", o.cmdTokens)
	}
}
