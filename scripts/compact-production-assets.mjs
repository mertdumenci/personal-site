#!/usr/bin/env node
/** Build byte-efficient production assets while preserving readable sources. */

import { readFile, writeFile } from 'node:fs/promises';

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
    const withoutDocumentation = output.replaceAll(
        /^\s*\/\*\*.*\*\/\s*$/gm,
        '',
    );
    return compactStructuralWhitespace(withoutDocumentation);
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

const [
    oceanSourcePath,
    oceanDestinationPath,
    cssSourcePath,
    cssDestinationPath,
    htmlSourcePath,
    htmlDestinationPath,
] = process.argv.slice(2);
if (
    !oceanSourcePath
    || !oceanDestinationPath
    || !cssSourcePath
    || !cssDestinationPath
    || !htmlSourcePath
    || !htmlDestinationPath
) {
    throw new Error(
        'Usage: compact-production-assets.mjs '
        + 'OCEAN_SOURCE OCEAN_DEST CSS_SOURCE CSS_DEST HTML_SOURCE HTML_DEST',
    );
}

const [oceanSource, cssSource, htmlSource] = await Promise.all([
    readFile(oceanSourcePath, 'utf8'),
    readFile(cssSourcePath, 'utf8'),
    readFile(htmlSourcePath, 'utf8'),
]);
await Promise.all([
    writeFile(oceanDestinationPath, compactOcean(oceanSource)),
    writeFile(cssDestinationPath, compactCss(cssSource)),
    writeFile(htmlDestinationPath, compactStructuralWhitespace(htmlSource)),
]);
