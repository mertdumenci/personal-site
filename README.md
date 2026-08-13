# Personal site

Static personal homepage for [dumenci.me](https://dumenci.me), hosted by GitHub Pages.

## Prerequisites

Any static HTTP server or a modern web browser. No build tool or package installation is required.

## Run locally

From the repository root:

```sh
ruby -run -e httpd . -p 8000
```

Then open `http://localhost:8000`.

Docker is not required. If desired, serve the repository with any static web-server image mounted read-only.

## Configuration

There are no environment variables. The `CNAME` file configures the GitHub Pages custom domain. Deployment uses the `master` branch through GitHub Pages.

## Project structure

- `index.html` — page content and metadata
- `style.css` — layout and visual styling
- `CNAME` — GitHub Pages custom domain

## Endpoints

- `https://dumenci.me/` — canonical homepage
- `https://www.dumenci.me/` — redirects to the canonical homepage
