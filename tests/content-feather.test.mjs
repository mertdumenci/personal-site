import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
const ocean = await readFile(new URL('../ocean.js', import.meta.url), 'utf8');

assert.match(
    html,
    /href="mailto:mert@dumenci\.me"[^>]*>Email<\/a>/,
    'the Social row must include the established contact address',
);
assert.doesNotMatch(
    css,
    /main::(?:before|after)/,
    'the content feather must not use a quantized translucent CSS compositing layer',
);
assert.match(
    ocean,
    /float contentFeather\(vec2 pixel\)/,
    'the opaque presentation pass must own the elliptical content feather',
);
assert.match(
    ocean,
    /color = mix\(color, backgroundColor, feather\)/,
    'the feather must blend the ocean toward the exact page color',
);
const featherComposite = ocean.indexOf('color = mix(color, backgroundColor, feather)');
const finalDither = ocean.indexOf('ditherNoise(gl_FragCoord.xy) - 0.5');
assert.ok(
    featherComposite >= 0 && finalDither > featherComposite,
    'dithering must happen after feather compositing to break up final output-code bands',
);

console.log('Content feather and contact contract passed.');
