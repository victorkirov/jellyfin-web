import { createHashRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachRouter, history } from 'lib/navigationHistory';
import { close, createDialog, open } from './dialogHelper';

vi.mock('../focusManager', () => ({ default: {
    focus: vi.fn(), pushScope: vi.fn(), popScope: vi.fn(), autoFocus: vi.fn()
} }));
vi.mock('../../scripts/browser', () => ({ default: { tv: true } }));
vi.mock('../layoutManager', () => ({ default: { tv: true } }));
vi.mock('../../scripts/inputManager', () => ({ default: { on: vi.fn(), off: vi.fn() } }));
vi.mock('../loading/loading.ts', () => ({ hide: vi.fn() }));

let router: ReturnType<typeof createHashRouter>;

beforeEach(() => {
    // Node's Request cannot accept jsdom's AbortSignal; these routes have no loaders.
    vi.stubGlobal('Request', class extends Request {
        constructor(input: RequestInfo | URL, init?: RequestInit) {
            super(input, { ...init, signal: undefined });
        }
    });
    // jsdom retains state by reference, while browsers clone it on pushState.
    const pushState = window.history.pushState.bind(window.history);
    vi.spyOn(window.history, 'pushState').mockImplementation((state, title, url) => {
        pushState(JSON.parse(JSON.stringify(state)), title, url);
    });
    window.history.replaceState(null, '', '/#/details?id=123');
    router = createHashRouter([{ path: '*', element: null }]);
    attachRouter(router);
});

afterEach(() => {
    router.dispose();
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('dialog history integration', () => {
    it('opens nested dialogs and restores the underlying view on Back and close', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(1000);
        const first = createDialog();
        const firstClosed = open(first);
        await vi.waitFor(() => expect(history.location.state.dialogs).toHaveLength(1));
        vi.setSystemTime(2000);
        const second = createDialog();
        const secondClosed = open(second);
        await vi.waitFor(() => expect(history.location.state.dialogs).toHaveLength(2));

        history.back();
        await secondClosed;
        expect(second.classList.contains('hide')).toBe(true);
        expect(first.classList.contains('hide')).toBe(false);
        expect(history.location.state.dialogs).toHaveLength(1);

        close(first);
        await firstClosed;
        expect(document.querySelector('.dialogContainer')).toBeNull();
        expect(history.location.pathname).toBe('/details');
        expect(history.location.search).toBe('?id=123');
        expect(history.location.state).toBeNull();
    });
});
