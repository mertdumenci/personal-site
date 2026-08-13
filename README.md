# Personal site

Static personal homepage for [dumenci.me](https://dumenci.me), hosted by GitHub Pages.

## Prerequisites

Any static HTTP server and a modern browser with WebGL 2. The fluid interaction uses floating-point render targets when `EXT_color_buffer_float` is available and otherwise leaves the ocean presentation non-interactive. The site has no build or package-install step. Node.js is required only for regression tests, and `uv` is required only for the optional image-analysis tool.

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

There are no environment variables. The `CNAME` file configures the GitHub Pages custom domain. A GitHub Actions workflow tests the site and deploys an explicit artifact from `master`. The artifact build removes the local water-control loader and excludes its JavaScript and CSS, so those tools exist only in source checkouts and local previews.

## Project structure

- `index.html` — page content and metadata
- `style.css` — layout, visual styling, and WebKit rubber-band edge colors
- `ocean.js` — WebGL ocean plus a 120 Hz, GPU-only shallow-water solver; floating-point textures retain height and horizontal momentum while broad pointer-pressure bodies create smooth persistent divots, inject displacement, and transfer velocity
- `wave-lab.html`, `wave-lab.css`, `wave-lab.js` — interactive eight-variant visualization study
- `water-lab.html`, `water-lab.css`, `water-lab.js` — production-solver laboratory with repeatable click, hover, mouse-drag, touch-drag, and stress scenarios plus height and velocity views
- `local-water-controls.js`, `local-water-controls.css` — local-only in-page tuning inspector; excluded from the GitHub Pages artifact
- `scripts/build-pages.sh` — assembles and validates the production-only Pages artifact
- `tests/initial-render.test.mjs` — first-paint ocean initialization regression test
- `tests/ocean-filtering.test.mjs` — screen-space wave filtering regression test
- `tests/ocean-interaction.test.mjs` — passive pointer and touch interaction regression test
- `tests/water-lab.test.mjs` — visual-harness and production-path regression test
- `tests/local-water-controls.test.mjs` — local-origin gate and inspector-control contract
- `tests/pages-artifact.test.mjs` — proves local tuning assets and references cannot enter deployment
- `.github/workflows/pages.yml` — tests, builds, and deploys the isolated Pages artifact
- `tools/analyze_ocean.py` — repeatable visual and frequency-domain artifact audit
- `CNAME` — GitHub Pages custom domain

## Endpoints

- `https://dumenci.me/` — canonical homepage
- `https://www.dumenci.me/` — redirects to the canonical homepage
- `https://dumenci.me/wave-lab.html` — generative visualization study
- `https://dumenci.me/water-lab.html` — shallow-water solver tuning and performance laboratory
