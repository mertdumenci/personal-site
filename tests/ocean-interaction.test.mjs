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
    /vec3 center = texture\(previousState, uv\)\.rgb/,
    'the fluid texture must carry surface height and two-axis velocity',
);
assert.match(
    ocean,
    /vec2 heightGradient = vec2\([\s\S]*right\.r - left\.r[\s\S]*above\.r - below\.r/,
    'gravity must act on a finite-difference surface gradient',
);
assert.match(
    ocean,
    /float fluxDivergence = \([\s\S]*rightFlux - leftFlux \+ aboveFlux - belowFlux/,
    'the continuity equation must evolve height from horizontal flux',
);
assert.match(
    ocean,
    /vec2 nextVelocity = velocity[\s\S]*- gravity \* heightGradient \* timestep[\s\S]*\+ viscosity \* velocityLaplacian \* timestep/,
    'the momentum equation must include pressure acceleration and viscosity',
);
assert.match(
    ocean,
    /uniform vec4 currentBodies\[maximumBodies\]/,
    'the solver must accept immersed bodies without CPU texture uploads',
);
assert.match(
    ocean,
    /nextVelocity = mix\(nextVelocity, bodyVelocity, entrainment\)/,
    'moving bodies must transfer horizontal momentum into the fluid',
);
assert.match(
    ocean,
    /displacedSurface\(point, body\)[\s\S]*- displacedSurface\(point, previousBody\)/,
    'body growth must displace water from its changing immersed volume',
);
assert.match(
    ocean,
    /\[simulation\.read, simulation\.write\] = \[simulation\.write, simulation\.read\]/,
    'the GPU simulation must preserve state through ping-pong framebuffers',
);
assert.match(
    ocean,
    /crestPhase[\s\S]*disturbance \* disturbanceScale/,
    'simulated height must bend the existing wave crests',
);
assert.match(
    ocean,
    /const simulationStepDuration = 1000 \/ 120/,
    'physics must run on a fixed 120 Hz clock independent of presentation FPS',
);
assert.match(
    ocean,
    /canvas\.dataset\.simulation = simulation \? 'shallow-water' : 'unavailable'/,
    'the runtime must report the physical solver rather than the old height field',
);
assert.doesNotMatch(
    ocean,
    /2\.0 \* current - previous/,
    'the old scalar ripple equation must not masquerade as fluid dynamics',
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
    /function handlePointerEnd\(event\)[\s\S]*body\.pressed = false;[\s\S]*body\.present = false/,
    'lifting a touch must remove only its body while leaving fluid state intact',
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
assert.match(
    css,
    /--ocean-floor:\s*#202020/,
    'dark-mode overscroll must match the resting ocean foreground',
);
assert.match(
    css,
    /html\s*\{[^}]*background-image:\s*linear-gradient\(var\(--ocean-floor\), var\(--bg\)\);[^}]*background-repeat:\s*repeat/s,
    'the root background edges must continue the ocean below and page above',
);

console.log('Ocean pointer and touch interaction contract passed.');
