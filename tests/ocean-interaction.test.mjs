import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ocean = await readFile(new URL('../ocean.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');

assert.match(ocean, /uniform vec3 pointerState/, 'the GPU shader must receive pointer state');
assert.match(
    ocean,
    /rippleWeight = bandLimit\(ripplePhase\)/,
    'interactive ripples must use the same screen-space antialiasing as the ocean',
);
assert.match(
    ocean,
    /if \(pointerState\.z > 0\.001\)/,
    'idle frames must skip interactive ripple work',
);
assert.match(
    ocean,
    /crestPhase[\s\S]*disturbance \* 0\.62/,
    'pointer input must bend the existing wave crests',
);
assert.match(
    ocean,
    /window\.addEventListener\('pointermove', handlePointerMove, \{ passive: true \}\)/,
    'mouse hover and touch drags must share passive pointer movement',
);
assert.match(
    ocean,
    /window\.addEventListener\('pointerdown', handlePointerDown, \{ passive: true \}\)/,
    'touch contact must start without blocking scrolling',
);
assert.match(
    ocean,
    /window\.addEventListener\('pointercancel', handlePointerEnd, \{ passive: true \}\)/,
    'mobile scrolling must safely cancel an active touch ripple',
);
assert.match(
    ocean,
    /if \(motionQuery\.matches\) \{\s*return;\s*\}/,
    'reduced-motion users must not receive interactive animation',
);
assert.match(css, /\.ocean-canvas\s*\{[^}]*pointer-events:\s*none/s);
assert.doesNotMatch(css, /touch-action:\s*none/, 'the ocean must not disable mobile scrolling');

console.log('Ocean pointer and touch interaction contract passed.');
