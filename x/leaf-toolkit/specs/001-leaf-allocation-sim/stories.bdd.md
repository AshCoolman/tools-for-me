```gherkin
Given any synthetic source tree built from a fixed seed,
And a sequence of mutations like add file, grow file, rename, or move,
When the harness partitions, mutates, re-partitions, and allocates K agents across the resulting leaves under round-robin, random-uniform, or priority-weighted strategies,
Then it answers four questions deterministically:
  do two leaves share one file (safety),
  which files crossed leaf or bin boundaries between runs (drift),
  which agents collide on shared file sets (collision),
  and how balanced are leaves by LOC and file count (equality),
And it renders an ASCII tree visualisation plus a complete baseline against the leaf-toolkit's src/.
```
