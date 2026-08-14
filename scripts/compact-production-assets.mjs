#!/usr/bin/env node
/** Build byte-efficient production assets while preserving readable sources. */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const shaderNames = [
    'vertexSource',
    'fragmentSource',
    'simulationFragmentSource',
];

/** Compact one GLSL program without changing token order or numeric spelling. */
function compactShader(source) {
    const lines = source.replaceAll('\r\n', '\n').split('\n');
    const sections = [];
    let body = [];

    /** Flush ordinary GLSL lines before a newline-sensitive preprocessor directive. */
    function flushBody() {
        if (body.length === 0) {
            return;
        }
        sections.push(body.join(' ')
            .replaceAll(/\s+/g, ' ')
            .replaceAll(/\s*([{}();,])\s*/g, '$1'));
        body = [];
    }

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }
        if (trimmed.startsWith('#')) {
            flushBody();
            sections.push(trimmed);
            continue;
        }
        body.push(trimmed);
    }
    flushBody();
    return sections.join('\n');
}

/** Remove standalone documentation blocks from the deployed JavaScript. */
function stripDocumentationComments(source) {
    let insideDocumentation = false;
    const lines = source.split('\n').filter((line) => {
        const trimmed = line.trim();
        if (insideDocumentation) {
            insideDocumentation = !trimmed.includes('*/');
            return false;
        }
        if (!trimmed.startsWith('/**')) {
            return true;
        }
        insideDocumentation = !trimmed.includes('*/');
        return false;
    });
    if (insideDocumentation) {
        throw new Error('Unterminated JavaScript documentation comment');
    }
    return lines.join('\n');
}

/** Compact every known shader template and reject incomplete source changes. */
function compactOcean(source) {
    let output = source;
    for (const name of shaderNames) {
        const pattern = new RegExp(`(const ${name} = \`)([\\s\\S]*?)(\`;)$`, 'm');
        let replacements = 0;
        output = output.replace(pattern, (_match, prefix, shader, suffix) => {
            replacements += 1;
            return `${prefix}${compactShader(shader)}${suffix}`;
        });
        if (replacements !== 1) {
            throw new Error(
                `Expected exactly one ${name} shader template; found ${replacements}`,
            );
        }
    }
    return compactStructuralWhitespace(stripDocumentationComments(output));
}

/** Remove CSS comments and isolate strings before whitespace compaction. */
function isolateCssStrings(source) {
    const strings = [];
    let output = '';
    let index = 0;

    while (index < source.length) {
        const character = source[index];
        if (character === '/' && source[index + 1] === '*') {
            const end = source.indexOf('*/', index + 2);
            if (end < 0) {
                throw new Error('Unterminated CSS comment');
            }
            index = end + 2;
            continue;
        }
        if (character !== '"' && character !== "'") {
            output += character;
            index += 1;
            continue;
        }

        const quote = character;
        let string = quote;
        index += 1;
        while (index < source.length) {
            const next = source[index];
            string += next;
            index += 1;
            if (next === '\\') {
                if (index < source.length) {
                    string += source[index];
                    index += 1;
                }
                continue;
            }
            if (next === quote) {
                break;
            }
        }
        if (!string.endsWith(quote) || string.length === 1) {
            throw new Error('Unterminated CSS string');
        }
        output += `\uE000${strings.length}\uE001`;
        strings.push(string);
    }
    return { output, strings };
}

/** Compact CSS syntax while preserving strings and calc operator spacing. */
function compactCss(source) {
    const { output, strings } = isolateCssStrings(source);
    const compacted = output
        .replaceAll(/\s+/g, ' ')
        .replaceAll(/\s*([{}:;,>])\s*/g, '$1')
        .replaceAll(/;}/g, '}')
        .trim();
    return compacted.replaceAll(/\uE000(\d+)\uE001/g, (_match, index) => (
        strings[Number(index)]
    ));
}

/** Remove indentation and blank lines while retaining line-token separation. */
function compactStructuralWhitespace(source) {
    return `${source
        .replaceAll('\r\n', '\n')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n')}\n`;
}

/**
 * Compacts the production assets in place within `DESTINATION_DIR`:
 * `ocean.js` and `style.css` are read from `SOURCE_DIR` and written
 * compacted into `DESTINATION_DIR`, while `index.html` is read from — and
 * rewritten in — `DESTINATION_DIR` so the caller can pre-edit it (for
 * example, to strip the local-control loader) before compaction.
 */
const [sourceDirectory, destinationDirectory] = process.argv.slice(2);
if (!sourceDirectory || !destinationDirectory) {
    throw new Error(
        'Usage: compact-production-assets.mjs SOURCE_DIR DESTINATION_DIR',
    );
}
const source = resolve(sourceDirectory);
const destination = resolve(destinationDirectory);
await mkdir(destination, { recursive: true });

for (const [name, compact, origin] of [
    ['ocean.js', compactOcean, source],
    ['style.css', compactCss, source],
    ['index.html', compactStructuralWhitespace, destination],
]) {
    const text = await readFile(pathToFileURL(resolve(origin, name)), 'utf8');
    await writeFile(pathToFileURL(resolve(destination, name)), compact(text));
}
