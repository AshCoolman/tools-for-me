# Fix Partition Stability

id: 002-fix-partition-stability
source: speckit
lane: @ashcoolman/leaf-toolkit
status: paused

priority: p4
## Intention

1. As the maintainer, when I add 5–50 LOC to a single file already inside a bin, I want the bin's filename identifier to stay the same so the committed LEAF.priority.bin-<id>.md for that bin keeps attaching to the same logical bin without manual rename.

## Signals

