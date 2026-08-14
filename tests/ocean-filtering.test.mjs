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
assert.doesNotMatch(
    ocean,
    /\bshoulder(?:s|Base|Squared)?\b/,
    'broad crest halos must not reintroduce amorphous bands',
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
    /vec3 color = mix\(backgroundColor, lineColor, alpha \* 0\.92\)/,
    'the shader must composite the ocean once in final display space',
);
assert.match(
    ocean,
    /gradientNoise\(gl_FragCoord\.xy\) - 0\.5\) \/ 255\.0/,
    'final display colors must be dithered by one output-code step',
);
assert.match(
    ocean,
    /alpha: false/,
    'the canvas must avoid a second transparent compositing pass',
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

const horizonDiscard = ocean.indexOf('if (uv.y > horizon)');
const disturbanceSample = ocean.indexOf(
    'float disturbance = texture(disturbanceMap, uv).r',
);
assert.ok(horizonDiscard >= 0, 'the presentation shader must cull sky fragments');
assert.ok(
    disturbanceSample > horizonDiscard,
    'normal rendering must reject sky fragments before sampling the simulation texture',
);

console.log('Ocean screen-space filtering contract passed.');
