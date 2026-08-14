# Personal site

Static personal homepage for [dumenci.me](https://dumenci.me), hosted by GitHub Pages.

## Prerequisites

Any static HTTP server and a modern browser with WebGL 2. The fluid interaction uses floating-point render targets when `EXT_color_buffer_float` is available and otherwise leaves the ocean presentation non-interactive. The source preview has no build or package-install step. Node.js is required for regression tests and the production artifact build; `uv` is required only for the optional image-analysis tool.

## Run locally

From the repository root:

```sh
uv run python -m http.server 8000
```

Then open `http://localhost:8000`.

Docker is not required. If desired, serve the repository with any static web-server image mounted read-only.

## Test

Run the regression suite with:

```sh
node --test tests/*.test.mjs
```

To generate contrast-stretched, high-pass, Sobel-edge, and FFT diagnostic views from a directory of raw ocean PNG captures:

```sh
uv run tools/analyze_ocean.py /path/to/captures
```

## Configuration

There are no environment variables. The `CNAME` file configures the GitHub Pages custom domain. A GitHub Actions workflow tests the site and deploys an explicit four-file artifact from `master`: `CNAME`, `index.html`, `ocean.js`, and `style.css`. The build removes the local-control loader and deployment-only JavaScript documentation comments, then compacts embedded GLSL, CSS, and structural JavaScript/HTML whitespace without obscuring the readable sources; all tuning and diagnostic tools remain available only in source checkouts and local previews.

## Ocean renderer

The ocean uses a 60 Hz procedural presentation shader over a persistent 256×144 shallow-water simulation. The physical solver stays idle while its state is exactly zero, wakes on the first pointer interaction, and then advances at a fixed 120 Hz independently of presentation frames.

The hot path avoids redundant CPU-to-GPU work: one persistent vertex array serves both passes, program/framebuffer/texture/viewport state is cached, stable uniforms upload only when tuning or dimensions change, and ping-pong targets swap without allocating. The presentation shader rejects sky fragments before sampling the simulation texture. It also composites the content feather inside the opaque final pass and applies physical-pixel dithering afterward, avoiding the output quantization rings caused by translucent CSS gradients. Layout updates precompute the feather's pixel transform so the fragment shader does no coordinate division.

## Accessibility

The content uses native landmarks, headings, description lists, and links. Decorative WebGL canvases are excluded from the accessibility tree while their meaningful text remains ordinary HTML. Keyboard focus, increased contrast, forced colors, reduced motion, and reduced transparency receive explicit treatments. The local water controls use native labeled inputs and remain outside the production artifact.

## Project structure

- `index.html` — page content and metadata
- `style.css` — layout, visual styling, and WebKit rubber-band edge colors
- `ocean.js` — optimized WebGL ocean, band-free GPU content feather, and an interaction-activated 120 Hz GPU shallow-water solver; floating-point textures retain height and horizontal momentum while broad pointer-pressure bodies create smooth persistent divots, inject displacement, and transfer velocity
- `water-lab.html`, `water-lab.css`, `water-lab.js` — local production-solver laboratory with repeatable click, hover, mouse-drag, touch-drag, and stress scenarios plus height and velocity views
- `local-water-controls.js`, `local-water-controls.css` — local-only in-page tuning inspector; excluded from the GitHub Pages artifact
- `scripts/build-pages.sh` — assembles and validates the production-only Pages artifact
- `scripts/compact-production-assets.mjs` — removes deployment-only documentation and compacts embedded GLSL, CSS, and structural JavaScript/HTML whitespace without changing runtime tokens
- `tests/initial-render.test.mjs` — first-paint ocean initialization regression test
- `tests/accessibility.test.mjs` — semantic structure, assistive-technology isolation, focus, and user-preference contract
- `tests/content-feather.test.mjs` — opaque final-pass feathering, post-composite dithering, and public contact contract
- `tests/ocean-filtering.test.mjs` — screen-space wave filtering regression test
- `tests/ocean-interaction.test.mjs` — passive pointer and touch interaction regression test
- `tests/water-lab.test.mjs` — visual-harness and production-path regression test
- `tests/local-water-controls.test.mjs` — local-origin gate and inspector-control contract
- `tests/pages-artifact.test.mjs` — proves the deployment contains exactly the four intended production files
- `.github/workflows/pages.yml` — tests, builds, and deploys the isolated Pages artifact
- `tools/analyze_ocean.py` — repeatable visual and frequency-domain artifact audit
- `CNAME` — GitHub Pages custom domain

## Production endpoint

- `https://dumenci.me/` — canonical homepage
- `https://www.dumenci.me/` — redirects to the canonical homepage
