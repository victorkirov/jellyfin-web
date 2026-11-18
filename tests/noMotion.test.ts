import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fg from 'fast-glob';
import { expect, it } from 'vitest';

function hasMotion(source: string) {
    const withoutResets = source.replace(/(^|[{;\s])(-webkit-)?transition\s*:\s*none\s*!important\s*(?=[;}])/g, '$1');
    return withoutResets.split('\n').some(line => /(^|[{;\s])(-webkit-)?(transition|animation)(-[\w-]+)?\s*:/.test(line) || line.trim().startsWith('@keyframes') || line.trim().startsWith('@-webkit-keyframes'));
}

it.each([
    '.x { transition: opacity .2s; }',
    '.x { color: red; animation: fadein .2s; }',
    '.x {-webkit-transition-duration: 200ms;}',
    '.x { color: red; -webkit-animation-name: fadein; }',
    '<style>body.mouseIdle { transition: opacity 0.2s; }</style>'
])('rejects a one-line motion rule: %s', source => {
    expect(hasMotion(source)).toBe(true);
});

it('keeps UI styles free of animation and transition declarations', () => {
    const violations: string[] = [];
    const allowed = [
        'src/components/loading/loading.scss',
        // Functional webOS checkbox repaint workaround, not visual motion.
        'src/elements/emby-checkbox/emby-checkbox.scss'
    ];
    for (const path of fg.sync('src/**/*.{scss,css,html}', { ignore: allowed })) {
        const source = readFileSync(resolve(path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        if (hasMotion(source)) {
            violations.push(path);
        }
    }
    expect(violations).toEqual([]);
});

it('neutralizes the webcomponents-lite injected body fade before startup', () => {
    const source = readFileSync(resolve('src/index.html'), 'utf8');
    expect(source).toMatch(/body\s*\{\s*transition:\s*none\s*!important;\s*\}/);
    expect(hasMotion('<style>body { transition: none !important; }</style>')).toBe(false);
    expect(hasMotion('body { transition: none !important; animation: fade .2s; }')).toBe(true);
});
