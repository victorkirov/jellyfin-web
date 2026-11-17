import { readFileSync } from 'node:fs';
import { globSync } from 'fast-glob';
import React, { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';

const error = vi.hoisted(() => ({ name: 'Playback error', message: '<Untrusted message>', stack: 'Trace\n  details' }));
const hide = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({ useRouteError: () => error }));
vi.mock('components/Page', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('components/loading/loading', () => ({ default: { hide } }));
vi.mock('components/router/appRouter', () => ({ appRouter: { getRouteUrl: (item: { Id: string }) => '#/details?id=' + item.Id } }));
vi.mock('elements/emby-button/LinkButton', () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));

import ErrorBoundary from './router/ErrorBoundary';
import MarkdownBox from './MarkdownBox';
import ItemDetailsMetadataList from './itemDetails/ItemDetailsMetadataList';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
});

describe('Legacy presentation without MUI', () => {
    it('keeps MUI and Emotion imports out of application modules', () => {
        const imports = /['"]@(?:mui\/material|emotion\/)/;
        const paths = globSync('src/**/*.{js,jsx,ts,tsx}', { ignore: ['**/*.test.*', '**/*.d.ts'] });
        for (const path of paths) {
            expect(readFileSync(path, 'utf8'), path).not.toMatch(imports);
        }
    });

    it('keeps MUI out of the root and legacy render providers', () => {
        for (const path of ['src/RootAppRouter.tsx', 'src/utils/reactUtils.tsx', 'src/components/router/ErrorBoundary.tsx', 'src/components/MarkdownBox.tsx', 'src/components/itemDetails/ItemDetailsMetadataList.tsx']) {
            const source = readFileSync(path, 'utf8');
            expect(source, path).not.toMatch(/@mui|ThemeProvider|ColorSchemeSync/);
        }
    });

    it('renders an announced error and escaped trace without a theme provider', () => {
        act(() => root.render(<ErrorBoundary />));
        expect(container.querySelector('[role="alert"] h1')?.textContent).toBe(error.name);
        expect(container.querySelector('[role="alert"] p')?.textContent).toBe(error.message);
        expect(container.querySelector('pre')?.textContent).toBe(error.stack);
        expect(container.querySelector('Untrusted')).toBeNull();
        expect(hide).toHaveBeenCalled();
    });

    it('sanitizes Markdown and preserves a plain-text fallback', () => {
        act(() => root.render(<MarkdownBox markdown={'**Overview**<script>alert(1)</script>'} />));
        expect(container.querySelector('.markdownBox strong')?.textContent).toBe('Overview');
        expect(container.querySelector('script')).toBeNull();
        act(() => root.render(<MarkdownBox fallback='No overview' />));
        expect(container.textContent).toBe('No overview');
    });

    it('preserves metadata links, inherited direction and focus classes', () => {
        container.dir = 'rtl';
        act(() => root.render(<ItemDetailsMetadataList type={BaseItemKind.Genre} context='movies' item={{ GenreItems: [{ Id: '1', Name: 'دراما' }, { Id: '2', Name: 'Comedy' }] }} />));
        expect(container.querySelector('.detailsGroupItem .label')?.textContent).toBe('Genres');
        expect(container.querySelector('.focuscontainer-x')?.textContent).toBe('دراما, Comedy');
        expect(Array.from(container.querySelectorAll('a')).map(link => link.getAttribute('href'))).toEqual(['#/details?id=1', '#/details?id=2']);
        expect(container.querySelectorAll('a.button-link-inherit')).toHaveLength(2);
        expect(container.querySelector('[dir]')).toBeNull();
    });
});
