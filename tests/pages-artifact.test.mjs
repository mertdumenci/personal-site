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

    assert.ok(files.includes('index.html'), 'the Pages artifact must contain its entrypoint');
    assert.ok(files.includes('CNAME'), 'the Pages artifact must retain the custom domain');
    assert.ok(files.includes('ocean.js'), 'the Pages artifact must contain the ocean renderer');
    assert.ok(
        !files.some((file) => file.startsWith('local-water-controls.')),
        'local inspector assets must never enter the Pages artifact',
    );
    assert.doesNotMatch(
        html,
        /LOCAL_WATER_CONTROLS|local-water-controls/,
        'the deployed entrypoint must not reference the local inspector',
    );
} finally {
    await rm(destination, { recursive: true, force: true });
}

console.log('GitHub Pages artifact isolation contract passed.');
