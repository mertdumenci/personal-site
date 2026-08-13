# Personal site

Static personal homepage for [dumenci.me](https://dumenci.me), hosted by GitHub Pages.

## Prerequisites

Any static HTTP server or a modern web browser. The site itself has no build or package-install step. Node.js is required only for regression tests, and `uv` is required only for the optional image-analysis tool.

## Run locally

From the repository root:

```sh
ruby -run -e httpd . -p 8000
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

There are no environment variables. The `CNAME` file configures the GitHub Pages custom domain. Deployment uses the `master` branch through GitHub Pages.

## Project structure

- `index.html` — page content and metadata
- `style.css` — layout and visual styling
- `ocean.js` — screen-space-filtered WebGL ocean with a persistent GPU finite-difference height field for pointer and touch disturbance
- `wave-lab.html`, `wave-lab.css`, `wave-lab.js` — interactive eight-variant visualization study
- `tests/initial-render.test.mjs` — first-paint ocean initialization regression test
- `tests/ocean-filtering.test.mjs` — screen-space wave filtering regression test
- `tests/ocean-interaction.test.mjs` — passive pointer and touch interaction regression test
- `tools/analyze_ocean.py` — repeatable visual and frequency-domain artifact audit
- `CNAME` — GitHub Pages custom domain

## Endpoints

- `https://dumenci.me/` — canonical homepage
- `https://www.dumenci.me/` — redirects to the canonical homepage
- `https://dumenci.me/wave-lab.html` — generative visualization study
