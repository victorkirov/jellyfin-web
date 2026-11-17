import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fg from 'fast-glob';
import { expect, it } from 'vitest';

it('keeps UI styles free of animation and transition declarations', () => {
    const violations: string[] = [];
    const allowed = [
        'src/components/loading/loading.scss',
        'src/elements/emby-checkbox/emby-checkbox.scss'
    ];
    for (const path of fg.sync('src/**/*.scss', { ignore: allowed })) {
        const source = readFileSync(resolve(path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        if (source.split('\n').some(line => /^(?:-webkit-)?(?:transition|animation)(?:-[\w-]+)?\s*:/.test(line.trim()) || line.trim().startsWith('@keyframes') || line.trim().startsWith('@-webkit-keyframes'))) {
            violations.push(path);
        }
    }
    expect(violations).toEqual([]);
});
