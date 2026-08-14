import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const ocean = await readFile(new URL('../ocean.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');

/** Extracts the body of a named JavaScript function for initialization checks. */
function functionBody(source, name) {
    const signature = `function ${name}()`;
    const start = source.indexOf(signature);
    assert.notEqual(start, -1, `${name} must exist`);

    let depth = 0;
    let bodyStart = -1;
    for (let index = start + signature.length; index < source.length; index += 1) {
        if (source[index] === '{') {
            if (bodyStart === -1) {
                bodyStart = index + 1;
            }
            depth += 1;
        } else if (source[index] === '}') {
            depth -= 1;
            if (depth === 0) {
                return source.slice(bodyStart, index);
            }
        }
    }

    assert.fail(`Could not parse ${name}`);
}

const scriptTag = html.match(/<script\b[^>]*\bsrc=["']ocean\.js\?v=([^"']+)["'][^>]*><\/script>/i);
assert.ok(scriptTag, 'index.html must load ocean.js');
const preloadTag = html.match(
    /<link\b[^>]*\brel=["']preload["'][^>]*\bhref=["']ocean\.js\?v=([^"']+)["'][^>]*>/i,
);
assert.ok(
    preloadTag,
    'ocean.js must begin loading from the document head',
);
assert.equal(preloadTag[1], scriptTag[1], 'the preload and script versions must match');
assert.match(
    html,
    /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']style\.css\?v=[^"']+["'][^>]*>/i,
    'style.css must be cache-versioned with the renderer',
);
assert.doesNotMatch(
    scriptTag[0],
    /\b(?:async|defer)\b/i,
    'ocean.js must run before the browser can paint the parsed page',
);
assert.match(
    scriptTag[0],
    /\bdata-cfasync=["']false["']/i,
    'Cloudflare Rocket Loader must not defer the ocean renderer',
);
assert.ok(
    html.indexOf(scriptTag[0]) < html.indexOf('<main>'),
    'the ocean must render before page content is parsed',
);

const refreshBody = functionBody(ocean, 'refresh');
const initialDraw = refreshBody.indexOf('draw(startTime)');
const scheduledDraw = refreshBody.indexOf('requestAnimationFrame(animate)');
assert.ok(initialDraw >= 0, 'refresh must draw the initial frame synchronously');
assert.ok(
    scheduledDraw < 0 || initialDraw < scheduledDraw,
    'the initial draw must happen before animation is scheduled',
);
assert.match(
    ocean,
    /function draw\(now = performance\.now\(\)\)/,
    'unscheduled draws must use the current clock rather than the startup frame',
);
assert.match(
    ocean,
    /const resizeObserver = new ResizeObserver\(\(\) => \{\s*resize\(\);\s*draw\(performance\.now\(\)\);\s*\}\)/,
    'live resizing must resize once and redraw the current animated ocean frame',
);
assert.match(
    ocean,
    /function draw\(now = performance\.now\(\)\) \{\s*advanceSimulation\(now\)/,
    'steady animation frames must not force synchronous layout measurement',
);

const canvasRule = css.match(/\.ocean-canvas\s*\{([^}]+)\}/);
assert.ok(canvasRule, 'style.css must define the ocean canvas');
assert.doesNotMatch(
    canvasRule[1],
    /\b(?:animation|transition)\s*:/i,
    'the ocean canvas must not fade or animate into view',
);
assert.doesNotMatch(
    canvasRule[1],
    /\bopacity\s*:\s*0(?:\.0+)?\s*(?:;|$)/i,
    'the ocean canvas must be visible on its first frame',
);

console.log('Initial ocean render contract passed.');
