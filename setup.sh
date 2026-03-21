#!/bin/bash
set -e

echo ""
echo "  Takeout Viewer — Setup"
echo "  ─────────────────────────────────────"

# Check Node.js
if ! command -v node &> /dev/null; then
  echo ""
  echo "  ✗ Node.js is not installed."
  echo "    Download it from: https://nodejs.org"
  echo "    Install v18 or newer, then re-run this script."
  echo ""
  exit 1
fi

NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
echo "  ✓ Node.js $NODE_VER found"

# Install dependencies
echo ""
echo "  Installing dependencies..."
npm install

# Start
echo ""
echo "  ─────────────────────────────────────"
echo "  Open http://localhost:3000 in your browser"
echo "  (Press Ctrl+C to stop the server)"
echo "  ─────────────────────────────────────"
echo ""
npm start
