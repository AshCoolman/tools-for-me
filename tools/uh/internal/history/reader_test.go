package history

import (
	"path/filepath"
	"testing"
)

func fixture(name string) string {
	return filepath.Join("testdata", name)
}

func TestReadZshHistory(t *testing.T) {
	results, err := Read(fixture("zsh_history"), []string{"git"})
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
	results, err := Read(fixture("bash_history"), []string{"git"})
	if err != nil {
		t.Fatal(err)
	}
	want := 4
	if len(results) != want {
		t.Fatalf("got %d results, want %d: %v", len(results), want, results)
	}
}

func TestReadNoMatches(t *testing.T) {
	results, err := Read(fixture("bash_history"), []string{"rutabaga"})
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 0 {
		t.Fatalf("expected 0 results, got %d", len(results))
	}
}

func TestReadEmptyFile(t *testing.T) {
	results, err := Read(fixture("empty_history"), []string{"git"})
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 0 {
		t.Fatalf("expected 0 results, got %d", len(results))
	}
}

func TestReadNonexistentFile(t *testing.T) {
	_, err := Read(fixture("does_not_exist"), []string{"git"})
	if err == nil {
		t.Fatal("expected error for nonexistent file")
	}
}

func TestReadMultiTokenBase(t *testing.T) {
	// add docker compose lines to zsh fixture
	results, err := Read(fixture("zsh_history"), []string{"docker", "run"})
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 {
		t.Fatalf("got %d results, want 1: %v", len(results), results)
	}
	if results[0] != "docker run --rm -it node:18" {
		t.Errorf("got %q", results[0])
	}
}

func TestReadSingleTokenMatchesAll(t *testing.T) {
	// "docker" alone should match "docker run --rm -it node:18"
	results, err := Read(fixture("zsh_history"), []string{"docker"})
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 {
		t.Fatalf("got %d results, want 1: %v", len(results), results)
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
	if !matchesBase("/usr/bin/git commit -m foo", []string{"git"}) {
		t.Error("expected /usr/bin/git to match base 'git'")
	}
	if matchesBase("/usr/bin/git commit", []string{"docker"}) {
		t.Error("expected /usr/bin/git not to match 'docker'")
	}
}

func TestMatchesMultiToken(t *testing.T) {
	if !matchesBase("docker compose up -d", []string{"docker", "compose"}) {
		t.Error("expected 'docker compose' to match")
	}
	if matchesBase("docker run --rm", []string{"docker", "compose"}) {
		t.Error("expected 'docker run' not to match 'docker compose'")
	}
	if !matchesBase("/usr/local/bin/docker compose up", []string{"docker", "compose"}) {
		t.Error("expected path-prefixed 'docker compose' to match")
	}
}
