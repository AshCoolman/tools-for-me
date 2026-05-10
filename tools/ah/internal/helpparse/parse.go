package helpparse

import (
	"regexp"
	"strings"
)

type Flag struct {
	Short       string
	Long        string
	ValueType   string
	Description string
	IsBool      bool
}

func (f Flag) Name() string {
	if f.Long != "" {
		return f.Long
	}
	return f.Short
}

type Subcommand struct {
	Name        string
	Description string
}

type HelpInfo struct {
	Flags       []Flag
	Subcommands []Subcommand
}

func Parse(text string) HelpInfo {
	var h HelpInfo
	h.Flags = parseFlags(text)
	h.Subcommands = parseSubcommands(text)
	return h
}

// Matches lines like:
//   -v, --verbose               Make the operation more talkative
//       --add-host list         Add a custom host-to-IP mapping
//   -d, --data <data>           HTTP POST data
//   -f, --fail                  Fail fast with no output on HTTP errors
//       --rm                    Automatically remove the container
//   -t, --tty                   Allocate a pseudo-TTY
var (
	// -s, --long-flag <type>  description
	// -s, --long-flag type    description
	reShortLong = regexp.MustCompile(`^\s+(-\w),?\s+(--[\w][\w.-]*)(?:\s+(\S+))?\s{2,}(.+)`)

	// --long-flag <type>  description
	// --long-flag type    description
	// --long-flag         description
	reLongOnly = regexp.MustCompile(`^\s+(--[\w][\w.-]*)(?:\s+(\S+))?\s{2,}(.+)`)

	// -s <type>  description  (short-only with value)
	// -s         description  (short-only bool)
	reShortOnly = regexp.MustCompile(`^\s+(-\w)(?:\s+(\S+))?\s{2,}(.+)`)
)

var boolTypes = map[string]bool{
	"": true,
}

func isValueType(s string) bool {
	if s == "" {
		return false
	}
	s = strings.ToLower(s)
	if strings.HasPrefix(s, "<") || strings.HasPrefix(s, "[") {
		return true
	}
	knownTypes := []string{
		"string", "int", "uint", "uint16", "float", "decimal",
		"list", "map", "duration", "bytes", "mount", "network",
		"ip", "ulimit", "gpu-request", "value",
	}
	for _, t := range knownTypes {
		if s == t {
			return true
		}
	}
	return false
}

func parseFlags(text string) []Flag {
	lines := strings.Split(text, "\n")
	var flags []Flag
	seen := map[string]bool{}

	for _, line := range lines {
		if m := reShortLong.FindStringSubmatch(line); m != nil {
			short, long, valType, desc := m[1], m[2], m[3], m[4]
			isBool := !isValueType(valType)
			if isBool && valType != "" {
				desc = valType + " " + desc
				valType = ""
			}
			key := long
			if seen[key] {
				continue
			}
			seen[key] = true
			flags = append(flags, Flag{
				Short:       short,
				Long:        long,
				ValueType:   valType,
				Description: strings.TrimSpace(desc),
				IsBool:      isBool,
			})
			continue
		}

		if m := reLongOnly.FindStringSubmatch(line); m != nil {
			long, valType, desc := m[1], m[2], m[3]
			isBool := !isValueType(valType)
			if isBool && valType != "" {
				desc = valType + " " + desc
				valType = ""
			}
			key := long
			if seen[key] {
				continue
			}
			seen[key] = true
			flags = append(flags, Flag{
				Long:        long,
				ValueType:   valType,
				Description: strings.TrimSpace(desc),
				IsBool:      isBool,
			})
			continue
		}

		if m := reShortOnly.FindStringSubmatch(line); m != nil {
			short, valType, desc := m[1], m[2], m[3]
			isBool := !isValueType(valType)
			if isBool && valType != "" {
				desc = valType + " " + desc
				valType = ""
			}
			key := short
			if seen[key] {
				continue
			}
			seen[key] = true
			flags = append(flags, Flag{
				Short:       short,
				ValueType:   valType,
				Description: strings.TrimSpace(desc),
				IsBool:      isBool,
			})
			continue
		}
	}

	return flags
}

// Matches lines like:
//    clone      Clone a repository into a new directory
//    init       Create an empty Git repository
var reSubcmd = regexp.MustCompile(`^\s{2,}([\w][\w-]*)\s{2,}(.+)`)

func parseSubcommands(text string) []Subcommand {
	lines := strings.Split(text, "\n")
	var subs []Subcommand
	seen := map[string]bool{}

	inSection := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		if trimmed == "" {
			continue
		}

		// detect section headers that typically precede subcommand lists
		if strings.HasSuffix(trimmed, ":") && !strings.HasPrefix(trimmed, "-") {
			lower := strings.ToLower(trimmed)
			if strings.Contains(lower, "command") ||
				strings.Contains(lower, "working area") ||
				strings.Contains(lower, "current change") ||
				strings.Contains(lower, "history") ||
				strings.Contains(lower, "collaborate") ||
				strings.Contains(lower, "grow") ||
				strings.Contains(lower, "examine") {
				inSection = true
				continue
			}
			// "Options:", "Aliases:", "Usage:" etc → not subcommands
			if strings.Contains(lower, "option") ||
				strings.Contains(lower, "alias") ||
				strings.Contains(lower, "usage") ||
				strings.Contains(lower, "flag") {
				inSection = false
				continue
			}
			// other section headers in git-style output
			if !strings.Contains(trimmed, " ") || strings.HasSuffix(lower, "situations):") {
				inSection = true
				continue
			}
		}

		if !inSection {
			continue
		}

		if m := reSubcmd.FindStringSubmatch(line); m != nil {
			name, desc := m[1], strings.TrimSpace(m[2])
			if seen[name] {
				continue
			}
			// skip things that look like flags, continuation lines, or noise
			if strings.HasPrefix(name, "-") {
				continue
			}
			seen[name] = true
			subs = append(subs, Subcommand{Name: name, Description: desc})
		}
	}

	return subs
}
