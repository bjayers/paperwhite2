#!/usr/bin/env bash
# Starts the Paper White 2 editor: installs what it needs the first time, builds the page and runs the server.
# Then open http://localhost:7420 in Edge.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then npm install --no-audit --no-fund && touch node_modules; fi
exec npm start
