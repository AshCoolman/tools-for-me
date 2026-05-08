package parser

import (
	"strings"
)

type Flag struct {
	Name   string
	Values []string
	IsBool bool
}

type Invocation struct {
	BaseTokens  []string
	Flags       []Flag
	Positionals []string
}

// Parse tokenizes a raw command string into an Invocation.
// baseTokens are stripped from the front (they're the prefix the user searched for).
func Parse(raw string, baseTokens []string) Invocation {
	tokens := tokenize(raw)
	inv := Invocation{}

	// consume base tokens
	skip := len(baseTokens)
	if skip > len(tokens) {
		skip = len(tokens)
	}
	inv.BaseTokens = tokens[:skip]
	tokens = tokens[skip:]

	i := 0
	for i < len(tokens) {
		tok := tokens[i]

		if tok == "--" {
			// everything after -- is positional
			inv.Positionals = append(inv.Positionals, tokens[i+1:]...)
			break
		}

		if strings.HasPrefix(tok, "--") {
			// long flag
			if idx := strings.Index(tok, "="); idx > 0 {
				// --flag=value
				inv.Flags = append(inv.Flags, Flag{
					Name:   tok[:idx],
					Values: []string{tok[idx+1:]},
				})
			} else if i+1 < len(tokens) && !strings.HasPrefix(tokens[i+1], "-") {
				// --flag value (heuristic: next token isn't a flag)
				inv.Flags = append(inv.Flags, Flag{
					Name:   tok,
					Values: []string{tokens[i+1]},
				})
				i++
			} else {
				// --flag (boolean)
				inv.Flags = append(inv.Flags, Flag{
					Name:   tok,
					IsBool: true,
				})
			}
			i++
			continue
		}

		if strings.HasPrefix(tok, "-") && len(tok) > 1 {
			// short flag(s)
			chars := tok[1:]

			if len(chars) == 1 {
				// single short flag: -v, -H, etc
				if i+1 < len(tokens) && !strings.HasPrefix(tokens[i+1], "-") {
					inv.Flags = append(inv.Flags, Flag{
						Name:   tok,
						Values: []string{tokens[i+1]},
					})
					i++
				} else {
					inv.Flags = append(inv.Flags, Flag{
						Name:   tok,
						IsBool: true,
					})
				}
			} else {
				// combined short flags: -abc or -sH with possible value
				// heuristic: last char may take a value, all preceding are bool
				last := chars[len(chars)-1:]
				preceding := chars[:len(chars)-1]

				for _, c := range preceding {
					inv.Flags = append(inv.Flags, Flag{
						Name:   "-" + string(c),
						IsBool: true,
					})
				}

				lastFlag := "-" + last
				if i+1 < len(tokens) && !strings.HasPrefix(tokens[i+1], "-") {
					inv.Flags = append(inv.Flags, Flag{
						Name:   lastFlag,
						Values: []string{tokens[i+1]},
					})
					i++
				} else {
					inv.Flags = append(inv.Flags, Flag{
						Name:   lastFlag,
						IsBool: true,
					})
				}
			}
			i++
			continue
		}

		// positional
		inv.Positionals = append(inv.Positionals, tok)
		i++
	}

	return inv
}

// tokenize splits a command string respecting quotes.
func tokenize(s string) []string {
	var tokens []string
	var current strings.Builder
	inSingle := false
	inDouble := false
	escaped := false

	for _, r := range s {
		if escaped {
			current.WriteRune(r)
			escaped = false
			continue
		}

		if r == '\\' && !inSingle {
			escaped = true
			current.WriteRune(r)
			continue
		}

		if r == '\'' && !inDouble {
			inSingle = !inSingle
			current.WriteRune(r)
			continue
		}

		if r == '"' && !inSingle {
			inDouble = !inDouble
			current.WriteRune(r)
			continue
		}

		if (r == ' ' || r == '\t') && !inSingle && !inDouble {
			if current.Len() > 0 {
				tokens = append(tokens, current.String())
				current.Reset()
			}
			continue
		}

		current.WriteRune(r)
	}

	if current.Len() > 0 {
		tokens = append(tokens, current.String())
	}

	return tokens
}
