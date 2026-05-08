package parser

import (
	"reflect"
	"testing"
)

func TestParseGitCommit(t *testing.T) {
	inv := Parse(`git commit -m "initial commit"`, []string{"git"})
	if len(inv.BaseTokens) != 1 || inv.BaseTokens[0] != "git" {
		t.Errorf("base = %v", inv.BaseTokens)
	}
	// -m is a short flag with value
	wantFlags := []Flag{
		{Name: "-m", Values: []string{`"initial commit"`}},
	}
	if !reflect.DeepEqual(inv.Flags, wantFlags) {
		t.Errorf("flags = %+v, want %+v", inv.Flags, wantFlags)
	}
	if len(inv.Positionals) != 1 || inv.Positionals[0] != "commit" {
		t.Errorf("positionals = %v, want [commit]", inv.Positionals)
	}
}

func TestParseDockerRun(t *testing.T) {
	inv := Parse("docker run --rm -it -v $(pwd):/app node:18", []string{"docker", "run"})
	if len(inv.BaseTokens) != 2 {
		t.Fatalf("base = %v", inv.BaseTokens)
	}

	expectFlag := func(name string, isBool bool, vals []string) {
		t.Helper()
		for _, f := range inv.Flags {
			if f.Name == name {
				if f.IsBool != isBool {
					t.Errorf("%s: IsBool = %v, want %v", name, f.IsBool, isBool)
				}
				if !reflect.DeepEqual(f.Values, vals) {
					t.Errorf("%s: Values = %v, want %v", name, f.Values, vals)
				}
				return
			}
		}
		t.Errorf("flag %s not found in %+v", name, inv.Flags)
	}

	expectFlag("--rm", true, nil)
	expectFlag("-i", true, nil)
	expectFlag("-t", true, nil)
	expectFlag("-v", false, []string{"$(pwd):/app"})

	if len(inv.Positionals) != 1 || inv.Positionals[0] != "node:18" {
		t.Errorf("positionals = %v", inv.Positionals)
	}
}

func TestParseCurlComplex(t *testing.T) {
	inv := Parse(`curl -sH "Auth: Bearer $T" -o out.json https://x.com`, []string{"curl"})

	// -s is bool, -H takes the quoted value
	expectFlag := func(name string, isBool bool, vals []string) {
		t.Helper()
		for _, f := range inv.Flags {
			if f.Name == name {
				if f.IsBool != isBool {
					t.Errorf("%s: IsBool = %v, want %v", name, f.IsBool, isBool)
				}
				if vals != nil && !reflect.DeepEqual(f.Values, vals) {
					t.Errorf("%s: Values = %v, want %v", name, f.Values, vals)
				}
				return
			}
		}
		t.Errorf("flag %s not found in %+v", name, inv.Flags)
	}

	expectFlag("-s", true, nil)
	expectFlag("-H", false, []string{`"Auth: Bearer $T"`})
	expectFlag("-o", false, []string{"out.json"})

	if len(inv.Positionals) != 1 || inv.Positionals[0] != "https://x.com" {
		t.Errorf("positionals = %v", inv.Positionals)
	}
}

func TestParseLsLa(t *testing.T) {
	inv := Parse("ls -la", []string{"ls"})
	// -la splits into -l (bool) and -a (bool)
	if len(inv.Flags) != 2 {
		t.Fatalf("flags = %+v, want 2", inv.Flags)
	}
	for _, f := range inv.Flags {
		if !f.IsBool {
			t.Errorf("flag %s should be bool", f.Name)
		}
	}
}

func TestParseLongFlagEquals(t *testing.T) {
	inv := Parse("git log --format=oneline --count=5", []string{"git"})
	expectFlag := func(name string, val string) {
		t.Helper()
		for _, f := range inv.Flags {
			if f.Name == name {
				if len(f.Values) != 1 || f.Values[0] != val {
					t.Errorf("%s: Values = %v, want [%s]", name, f.Values, val)
				}
				return
			}
		}
		t.Errorf("flag %s not found", name)
	}
	expectFlag("--format", "oneline")
	expectFlag("--count", "5")
}

func TestParseDoubleDash(t *testing.T) {
	inv := Parse("git checkout -- file.txt other.txt", []string{"git"})
	if len(inv.Positionals) != 3 {
		t.Fatalf("positionals = %v, want [checkout file.txt other.txt]", inv.Positionals)
	}
	if inv.Positionals[1] != "file.txt" || inv.Positionals[2] != "other.txt" {
		t.Errorf("after -- positionals = %v", inv.Positionals)
	}
}

func TestParseMultiTokenBase(t *testing.T) {
	inv := Parse("docker compose up -d --build", []string{"docker", "compose"})
	if len(inv.BaseTokens) != 2 {
		t.Fatalf("base = %v", inv.BaseTokens)
	}
	if len(inv.Positionals) != 1 || inv.Positionals[0] != "up" {
		t.Errorf("positionals = %v, want [up]", inv.Positionals)
	}
	found := false
	for _, f := range inv.Flags {
		if f.Name == "-d" && f.IsBool {
			found = true
		}
	}
	if !found {
		t.Error("-d not found as bool flag")
	}
}

func TestTokenizeQuoted(t *testing.T) {
	tests := []struct {
		input string
		want  []string
	}{
		{`echo "hello world"`, []string{"echo", `"hello world"`}},
		{`echo 'single quotes'`, []string{"echo", `'single quotes'`}},
		{`cmd --flag="val with spaces"`, []string{"cmd", `--flag="val with spaces"`}},
		{`a b   c`, []string{"a", "b", "c"}},
	}
	for _, tt := range tests {
		got := tokenize(tt.input)
		if !reflect.DeepEqual(got, tt.want) {
			t.Errorf("tokenize(%q) = %v, want %v", tt.input, got, tt.want)
		}
	}
}
