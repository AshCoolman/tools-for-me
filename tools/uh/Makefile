BINARY := uh
GO     := go

.PHONY: all build test clean setup

all: build

setup:
	@command -v mise >/dev/null 2>&1 || { echo "Installing mise..."; curl https://mise.run | sh; }
	mise trust --yes
	mise install

build:
	$(GO) build -o $(BINARY) .

test:
	$(GO) test ./...

clean:
	rm -f $(BINARY)
