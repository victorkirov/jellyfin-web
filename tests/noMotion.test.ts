import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fg from 'fast-glob';
import { expect, it } from 'vitest';

function hasMotion(source: string) {
    return source.split('\n').some(line => /(^|[{;\s])(-webkit-)?(transition|animation)(-[\w-]+)?\s*:/.test(line) || line.trim().startsWith('@keyframes') || line.trim().startsWith('@-webkit-keyframes'));
}

it.each([
    '.x { transition: opacity .2s; }',
    '.x { color: red; animation: fadein .2s; }',
    '.x {-webkit-transition-duration: 200ms;}',
    '.x { color: red; -webkit-animation-name: fadein; }'
])('rejects a one-line motion rule: %s', source => {
    expect(hasMotion(source)).toBe(true);
});

it('keeps UI styles free of animation and transition declarations', () => {
    const violations: string[] = [];
    const allowed = [
        'src/components/loading/loading.scss',
        'src/elements/emby-checkbox/emby-checkbox.scss'
    ];
    for (const path of fg.sync('src/**/*.scss', { ignore: allowed })) {
        const source = readFileSync(resolve(path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        if (hasMotion(source)) {
            violations.push(path);
        }
    }
    expect(violations).toEqual([]);
});
