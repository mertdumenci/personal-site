import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');

assert.match(html, /<html lang="en">/, 'the document language must be declared');
assert.match(html, /^<!DOCTYPE html>/, 'the document must use a standards-mode doctype');
assert.match(html, /<title>[^<]+<\/title>/, 'the page must have a descriptive title');
assert.match(html, /<main>/, 'the primary content must use the main landmark');
assert.equal((html.match(/<h1\b/g) || []).length, 1, 'the page must have exactly one h1');
assert.equal((html.match(/<section\b/g) || []).length, 3, 'each content group must be a section');
assert.equal((html.match(/<dl class="grid">/g) || []).length, 3, 'paired content must use description lists');
assert.equal((html.match(/<dt\b/g) || []).length, (html.match(/<dd\b/g) || []).length, 'each term must have one description');
assert.doesNotMatch(html, /<img(?![^>]*\balt=)[^>]*>/, 'every image must define alternative text');
assert.match(html, /class="ocean-canvas" aria-hidden="true"/, 'the ornamental ocean must stay out of the accessibility tree');
assert.match(html, /environment for Siri AI\.<\/p>/, 'the headline must retain plain readable text');
assert.match(html, /aria-label="Email Mert Dumenci"/, 'the email link must have an unambiguous name');
assert.match(css, /\.role a:focus-visible,[\s\S]*outline:\s*2px solid/, 'links must have a strong keyboard focus indicator');
assert.match(css, /@media \(prefers-contrast: more\)/, 'increased-contrast preferences must be supported');
assert.match(css, /@media \(prefers-reduced-transparency: reduce\)/, 'reduced transparency must be supported');
assert.match(css, /@media \(forced-colors: active\)/, 'forced-colors mode must be supported');
assert.doesNotMatch(css, /outline:\s*none/, 'focus outlines must never be suppressed');

console.log('Production accessibility contract passed.');
