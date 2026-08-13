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
    const expectedFiles = ['CNAME', 'index.html', 'ocean.js', 'style.css'];

    assert.deepEqual(
        files.sort(),
        expectedFiles.sort(),
        'the Pages artifact must contain only production runtime files',
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
