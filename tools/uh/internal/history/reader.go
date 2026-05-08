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
		for _, sub := range splitCompound(cmd) {
			sub = strings.TrimSpace(sub)
			if sub == "" {
				continue
			}
			if matchesBase(sub, baseTokens) {
				results = append(results, sub)
			}
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

// splitCompound breaks a line on shell compound operators (&&, ||, |, ;)
// while respecting quotes.
func splitCompound(line string) []string {
	var parts []string
	var cur strings.Builder
	inSingle := false
	inDouble := false
	runes := []rune(line)

	for i := 0; i < len(runes); i++ {
		r := runes[i]

		if r == '\'' && !inDouble {
			inSingle = !inSingle
			cur.WriteRune(r)
			continue
		}
		if r == '"' && !inSingle {
			inDouble = !inDouble
			cur.WriteRune(r)
			continue
		}
		if inSingle || inDouble {
			cur.WriteRune(r)
			continue
		}

		// check two-char operators first
		if i+1 < len(runes) {
			pair := string(runes[i : i+2])
			if pair == "&&" || pair == "||" {
				parts = append(parts, cur.String())
				cur.Reset()
				i++ // skip second char
				continue
			}
		}

		if r == '|' || r == ';' {
			parts = append(parts, cur.String())
			cur.Reset()
			continue
		}

		cur.WriteRune(r)
	}

	if cur.Len() > 0 {
		parts = append(parts, cur.String())
	}
	return parts
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
