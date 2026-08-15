#!/usr/bin/env node
/**
 * Deployment smoke test for the built GitHub Pages artifact.
 *
 * The source-text suite (tests/*.test.mjs) can only verify what the shipped
 * files contain, so a page that throws a ReferenceError on load still passes
 * CI. This script boots the built artifact in a real headless browser and
 * asserts the page actually comes up: the ocean renderer sizes its canvas,
 * the shallow-water simulation initializes on the first idle window, and the
 * tuning API is exported on local/file origins.
 *
 * Usage:
 *   node scripts/smoke-deployment.mjs [DIR]
 *
 * DIR is the directory holding the built artifact (default: _site). The
 * script exits 0 when every check passes and 1 otherwise.
 *
 * Uncaught page errors always fail the run. Console errors are collected
 * and reported for context but do not fail the run, because the artifact's
 * remote stylesheets (Inter, Google Fonts) may simply be unreachable in the
 * test environment.
 */
'use strict';

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const artifactDirectory = resolve(process.cwd(), process.argv[2] ?? '_site');
const indexPath = join(artifactDirectory, 'index.html');

if (!existsSync(indexPath)) {
    console.error(`smoke test: ${indexPath} does not exist; nothing to smoke test.`);
    process.exit(1);
}

let chromium;
try {
    ({ chromium } = await import('playwright'));
} catch {
    console.error('smoke test: playwright is not installed.');
    console.error('Install it first: npm install --no-save playwright');
    process.exit(1);
}

let browser;
try {
    browser = await chromium.launch({ headless: true });
} catch (error) {
    console.error(`smoke test: failed to launch headless chromium: ${error.message}`);
    console.error('Install the browser first: npx playwright install chromium');
    process.exit(1);
}

const page = await browser.newPage();
const pageErrors = [];
const consoleErrors = [];

page.on('pageerror', (error) => {
    pageErrors.push(String(error));
});
page.on('console', (message) => {
    if (message.type() === 'error') {
        consoleErrors.push(message.text());
    }
});

// One successful page load plus one in-page probe; a fatal failure here is
// reported as its own check below instead of crashing the script.
let probe;
try {
    await page.goto('file://' + artifactDirectory + '/index.html', { waitUntil: 'load' });
    // Wait for the first presentation frame and for the deferred simulation
    // initialization (requestIdleCallback with a 250 ms budget) to land.
    await page.waitForTimeout(1500);
    probe = await page.evaluate(() => {
        const canvas = document.querySelector('canvas.ocean-canvas');
        const lab = window.oceanLab;
        return {
            oceanLabType: typeof lab,
            canvasWidth: canvas ? canvas.width : null,
            metrics: lab && typeof lab.getMetrics === 'function' ? lab.getMetrics() : null,
        };
    });
} catch (error) {
    probe = { fatal: error.message };
} finally {
    await browser.close();
}

const checks = [];

if (probe.fatal) {
    checks.push({
        name: 'page loaded and probe evaluated',
        ok: false,
        detail: probe.fatal,
    });
} else {
    checks.push({
        name: 'oceanLab tuning API exported on window',
        ok: probe.oceanLabType === 'object',
        detail: `typeof window.oceanLab = ${probe.oceanLabType}`,
    });
    checks.push({
        name: 'canvas sized by the renderer, not the 300x150 HTML default',
        ok: probe.canvasWidth !== null && probe.canvasWidth > 300,
        detail: probe.canvasWidth === null
            ? 'canvas.ocean-canvas missing (removed after a GL failure)'
            : `canvas.width = ${probe.canvasWidth}`,
    });
    checks.push({
        name: 'shallow-water simulation initialized at the fixed grid size',
        ok: probe.metrics !== null
            && probe.metrics.state === 'shallow-water'
            && probe.metrics.width === 256,
        detail: probe.metrics === null
            ? 'oceanLab.getMetrics() unavailable'
            : `state = ${probe.metrics.state}, width = ${probe.metrics.width}`,
    });
}

for (const check of checks) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name} (${check.detail})`);
}

const failed = checks.some((check) => !check.ok) || pageErrors.length > 0;

if (pageErrors.length > 0) {
    console.error('uncaught page errors:');
    for (const error of pageErrors) {
        console.error(error);
    }
}

if (consoleErrors.length > 0) {
    console.error('console errors:');
    for (const error of consoleErrors) {
        console.error(error);
    }
}

process.exitCode = failed ? 1 : 0;
