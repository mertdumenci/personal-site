#!/bin/sh
set -eu

# Derive the deployed cache stamp for an asset: the first 10 hex characters
# of its SHA-256 content hash.
stamp_for() {
    node -p 'require("node:crypto").createHash("sha256").update(require("node:fs").readFileSync(process.argv[1])).digest("hex").slice(0, 10)' "$1"
}

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

# Stamp the deployed references with the compacted assets' content hashes so
# a changed asset always changes its deployed URL.
ocean_stamp=$(stamp_for "$destination/ocean.js")
style_stamp=$(stamp_for "$destination/style.css")
# The [^"]" bracket expression avoids embedding a literal single quote in the
# pattern; the hex stamps cannot contain a delimiter, so substitution is safe.
sed -i.bak -E "s/(ocean\.js\?v=)[^\"& \t]*/\1${ocean_stamp}/g; s/(style\.css\?v=)[^\"& \t]*/\1${style_stamp}/g" \
    "$destination/index.html"
rm "$destination/index.html.bak"

if grep -R -q 'LOCAL_WATER_CONTROLS\|local-water-controls\|water-lab' "$destination"; then
    echo 'Local water tooling leaked into the Pages artifact.' >&2
    exit 1
fi
