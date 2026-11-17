import { createHashRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouterHistory } from './navigationHistory';

beforeEach(() => {
    // Node's Request cannot accept jsdom's AbortSignal; these routes have no loaders.
    vi.stubGlobal('Request', class extends Request {
        constructor(input: RequestInfo | URL, init?: RequestInit) {
            super(input, { ...init, signal: undefined });
        }
    });
});

const routers: ReturnType<typeof createHashRouter>[] = [];

afterEach(() => {
    routers.forEach(router => {
        router.dispose();
    });
    routers.length = 0;
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
});

function attachHistory() {
    const history = new RouterHistory();
    const router = createHashRouter([{ path: '*', element: null }]);
    routers.push(router);
    history.attach(router);
    return { history, router };
}

describe('navigation history', () => {
    it('reads the cold hash before router initialization, then retains early listeners', async () => {
        window.history.replaceState({ usr: { test: true }, key: 'saved' }, '', '/#!/details?id=123');
        const history = new RouterHistory();
        expect(history.location).toEqual({
            pathname: '/!/details', search: '?id=123', hash: '', state: { test: true }, key: 'saved'
        });
        let path;
        const unlisten = history.listen(update => {
            path = update.location.pathname;
        });
        const router = createHashRouter([{ path: '*', element: null }]);
        routers.push(router);
        history.attach(router);
        await router.navigate('/home');
        expect(path).toBe('/home');
        unlisten();
    });

    it('forwards push, replace and Back with dialog state unchanged', async () => {
        window.history.replaceState(null, '', '/#/details?id=123');
        const { history, router } = attachHistory();
        history.push('/details?id=123', { dialogs: ['dialog1'] });
        expect(history.location.state).toEqual({ dialogs: ['dialog1'] });
        history.push('/details?id=123', { dialogs: ['dialog1', 'dialog2'] });
        history.replace('/details?id=123', { dialogs: ['dialog2'] });
        expect(history.location.state).toEqual({ dialogs: ['dialog2'] });
        const popped = new Promise<void>(resolve => {
            const unlisten = history.listen(() => {
                unlisten();
                resolve();
            });
        });
        history.back();
        await popped;
        expect(history.location.state).toEqual({ dialogs: ['dialog1'] });
        expect(router.state.location.pathname).toBe('/details');
        expect(router.state.location.search).toBe('?id=123');
    });

    it('fails explicitly for navigation before attachment and double attachment', () => {
        const history = new RouterHistory();
        expect(() => history.push('/home')).toThrow('Navigation router is not attached');
        const router = createHashRouter([{ path: '*', element: null }]);
        routers.push(router);
        history.attach(router);
        expect(() => history.attach(router)).toThrow('Navigation router is already attached');
    });
});
