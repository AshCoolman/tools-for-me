package helpparse

import (
	"testing"
)

const dockerRunHelp = `Usage:  docker run [OPTIONS] IMAGE [COMMAND] [ARG...]

Create and run a new container from an image

Aliases:
  docker container run, docker run

Options:
      --add-host list                    Add a custom host-to-IP mapping
                                         (host:ip)
  -a, --attach list                      Attach to STDIN, STDOUT or STDERR
  -d, --detach                           Run container in background and
                                         print container ID
  -e, --env list                         Set environment variables
  -h, --hostname string                  Container host name
  -i, --interactive                      Keep STDIN open even if not attached
  -m, --memory bytes                     Memory limit
  -p, --publish list                     Publish a container's port(s) to
                                         the host
  -P, --publish-all                      Publish all exposed ports to
                                         random ports
      --rm                               Automatically remove the
                                         container and its associated
                                         anonymous volumes when it exits
  -t, --tty                              Allocate a pseudo-TTY
  -v, --volume list                      Bind mount a volume
  -w, --workdir string                   Working directory inside the
                                         container
`

const curlHelp = `Usage: curl [options...] <url>
 -d, --data <data>           HTTP POST data
 -f, --fail                  Fail fast with no output on HTTP errors
 -h, --help <category>       Get help for commands
 -i, --include               Include response headers in output
 -o, --output <file>         Write to file instead of stdout
 -O, --remote-name           Write output to file named as remote file
 -s, --silent                Silent mode
 -T, --upload-file <file>    Transfer local FILE to destination
 -u, --user <user:password>  Server user and password
 -A, --user-agent <name>     Send User-Agent <name> to server
 -v, --verbose               Make the operation more talkative
 -V, --version               Show version number and quit
`

const claudeHelp = `Usage: claude [options] [command] [prompt]

Options:
  --add-dir <directories...>                        Additional directories to allow tool access to
  --allowedTools, --allowed-tools <tools...>         Comma or space-separated list of tool names
  --bare                                            Minimal mode: skip hooks
  -c, --continue                                    Continue the most recent conversation
  --dangerously-skip-permissions                    Bypass all permission checks
  -d, --debug [filter]                              Enable debug mode
  -h, --help                                        Display help for command
  --model <model>                                   Model for the current session
  -p, --print                                       Print response and exit
  --resume <id>                                     Resume a specific session by ID
  --version                                         Show version number and exit
`

func TestDockerRunFlags(t *testing.T) {
	info := Parse(dockerRunHelp)

	if len(info.Flags) == 0 {
		t.Fatal("expected flags from docker run --help")
	}

	tests := []struct {
		long   string
		short  string
		isBool bool
	}{
		{"--rm", "", true},
		{"--tty", "-t", true},
		{"--detach", "-d", true},
		{"--interactive", "-i", true},
		{"--publish", "-p", false},
		{"--volume", "-v", false},
		{"--env", "-e", false},
		{"--workdir", "-w", false},
		{"--add-host", "", false},
		{"--hostname", "-h", false},
		{"--publish-all", "-P", true},
	}

	for _, tt := range tests {
		t.Run(tt.long, func(t *testing.T) {
			f := findFlag(info.Flags, tt.long)
			if f == nil {
				t.Fatalf("%s not found", tt.long)
			}
			if f.Short != tt.short {
				t.Errorf("short = %q, want %q", f.Short, tt.short)
			}
			if f.IsBool != tt.isBool {
				t.Errorf("isBool = %v, want %v", f.IsBool, tt.isBool)
			}
		})
	}
}

func TestDockerRunFlagDescriptions(t *testing.T) {
	info := Parse(dockerRunHelp)

	rm := findFlag(info.Flags, "--rm")
	if rm == nil {
		t.Fatal("--rm not found")
	}
	if rm.Description == "" {
		t.Error("--rm should have a description")
	}
}

func TestCurlFlags(t *testing.T) {
	info := Parse(curlHelp)

	if len(info.Flags) == 0 {
		t.Fatal("expected flags from curl --help")
	}

	tests := []struct {
		long   string
		short  string
		isBool bool
	}{
		{"--data", "-d", false},
		{"--fail", "-f", true},
		{"--output", "-o", false},
		{"--silent", "-s", true},
		{"--verbose", "-v", true},
		{"--version", "-V", true},
		{"--upload-file", "-T", false},
		{"--user", "-u", false},
	}

	for _, tt := range tests {
		t.Run(tt.long, func(t *testing.T) {
			f := findFlag(info.Flags, tt.long)
			if f == nil {
				t.Fatalf("%s not found", tt.long)
			}
			if f.Short != tt.short {
				t.Errorf("short = %q, want %q", f.Short, tt.short)
			}
			if f.IsBool != tt.isBool {
				t.Errorf("isBool = %v, want %v", f.IsBool, tt.isBool)
			}
		})
	}
}

