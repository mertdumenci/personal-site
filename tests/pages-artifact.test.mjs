import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = new URL('..', import.meta.url).pathname;
const destination = await mkdtemp(join(tmpdir(), 'personal-site-pages-'));

try {
    await run('./scripts/build-pages.sh', [destination], { cwd: root });
    const files = await readdir(destination);
    const html = await readFile(join(destination, 'index.html'), 'utf8');
    const ocean = await readFile(join(destination, 'ocean.js'), 'utf8');
    const oceanSource = await readFile(join(root, 'ocean.js'), 'utf8');
    const style = await readFile(join(destination, 'style.css'), 'utf8');
    const styleSource = await readFile(join(root, 'style.css'), 'utf8');
    const expectedFiles = ['CNAME', 'index.html', 'ocean.js', 'style.css'];

    assert.deepEqual(
        files.sort(),
        expectedFiles.sort(),
        'the Pages artifact must contain only production runtime files',
    );
    assert.ok(
        Buffer.byteLength(ocean) < Buffer.byteLength(oceanSource),
        'the deployed ocean runtime must compact shader whitespace',
    );
    assert.ok(
        Buffer.byteLength(ocean) < 30_000,
        'the deployed ocean runtime must omit documentation and indentation',
    );
    assert.doesNotMatch(
        ocean,
        /^\s+/m,
        'JavaScript compaction must preserve lines without source indentation',
    );
    assert.doesNotMatch(
        ocean,
        /\/\*\*/,
        'source documentation must remain outside the production runtime',
    );
    assert.match(
        ocean,
        /#version 300 es\nlayout\(location = 0\)in vec2 position;/,
        'the compacted vertex shader must preserve its preprocessor newline',
    );
    assert.ok(
        Buffer.byteLength(style) < Buffer.byteLength(styleSource),
        'the deployed stylesheet must compact comments and whitespace',
    );
    assert.match(
        style,
        /--mono:'JetBrains Mono',ui-monospace,'SF Mono',monospace/,
        'CSS compaction must preserve whitespace inside quoted values',
    );
    assert.ok(
        Buffer.byteLength(html) < 5_500,
        'the deployed HTML must omit source indentation and blank lines',
    );
    assert.doesNotMatch(
        html,
        /\n\n|^\s+</m,
        'HTML compaction must retain one separator without indentation',
    );
    assert.doesNotMatch(
        html,
        /LOCAL_WATER_CONTROLS|local-water-controls|water-lab/,
        'the deployed entrypoint must not reference local water tooling',
    );
    await assert.rejects(
        run('./scripts/build-pages.sh', [destination], { cwd: root }),
        /Destination must be empty/,
        'the artifact builder must not silently retain stale files',
    );
} finally {
    await rm(destination, { recursive: true, force: true });
}

console.log('GitHub Pages artifact isolation contract passed.');
