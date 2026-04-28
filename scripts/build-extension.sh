#!/usr/bin/env bash
set -euo pipefail

echo "[1/7] Cleaning extension/ and out/ ..."
rm -rf extension out
mkdir -p extension

echo "[2/7] Building Next.js static export ..."
NEXT_PUBLIC_STATIC_EXPORT=true npx next build

echo "[3/7] Copying build output to extension/ ..."
cp -r out/. extension/

echo "[4/7] Renaming _next/ -> next_static/ (Chrome extension filename restriction) ..."
mv extension/_next extension/next_static
python3 - <<'PYEOF'
import os

for root, dirs, files in os.walk('extension'):
    for fname in files:
        if not fname.endswith(('.html', '.js', '.css')):
            continue
        fpath = os.path.join(root, fname)
        try:
            with open(fpath, 'r', encoding='utf-8') as f:
                content = f.read()
            new_content = content.replace('/_next/', '/next_static/')
            if new_content != content:
                with open(fpath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
        except UnicodeDecodeError:
            pass  # skip binary files
PYEOF

echo "[5/7] Removing remaining underscore-prefixed files/dirs (Chrome restriction) ..."
python3 - <<'PYEOF'
import os, shutil

for entry in os.listdir('extension'):
    if entry.startswith('_'):
        path = os.path.join('extension', entry)
        if os.path.isdir(path):
            shutil.rmtree(path)
            print(f"  Removed dir:  {path}")
        else:
            os.remove(path)
            print(f"  Removed file: {path}")
PYEOF

echo "[6/7] Extracting inline scripts to external files (MV3 CSP requires 'self' only) ..."
python3 - <<'PYEOF'
import re, os

html_path = 'extension/index.html'
with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

counter = [0]

def replace_inline(match):
    attrs = match.group(1)
    script_content = match.group(2)
    if not script_content.strip():
        return match.group(0)
    counter[0] += 1
    filename = f'inline-{counter[0]}.js'
    filepath = os.path.join('extension', filename)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(script_content)
    return f'<script src="/{filename}"{attrs}></script>'

pattern = re.compile(r'<script(?![^>]*\bsrc=)([^>]*)>(.*?)</script>', re.DOTALL)
new_content = pattern.sub(replace_inline, content)

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"Extracted {counter[0]} inline script(s) to external file(s).")
PYEOF

echo "[7/7] Copying manifest.json ..."
cp extension-src/manifest.json extension/manifest.json

if [ -d extension-src/icons ]; then
  cp -r extension-src/icons extension/icons
fi

echo "Done. Load 'extension/' in chrome://extensions (Developer mode)."
