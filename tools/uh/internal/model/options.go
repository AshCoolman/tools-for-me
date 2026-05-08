package model

import (
	"sort"

	"github.com/AshCoolman/uh/internal/parser"
)

type Ranked struct {
	Text  string
	Count int
}

type RankedFlag struct {
	Name       string
	Count      int
	IsBool     bool
	Repeatable bool
	Values     []Ranked
}

type OptionSpace struct {
	Flags       []RankedFlag
	Positionals []Ranked
}

// Build aggregates parsed invocations into a deduplicated, frequency-ranked option space.
func Build(invocations []parser.Invocation) OptionSpace {
	flagIndex := map[string]*flagAccum{}
	var flagOrder []string
	posCount := map[string]int{}

	for _, inv := range invocations {
		seenInThisInv := map[string]int{}

		for _, f := range inv.Flags {
			acc, ok := flagIndex[f.Name]
			if !ok {
				acc = &flagAccum{name: f.Name}
				flagIndex[f.Name] = acc
				flagOrder = append(flagOrder, f.Name)
			}
			acc.count++

			seenInThisInv[f.Name]++

			if f.IsBool {
				acc.boolCount++
			} else {
				acc.valueCount++
				for _, v := range f.Values {
					acc.addValue(v)
				}
			}
		}

		// detect repeatable: same flag appeared 2+ times in one invocation
		for name, n := range seenInThisInv {
			if n >= 2 {
				flagIndex[name].repeatable = true
			}
		}

		for _, p := range inv.Positionals {
			posCount[p]++
		}
	}

	space := OptionSpace{}

	for _, name := range flagOrder {
		acc := flagIndex[name]
		// heuristic: if the flag was seen as bool more often than with
		// values, it's bool — the "values" were likely positional args
		// the parser couldn't distinguish without --help knowledge
		isBool := acc.boolCount > acc.valueCount
		rf := RankedFlag{
			Name:       name,
			Count:      acc.count,
			IsBool:     isBool,
			Repeatable: acc.repeatable,
		}

		if len(acc.values) > 0 {
			for val, cnt := range acc.values {
				rf.Values = append(rf.Values, Ranked{Text: val, Count: cnt})
			}
			sort.Slice(rf.Values, func(i, j int) bool {
				return rf.Values[i].Count > rf.Values[j].Count
			})
		}

		space.Flags = append(space.Flags, rf)
	}

	// sort flags by frequency
	sort.Slice(space.Flags, func(i, j int) bool {
		return space.Flags[i].Count > space.Flags[j].Count
	})

	for text, cnt := range posCount {
		space.Positionals = append(space.Positionals, Ranked{Text: text, Count: cnt})
	}
	sort.Slice(space.Positionals, func(i, j int) bool {
		return space.Positionals[i].Count > space.Positionals[j].Count
	})

	return space
}

type flagAccum struct {
	name       string
	count      int
	boolCount  int
	valueCount int
	repeatable bool
	values     map[string]int
}

func (a *flagAccum) addValue(v string) {
	if a.values == nil {
		a.values = map[string]int{}
	}
	a.values[v]++
}
