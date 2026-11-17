import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const show = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('components/Page', () => ({ default: ({ children }: React.PropsWithChildren) => <div>{children}</div> }));
vi.mock('components/apphost', () => ({ appHost: { supports: () => true } }));
vi.mock('components/layoutManager', () => ({ default: { tv: true } }));
vi.mock('components/router/appRouter', () => ({ appRouter: { show } }));
vi.mock('components/playback/playbackmanager', () => ({ playbackManager: {} }));
vi.mock('components/focusManager', () => ({ default: {} }));
vi.mock('scripts/shell', () => ({ default: {} }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));

import FallbackRoute from './FallbackRoute';
import { select } from 'scripts/inputManager';

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
    show.mockResolvedValue(undefined);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<MemoryRouter initialEntries={['/does-not-exist']}><FallbackRoute /></MemoryRouter>));
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    show.mockClear();
    vi.unstubAllGlobals();
});

describe('Fallback recovery', () => {
    it('uses the standard padded TV action aligned with the content gutter', () => {
        const link = container.querySelector('a')!;
        expect(link.classList.contains('raised')).toBe(true);
        expect(link.classList.contains('button-link')).toBe(false);
        expect(link.classList.contains('emby-button')).toBe(true);
        expect(link.classList.contains('show-focus')).toBe(true);
        expect(link.style.margin).toBe('0px');
        expect(link.parentElement?.classList.contains('padded-left')).toBe(true);
        expect(link.parentElement?.classList.contains('padded-right')).toBe(true);
    });

    it('keeps native anchor activation and remote selection routed Home', async () => {
        const link = container.querySelector('a')!;
        expect(link.getAttribute('href')).toBe('#/home');
        link.focus();
        expect(document.activeElement).toBe(link);
        await act(async () => select(link));
        expect(show).toHaveBeenCalledWith('#/home');
        show.mockClear();
        await act(async () => link.click());
        expect(show).toHaveBeenCalledOnce();
        expect(show).toHaveBeenCalledWith('#/home');
    });
});
