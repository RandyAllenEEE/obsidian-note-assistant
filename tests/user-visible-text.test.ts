import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import en from '../src/i18n/locales/en';

function sourceFiles(directory: string): string[] {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(file);
        return entry.name.endsWith('.ts') ? [file] : [];
    });
}

describe('user-visible text audit', () => {
    const files = sourceFiles(path.resolve('src'))
        .filter(file => !file.includes(`${path.sep}i18n${path.sep}locales${path.sep}`));

    it('does not pass string literals directly to translated UI sinks', () => {
        const forbidden = [
            /new Notice\(\s*['"]/g,
            /new Notice\(\s*`(?![^`]*\$\{t\()/g,
            /\.(?:setName|setDesc|setButtonText|setTooltip)\(\s*['"]/g,
            /createEl\([^\n]*\btext:\s*['"][A-Za-z]/g,
        ];
        const violations = files.flatMap(file => {
            const source = fs.readFileSync(file, 'utf8');
            return forbidden.flatMap(pattern => [...source.matchAll(pattern)].map(match => ({
                file: path.relative(process.cwd(), file),
                text: match[0],
            })));
        });
        expect(violations).toEqual([]);
    });

    it('uses existing semantic translation keys at every literal t() call', () => {
        const knownKeys = new Set(Object.keys(en));
        const invalid: Array<{ file: string; key: string }> = [];
        const callPattern = /\bt\(\s*(['"])([^'"]+)\1/g;

        for (const file of files) {
            const source = fs.readFileSync(file, 'utf8');
            for (const match of source.matchAll(callPattern)) {
                const key = match[2];
                if (!/^[a-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+$/.test(key) || !knownKeys.has(key)) {
                    invalid.push({ file: path.relative(process.cwd(), file), key });
                }
            }
        }
        expect(invalid).toEqual([]);
    });
});
