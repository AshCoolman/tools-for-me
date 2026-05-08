package model

import (
	"testing"

	"github.com/AshCoolman/uh/internal/parser"
)

func dockerInvocations() []parser.Invocation {
	cmds := []string{
		"docker run --rm -it -v $(pwd):/app node:18",
		"docker run --rm -it -v $(pwd):/app postgres:15",
		"docker run --rm -v ~/.config:/config node:18",
		"docker run --rm -it node:18",
		"docker run --rm -d -p 3000:3000 node:18",
		"docker run --rm -d -p 3000:3000 -p 8080:80 nginx:latest",
		"docker run --rm -it -v $(pwd):/app -e NODE_ENV=production node:18",
		"docker run --rm -it -v $(pwd):/app -e NODE_ENV=production -e DEBUG=true node:18",
		"docker run --rm node:18",
		"docker run --rm -it --network host node:18",
	}
	base := []string{"docker", "run"}
	var invs []parser.Invocation
	for _, c := range cmds {
		invs = append(invs, parser.Parse(c, base))
	}
	return invs
}

func TestBuildFlagCount(t *testing.T) {
	space := Build(dockerInvocations())

	rm := findFlag(space, "--rm")
	if rm == nil {
		t.Fatal("--rm not found")
	}
	if rm.Count != 10 {
		t.Errorf("--rm count = %d, want 10", rm.Count)
	}
	if !rm.IsBool {
		t.Error("--rm should be bool")
	}
}

func TestBuildFlagValuesRanked(t *testing.T) {
	space := Build(dockerInvocations())

	v := findFlag(space, "-v")
	if v == nil {
		t.Fatal("-v not found")
	}
	if v.IsBool {
		t.Error("-v should not be bool")
	}
	if len(v.Values) == 0 {
		t.Fatal("-v has no values")
	}
	// $(pwd):/app should be top ranked
	if v.Values[0].Text != "$(pwd):/app" {
		t.Errorf("top -v value = %q, want $(pwd):/app", v.Values[0].Text)
	}
}

func TestBuildRepeatable(t *testing.T) {
	space := Build(dockerInvocations())

	// -p was used 2x in one invocation (3000:3000 + 8080:80)
	p := findFlag(space, "-p")
	if p == nil {
		t.Fatal("-p not found")
	}
	if !p.Repeatable {
		t.Error("-p should be marked repeatable")
	}

	// -e was used 2x in one invocation
	e := findFlag(space, "-e")
	if e == nil {
		t.Fatal("-e not found")
	}
	if !e.Repeatable {
		t.Error("-e should be marked repeatable")
	}

	// --rm is never repeated
	rm := findFlag(space, "--rm")
	if rm.Repeatable {
		t.Error("--rm should not be repeatable")
	}
}

func TestBuildPositionals(t *testing.T) {
	space := Build(dockerInvocations())

	if len(space.Positionals) == 0 {
		t.Fatal("no positionals")
	}
	// node:18 is the most common
	if space.Positionals[0].Text != "node:18" {
		t.Errorf("top positional = %q, want node:18", space.Positionals[0].Text)
	}
}

func TestBuildFlagsSortedByFrequency(t *testing.T) {
	space := Build(dockerInvocations())

	if len(space.Flags) < 2 {
		t.Fatal("expected at least 2 flags")
	}
	for i := 1; i < len(space.Flags); i++ {
		if space.Flags[i].Count > space.Flags[i-1].Count {
			t.Errorf("flags not sorted: %s(%d) > %s(%d)",
				space.Flags[i].Name, space.Flags[i].Count,
				space.Flags[i-1].Name, space.Flags[i-1].Count)
		}
	}
}

func TestBuildDedup(t *testing.T) {
	space := Build(dockerInvocations())

	seen := map[string]bool{}
	for _, f := range space.Flags {
		if seen[f.Name] {
			t.Errorf("duplicate flag %s", f.Name)
		}
		seen[f.Name] = true
	}
}

func TestBuildEmpty(t *testing.T) {
	space := Build(nil)
	if len(space.Flags) != 0 || len(space.Positionals) != 0 {
		t.Error("expected empty space for nil input")
	}
}

func findFlag(space OptionSpace, name string) *RankedFlag {
	for i := range space.Flags {
		if space.Flags[i].Name == name {
			return &space.Flags[i]
		}
	}
	return nil
}
