#!/bin/bash

set -e

echo "🧹 Cleaning and normalizing LegatePro app structure..."

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Project root: $PROJECT_ROOT"

# 1. If a root-level app/ directory exists, migrate its layout/page to src/app
if [ -d "$PROJECT_ROOT/app" ]; then
  echo "📦 Found root-level app/ directory. Migrating key files to src/app/..."

  mkdir -p "$PROJECT_ROOT/src/app"

  for f in layout.tsx page.tsx; do
    if [ -f "$PROJECT_ROOT/app/$f" ]; then
      echo "→ Moving app/$f to src/app/$f"

      # If src/app/$f already exists and is non-empty, back it up
      if [ -f "$PROJECT_ROOT/src/app/$f" ] && [ -s "$PROJECT_ROOT/src/app/$f" ]; then
        echo "  Backing up existing src/app/$f to src/app/$f.bak"
        cp "$PROJECT_ROOT/src/app/$f" "$PROJECT_ROOT/src/app/$f.bak"
      fi

      mv "$PROJECT_ROOT/app/$f" "$PROJECT_ROOT/src/app/$f"
    fi
  done

  # Keep a backup of the old app directory just in case
  if [ ! -d "$PROJECT_ROOT/app_legacy_backup" ]; then
    echo "📁 Renaming app/ → app_legacy_backup for safety"
    mv "$PROJECT_ROOT/app" "$PROJECT_ROOT/app_legacy_backup"
  else
    echo "⚠️ app_legacy_backup already exists, leaving app/ in place."
  fi
else
  echo "✅ No root-level app/ directory found. Using src/app as the only app root."
fi

# 2. Ensure src/app exists and run scaffold to fill in any missing files
echo "🧱 Ensuring src/app structure via scaffold.sh..."

if [ ! -f "$PROJECT_ROOT/scaffold.sh" ]; then
  echo "❌ scaffold.sh not found in project root. Aborting."
  exit 1
fi

bash "$PROJECT_ROOT/scaffold.sh"

echo ""
echo "✅ Cleanup complete."
echo "Next steps:"
echo "  1. Restart your dev server: npm run dev (or yarn/pnpm equivalent)."
echo "  2. Visit: http://localhost:3000/app/estates"
echo "  3. Open src/app/layout.tsx and src/app/page.tsx to confirm they contain your desired root layout and landing page."