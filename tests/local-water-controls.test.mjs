import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const ocean = await readFile(new URL('../ocean.js', import.meta.url), 'utf8');
const controls = await readFile(
    new URL('../local-water-controls.js', import.meta.url),
    'utf8',
);
const controlsCss = await readFile(
    new URL('../local-water-controls.css', import.meta.url),
    'utf8',
);

assert.match(
    html,
    /location\.protocol === 'file:'[\s\S]*location\.hostname === 'localhost'[\s\S]*location\.hostname === '127\.0\.0\.1'/,
    'the controls must load only on local preview origins',
);
assert.match(
    html,
    /controls\.src = 'local-water-controls\.js\?v=[^']+'/,
    'the local page must load the cache-versioned inspector',
);
assert.doesNotMatch(
    html,
    /<script[^>]+src="local-water-controls\.js/,
    'the inspector must not be an unconditional production asset',
);
assert.match(
    ocean,
    /if \(labMode \|\| localMode\)/,
    'the tuning API must be exposed only to the lab and local preview',
);
assert.match(
    ocean,
    /parameters\.pointerSize/,
    'pointer footprint size must be tunable',
);
assert.match(
    ocean,
    /parameters\.pointerDepth/,
    'pointer divot depth must be tunable',
);
for (const parameter of [
    'pointerSize',
    'pointerDepth',
    'clickGrowth',
    'bodyCoupling',
    'bodyPressure',
    'surfaceSmoothing',
    'drag',
    'disturbanceScale',
]) {
    assert.match(
        controls,
        new RegExp(`\\['${parameter}',`),
        `${parameter} must be available in the local inspector`,
    );
}
assert.match(
    controls,
    /changes are not saved/,
    'the inspector must clearly describe its ephemeral scope',
);
assert.match(
    controls,
    /output\.setAttribute\('for', input\.id\)/,
    'each slider output must be associated with its native control',
);
assert.match(
    controlsCss,
    /summary:focus-visible,[\s\S]*outline:\s*2px solid/,
    'local controls must have a visible keyboard focus indicator',
);
assert.match(
    controlsCss,
    /@media \(forced-colors: active\)/,
    'local controls must remain legible in forced colors',
);

console.log('Local-only water controls contract passed.');
