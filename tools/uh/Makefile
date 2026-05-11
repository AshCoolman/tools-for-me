BINARY := uh
GO     := go

.PHONY: all build test clean setup install uninstall

all: build

setup:
	@command -v mise >/dev/null 2>&1 || { echo "Installing mise..."; curl https://mise.run | sh; }
	mise trust --yes
	mise install

build:
	$(GO) build -o $(BINARY) .

test:
	$(GO) test ./...

install: build
	mkdir -p $(HOME)/bin
	install -m 755 $(BINARY) $(HOME)/bin/$(BINARY)

uninstall:
	rm -f $(HOME)/bin/$(BINARY)

clean:
	rm -f $(BINARY)
