package history

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

func DetectFile() string {
	if env := os.Getenv("HISTFILE"); env != "" {
		return env
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	// prefer zsh, fall back to bash
	zsh := filepath.Join(home, ".zsh_history")
	if _, err := os.Stat(zsh); err == nil {
		return zsh
	}
	bash := filepath.Join(home, ".bash_history")
	if _, err := os.Stat(bash); err == nil {
		return bash
	}
	return ""
}

// Read filters history lines whose leading tokens match baseTokens.
// e.g. baseTokens=["docker","compose"] matches "docker compose up -d".
func Read(path string, baseTokens []string) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var results []string
	scanner := bufio.NewScanner(f)

	// handle long lines
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		cmd := stripZshMeta(line)
		cmd = strings.TrimSpace(cmd)
		if cmd == "" {
			continue
		}
		if matchesBase(cmd, baseTokens) {
			results = append(results, cmd)
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return results, nil
}

// stripZshMeta removes the zsh extended history prefix.
// Format: ": 1234567890:0;actual command"
func stripZshMeta(line string) string {
	if !strings.HasPrefix(line, ": ") {
		return line
	}
	idx := strings.Index(line, ";")
	if idx < 0 {
		return line
	}
	return line[idx+1:]
}

func matchesBase(cmd string, baseTokens []string) bool {
	fields := strings.Fields(cmd)
	if len(fields) < len(baseTokens) {
		return false
	}
	for i, tok := range baseTokens {
		field := fields[i]
		if i == 0 {
			field = filepath.Base(field)
		}
		if field != tok {
			return false
		}
	}
	return true
}
