import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');

assert.match(
    html,
    /href="mailto:mert@dumenci\.me"[^>]*>Email<\/a>/,
    'the Social row must include the established contact address',
);
assert.match(css, /main::after\s*\{[^}]*feTurbulence/s, 'the feather must have stable micro-dither');
assert.match(
    css,
    /main::after\s*\{[^}]*mask-image:\s*radial-gradient/s,
    'dither must remain confined to the elliptical transition',
);
assert.match(
    css,
    /main::after\s*\{[^}]*pointer-events:\s*none/s,
    'the visual correction must not interfere with content interaction',
);

console.log('Content feather and contact contract passed.');
