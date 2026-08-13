import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ocean = await readFile(new URL('../ocean.js', import.meta.url), 'utf8');

assert.match(
    ocean,
    /float bandLimit\(float phase\)\s*\{[^}]*fwidth\(phase\)/s,
    'the shader must measure each frequency in screen space',
);

for (const phase of ['phaseA', 'phaseB', 'phaseC', 'phaseD']) {
    assert.match(
        ocean,
        new RegExp(`float weight${phase.at(-1)} = bandLimit\\(${phase}\\)`),
        `${phase} must be band-limited before it affects the surface`,
    );
}

assert.match(
    ocean,
    /float crestWeight = bandLimit\(crestPhase\)/,
    'crest contours must be band-limited independently',
);
assert.match(
    ocean,
    /float ridges = contour\(sin\(crestPhase\), 1\.0\) \* crestWeight/,
    'undersampled crest lines must fade instead of aliasing',
);
assert.match(
    ocean,
    /shoulderSquared \* shoulderBase \* crestWeight/,
    'undersampled crest shoulders must fade with their lines',
);
assert.match(
    ocean,
    /float gradientNoise\(vec2 pixel\)/,
    'smooth shading must include static screen-space dithering',
);
assert.match(
    ocean,
    /gradientNoise\(gl_FragCoord\.xy\)/,
    'dithering must operate at physical-pixel resolution',
);
assert.match(
    ocean,
    /float surfaceDarkness = 0\.195 \* depthFade/,
    'the base surface tone must remain free of broad normal-lighting lobes',
);
assert.doesNotMatch(
    ocean,
    /\b(?:diffuse|specular)\b/,
    'broad lighting fields must not reintroduce amorphous bands',
);

console.log('Ocean screen-space filtering contract passed.');
