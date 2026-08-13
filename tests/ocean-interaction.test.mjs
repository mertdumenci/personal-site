import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ocean = await readFile(new URL('../ocean.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');

assert.match(
    ocean,
    /uniform sampler2D disturbanceMap/,
    'the ocean shader must sample persistent simulated water state',
);
assert.match(
    ocean,
    /uniform sampler2D previousState/,
    'the simulation pass must read its preceding height field',
);
assert.match(
    ocean,
    /gl\.getExtension\('EXT_color_buffer_float'\)/,
    'the physical simulation must use renderable floating-point state',
);
assert.match(
    ocean,
    /float laplacian = left \+ right \+ below \+ above - 4\.0 \* current/,
    'the height field must propagate through a finite-difference Laplacian',
);
assert.match(
    ocean,
    /2\.0 \* current - previous \+ laplacian \* 0\.34\) \* 0\.9984/,
    'the simulation must carry momentum forward with gradual damping',
);
assert.match(
    ocean,
    /\[simulation\.read, simulation\.write\] = \[simulation\.write, simulation\.read\]/,
    'the GPU simulation must preserve state through ping-pong framebuffers',
);
assert.match(
    ocean,
    /crestPhase[\s\S]*disturbance \* 4\.8/,
    'simulated height must bend the existing wave crests',
);
assert.doesNotMatch(
    ocean,
    /uniform vec3 pointerState/,
    'the render pass must not draw a pointer-centered procedural ripple',
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
    /if \(!simulation \|\| motionQuery\.matches\) \{/,
    'reduced-motion users must not receive interactive animation',
);
assert.match(
    ocean,
    /function handlePointerEnd\(event\) \{\s*pointerPositions\.delete\(event\.pointerId\);\s*\}/,
    'lifting a pointer must release input without clearing water state',
);
assert.match(css, /\.ocean-canvas\s*\{[^}]*pointer-events:\s*none/s);
assert.doesNotMatch(css, /touch-action:\s*none/, 'the ocean must not disable mobile scrolling');
assert.match(
    css,
    /body\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none/s,
    'touching the exposed ocean must not begin browser text selection',
);
assert.match(
    css,
    /main\s*\{[^}]*-webkit-user-select:\s*text;[^}]*user-select:\s*text/s,
    'the content must retain normal text selection on touch devices',
);

console.log('Ocean pointer and touch interaction contract passed.');