func TestCurlValueTypes(t *testing.T) {
	info := Parse(curlHelp)

	data := findFlag(info.Flags, "--data")
	if data == nil {
		t.Fatal("--data not found")
	}
	if data.ValueType != "<data>" {
		t.Errorf("--data valueType = %q, want <data>", data.ValueType)
	}

	output := findFlag(info.Flags, "--output")
	if output == nil {
		t.Fatal("--output not found")
	}
	if output.ValueType != "<file>" {
		t.Errorf("--output valueType = %q, want <file>", output.ValueType)
	}
}

func TestClaudeFlags(t *testing.T) {
	info := Parse(claudeHelp)

	if len(info.Flags) == 0 {
		t.Fatal("expected flags from claude --help")
	}

	tests := []struct {
		long   string
		isBool bool
	}{
		{"--bare", true},
		{"--continue", true},
		{"--dangerously-skip-permissions", true},
		{"--help", true},
		{"--model", false},
		{"--print", true},
		{"--resume", false},
		{"--version", true},
	}

	for _, tt := range tests {
		t.Run(tt.long, func(t *testing.T) {
			f := findFlag(info.Flags, tt.long)
			if f == nil {
				t.Fatalf("%s not found", tt.long)
			}
			if f.IsBool != tt.isBool {
				t.Errorf("isBool = %v, want %v", f.IsBool, tt.isBool)
			}
		})
	}
}

func TestNoDuplicateFlags(t *testing.T) {
	for _, help := range []string{dockerRunHelp, curlHelp, claudeHelp} {
		info := Parse(help)
		seen := map[string]bool{}
		for _, f := range info.Flags {
			name := f.Name()
			if seen[name] {
				t.Errorf("duplicate flag %s", name)
			}
			seen[name] = true
		}
	}
}

func TestEmptyInput(t *testing.T) {
	info := Parse("")
	if len(info.Flags) != 0 {
		t.Error("expected no flags from empty input")
	}
	if len(info.Subcommands) != 0 {
		t.Error("expected no subcommands from empty input")
	}
}

const gitHelp = `usage: git [-v | --version] [-h | --help] [-C <path>]
           <command> [<args>]

These are common Git commands used in various situations:

start a working area (see also: git help tutorial)
   clone      Clone a repository into a new directory
   init       Create an empty Git repository or reinitialize an existing one

work on the current change (see also: git help everyday)
   add        Add file contents to the index
   mv         Move or rename a file, a directory, or a symlink
   restore    Restore working tree files
   rm         Remove files from the working tree and from the index

examine the history and state (see also: git help revisions)
   bisect     Use binary search to find the commit that introduced a bug
   diff       Show changes between commits, commit and working tree, etc
   grep       Print lines matching a pattern
   log        Show commit logs
   show       Show various types of objects
   status     Show the working tree status

grow, mark and tweak your common history
   branch     List, create, or delete branches
   commit     Record changes to the repository
   merge      Join two or more development histories together
   rebase     Reapply commits on top of another base tip
   reset      Set HEAD or the index to a known state
   switch     Switch branches
   tag        Create, list, delete or verify tags

collaborate (see also: git help workflows)
   fetch      Download objects and refs from another repository
   pull       Fetch from and integrate with another repository or a local branch
   push       Update remote refs along with associated objects
`

func TestGitSubcommands(t *testing.T) {
	info := Parse(gitHelp)

	if len(info.Subcommands) == 0 {
		t.Fatal("expected subcommands from git --help")
	}

	want := []string{
		"clone", "init", "add", "mv", "restore", "rm",
		"bisect", "diff", "grep", "log", "show", "status",
		"branch", "commit", "merge", "rebase", "reset", "switch", "tag",
		"fetch", "pull", "push",
	}

	for _, name := range want {
		found := false
		for _, s := range info.Subcommands {
			if s.Name == name {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("subcommand %q not found", name)
		}
	}
}

func TestGitSubcommandDescriptions(t *testing.T) {
	info := Parse(gitHelp)

	for _, s := range info.Subcommands {
		if s.Description == "" {
			t.Errorf("subcommand %q has no description", s.Name)
		}
	}
}

const dockerHelp = `Usage:  docker [OPTIONS] COMMAND

A self-sufficient runtime for containers

Common Commands:
  run         Create and run a new container
  exec        Execute a command in a running container
  ps          List containers
  build       Build an image from a Dockerfile
  pull        Download an image from a registry
  push        Upload an image to a registry
  images      List images
  login       Authenticate to a registry
  logout      Log out from a registry
  search      Search Docker Hub for images
  version     Show the Docker version information
  info        Display system-wide information

Management Commands:
  builder     Manage builds
  compose     Docker Compose
  container   Manage containers
  image       Manage images
  network     Manage networks
  volume      Manage volumes
`

func TestDockerSubcommands(t *testing.T) {
	info := Parse(dockerHelp)

	if len(info.Subcommands) == 0 {
		t.Fatal("expected subcommands from docker --help")
	}

	want := []string{"run", "exec", "ps", "build", "pull", "push", "images"}
	for _, name := range want {
		found := false
		for _, s := range info.Subcommands {
			if s.Name == name {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("subcommand %q not found", name)
		}
	}
}

func findFlag(flags []Flag, long string) *Flag {
	for i := range flags {
		if flags[i].Long == long {
			return &flags[i]
		}
	}
	return nil
}
