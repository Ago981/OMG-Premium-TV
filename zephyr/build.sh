#!/bin/sh
# Builds the Zephyr TV extension: dist-zephyr/omg-premium-tv-zephyr.zip and the manifest-zephyrtv.json that
# publishes it (Zephyr TV installs it from that file's address, and checks the package's SHA-256).
set -e
cd "$(dirname "$0")"
out=../dist-zephyr
rm -rf "$out" && mkdir -p "$out"
zip -q -X "$out/omg-premium-tv-zephyr.zip" manifest.json main.js icon.png
sha=$(shasum -a 256 "$out/omg-premium-tv-zephyr.zip" | cut -d' ' -f1)
node -e '
const m = require("./manifest.json");
const out = { zephyr: m.zephyr, id: m.id, version: m.version, name: m.name, description: m.description, author: m.author,
  icon: "https://raw.githubusercontent.com/mccoy88f/OMG-Premium-TV/main/tv.png", package: "omg-premium-tv-zephyr.zip", sha256: process.argv[1] };
require("fs").writeFileSync(process.argv[2], JSON.stringify(out, null, 2) + "\n");
' "$sha" "$out/manifest-zephyrtv.json"
node --check main.js
echo "$out/omg-premium-tv-zephyr.zip ($sha)"
