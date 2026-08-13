#!/bin/sh
set -eu

# Assemble a minimal, auditable GitHub Pages artifact without local tooling.
destination=${1:-_site}

mkdir -p "$destination"
for asset in \
    CNAME \
    index.html \
    ocean.js \
    style.css \
    water-lab.css \
    water-lab.html \
    water-lab.js \
    wave-lab.css \
    wave-lab.html \
    wave-lab.js
do
    cp "$asset" "$destination/$asset"
done

# Remove the local loader itself, not merely the inspector assets it references.
sed -i.bak \
    '/<!-- LOCAL_WATER_CONTROLS_START -->/,/<!-- LOCAL_WATER_CONTROLS_END -->/d' \
    "$destination/index.html"
rm "$destination/index.html.bak"

if find "$destination" -name 'local-water-controls.*' | grep -q .; then
    echo 'Local water controls leaked into the Pages artifact.' >&2
    exit 1
fi
if grep -R -q 'LOCAL_WATER_CONTROLS\|local-water-controls' "$destination"; then
    echo 'A local water controls reference leaked into the Pages artifact.' >&2
    exit 1
fi
