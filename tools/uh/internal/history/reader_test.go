package history

import (
	"path/filepath"
	"testing"
)

func fixture(name string) string {
	return filepath.Join("testdata", name)
}

func TestReadZshHistory(t *testing.T) {
	results, err := Read(fixture("zsh_history"), "git")
	if err != nil {
		t.Fatal(err)
	}
	want := 4
	if len(results) != want {
		t.Fatalf("got %d results, want %d: %v", len(results), want, results)
	}
	if results[0] != `git commit -m "initial"` {
		t.Errorf("first result = %q, want git commit", results[0])
	}
}

func TestReadBashHistory(t *testing.T) {
	results, err := Read(fixture("bash_history"), "git")
	if err != nil {
		t.Fatal(err)
	}
	want := 4
	if len(results) != want {
		t.Fatalf("got %d results, want %d: %v", len(results), want, results)
	}
}

func TestReadNoMatches(t *testing.T) {
	results, err := Read(fixture("bash_history"), "rutabaga")
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 0 {
		t.Fatalf("expected 0 results, got %d", len(results))
	}
}

func TestReadEmptyFile(t *testing.T) {
	results, err := Read(fixture("empty_history"), "git")
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 0 {
		t.Fatalf("expected 0 results, got %d", len(results))
	}
}

func TestReadNonexistentFile(t *testing.T) {
	_, err := Read(fixture("does_not_exist"), "git")
	if err == nil {
		t.Fatal("expected error for nonexistent file")
	}
}

func TestStripZshMeta(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{": 1234567890:0;git commit -m foo", "git commit -m foo"},
		{": 1234567890:123;docker run --rm", "docker run --rm"},
		{"plain command", "plain command"},
		{": no-semicolon", ": no-semicolon"},
	}
	for _, tt := range tests {
		got := stripZshMeta(tt.input)
		if got != tt.want {
			t.Errorf("stripZshMeta(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestMatchesBaseWithPath(t *testing.T) {
	if !matchesBase("/usr/bin/git commit -m foo", "git") {
		t.Error("expected /usr/bin/git to match base 'git'")
	}
	if matchesBase("/usr/bin/git commit", "docker") {
		t.Error("expected /usr/bin/git not to match 'docker'")
	}
}
