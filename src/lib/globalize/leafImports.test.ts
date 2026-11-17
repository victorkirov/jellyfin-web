import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('components/playback/playbackmanager', () => {
    throw new Error('leaf imported playback');
});
vi.mock('components/router/appRouter', () => {
    throw new Error('leaf imported routing');
});
vi.mock('components/apphost', () => {
    throw new Error('leaf imported app host');
});
vi.mock('scripts/settings/userSettings', () => {
    throw new Error('leaf imported settings/connections');
});

describe('localization and input leaves', () => {
    it('imports input primitives without application services', async () => {
        const input = await import('scripts/inputManager');
        expect(input.handleCommand).toBeTypeOf('function');
    });

    it('imports localization without settings or connections', async () => {
        const locale = await import('./index');
        expect(locale.getCurrentLocale()).toBeTypeOf('string');
    });
});

it('keeps element dependency paths clear of application services', () => {
    const visited = new Set<string>();
    const forbidden: string[] = [];
    const visit = (file: string) => {
        if (visited.has(file)) return;
        visited.add(file);
        if (/\/src\/(components|apps|hooks)\/|\/src\/lib\/jellyfin-apiclient\/|\/src\/scripts\/settings\/userSettings\./.test(file)) forbidden.push(file);
        const pattern = /^(?:import|export)[^\n;]+/gm;
        const source = readFileSync(file, 'utf8');
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(source))) {
            if (/^(?:import|export) type /.test(match[0])) continue;
            const specifier = /['"]([^'"]+)['"]/.exec(match[0])?.[1];
            if (!specifier) continue;
            const base = specifier.startsWith('.') ? resolve(dirname(file), specifier) : resolve('src', specifier);
            const dependency = [base, ...['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'].map(extension => base + extension)]
                .find(candidate => /\.[jt]sx?$/.test(candidate) && existsSync(candidate));
            if (dependency) visit(dependency);
        }
    };
    visit(resolve('src/elements/emby-scroller/emby-scroller.js'));
    visit(resolve('src/elements/emby-progressring/emby-progressring.js'));
    expect(forbidden).toEqual([]);
});
