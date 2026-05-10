BIN     := ah
PREFIX  := $(HOME)/bin

.PHONY: build test install uninstall clean

build:
	go build -o $(BIN) .

test:
	go test ./...

install: build
	@mkdir -p $(PREFIX)
	cp $(BIN) $(PREFIX)/$(BIN)
	@echo "installed $(PREFIX)/$(BIN)"

uninstall:
	rm -f $(PREFIX)/$(BIN)
	@echo "removed $(PREFIX)/$(BIN)"

clean:
	rm -f $(BIN)
