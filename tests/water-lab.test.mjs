import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../water-lab.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../water-lab.js', import.meta.url), 'utf8');

assert.match(
    html,
    /<script src="ocean\.js\?v=[^"]+" data-ocean-lab data-cfasync="false"><\/script>/,
    'the laboratory must execute the exact production solver',
);
for (const scenario of ['click', 'hover', 'pan', 'touch', 'stress']) {
    assert.match(
        html,
        new RegExp(`data-scenario="${scenario}"`),
        `${scenario} must be available as a repeatable visual scenario`,
    );
}
for (const view of ['0', '1', '2']) {
    assert.match(
        html,
        new RegExp(`data-view="${view}"`),
        `debug view ${view} must be selectable`,
    );
}
assert.match(
    script,
    /window\.dispatchEvent\(new PointerEvent\(type/,
    'lab scenarios must traverse the production pointer-event path',
);
assert.match(
    script,
    /'touch',\s*touchId/,
    'the laboratory must exercise touch input through the production path',
);
assert.match(
    script,
    /Object\.defineProperty\(window, 'waterLab'/,
    'browser automation must be able to run deterministic lab scenarios',
);
assert.match(
    script,
    /const value = document\.createElement\('output'\)/,
    'each control must have a native output element bound to its range input',
);
assert.match(
    script,
    /engine\.definitions\[name\]/,
    'the laboratory must read slider bounds from the engine definition table',
);
assert.match(
    script,
    /Object\.defineProperty\(window, 'waterLab'/,
    'browser automation must be able to run deterministic lab scenarios',
);
assert.match(
    script,
    /!metrics\.active\s*\?\s*'idle'/,
    'the laboratory must distinguish an intentionally idle solver from sampling',
);
for (const control of ['bodyPressure', 'surfaceSmoothing']) {
    assert.match(
        script,
        new RegExp(`\\['${control}',`),
        `${control} must remain directly tunable in the visual laboratory`,
    );
}

console.log('Shallow-water visual laboratory contract passed.');
