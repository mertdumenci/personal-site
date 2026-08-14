#!/bin/sh
set -eu

# Assemble a minimal, auditable GitHub Pages artifact with Node.js.
destination=${1:-_site}

if [ -d "$destination" ] && [ -n "$(find "$destination" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
    echo "Destination must be empty: $destination" >&2
    exit 1
fi
mkdir -p "$destination"
for asset in \
    CNAME \
    index.html
do
    cp "$asset" "$destination/$asset"
done

# Remove the local loader itself, not merely the inspector assets it references.
sed -i.bak \
    '/<!-- LOCAL_WATER_CONTROLS_START -->/,/<!-- LOCAL_WATER_CONTROLS_END -->/d' \
    "$destination/index.html"
rm "$destination/index.html.bak"
node scripts/compact-production-assets.mjs . "$destination"

if grep -R -q 'LOCAL_WATER_CONTROLS\|local-water-controls\|water-lab' "$destination"; then
    echo 'Local water tooling leaked into the Pages artifact.' >&2
    exit 1
fi
