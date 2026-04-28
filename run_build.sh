#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

# Move app/, components/, lib/ into src/
if [ ! -d src ]; then
  mkdir src
fi

for dir in app components lib; do
  if [ -d "$dir" ]; then
    mv "$dir" src/
    echo "Moved $dir -> src/$dir"
  fi
done

echo "Done. Run 'npm run dev' to start the dev server."
