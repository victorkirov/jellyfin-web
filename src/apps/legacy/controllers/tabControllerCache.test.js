import { describe, expect, it, vi } from 'vitest';

import createTabControllerCache from './tabControllerCache';

function controller() {
    return { initTab: vi.fn(), preRender: vi.fn(), renderTab: vi.fn(), destroy: vi.fn() };
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
    });
    return { promise, resolve, reject };
}

describe('recommended tab controller cache', () => {
    it('shares a pending preload with render and initializes and renders once', async () => {
        const pending = deferred();
        const tab = controller();
        const load = vi.fn(() => pending.promise);
        const tabs = createTabControllerCache(load);
        const preload = tabs.preload(2);
        const firstRender = tabs.render(2);
        const secondRender = tabs.render(2);
        pending.resolve(tab);
        await Promise.all([preload, firstRender, secondRender]);
        expect(load).toHaveBeenCalledTimes(1);
        expect(tab.initTab).toHaveBeenCalledTimes(1);
        expect(tab.preRender).toHaveBeenCalledTimes(1);
        expect(tab.renderTab).toHaveBeenCalledTimes(1);
        await tabs.render(2);
        expect(tab.renderTab).toHaveBeenCalledTimes(1);
    });

    it('resets rendered tabs after playback without reconstructing controllers', async () => {
        const tab = controller();
        const load = vi.fn(() => Promise.resolve(tab));
        const tabs = createTabControllerCache(load);
        await tabs.render(0);
        await tabs.render(1);
        tabs.reset();
        await tabs.preload(0);
        await tabs.render(0);
        expect(load).toHaveBeenCalledTimes(2);
        expect(tab.preRender).toHaveBeenCalledTimes(1);
        expect(tab.renderTab).toHaveBeenCalledTimes(3);
    });

    it('allows retry when loading or rendering fails', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const tab = controller();
        const load = vi.fn().mockRejectedValueOnce(new Error('load')).mockResolvedValue(tab);
        const tabs = createTabControllerCache(load);
        await tabs.render(3);
        tab.renderTab.mockRejectedValueOnce(new Error('render'));
        await tabs.render(3);
        await tabs.render(3);
        expect(load).toHaveBeenCalledTimes(2);
        expect(tab.renderTab).toHaveBeenCalledTimes(2);
    });

    it('does not mark an old render fresh after a playback reset', async () => {
        const first = deferred();
        const tab = controller();
        tab.renderTab.mockReturnValueOnce(first.promise);
        const tabs = createTabControllerCache(() => Promise.resolve(tab));
        const render = tabs.render(0);
        await vi.waitFor(() => expect(tab.renderTab).toHaveBeenCalledTimes(1));
        tabs.reset();
        first.resolve();
        await render;
        await tabs.render(0);
        expect(tab.renderTab).toHaveBeenCalledTimes(2);
    });

    it('renders only the selected tab when imports complete in reverse order', async () => {
        const first = deferred();
        const second = deferred();
        const firstTab = controller();
        const secondTab = controller();
        const tabs = createTabControllerCache(index => index ? second.promise : first.promise);
        const firstRender = tabs.render(0);
        const secondRender = tabs.render(1);
        second.resolve(secondTab);
        await secondRender;
        first.resolve(firstTab);
        await firstRender;
        expect(firstTab.renderTab).not.toHaveBeenCalled();
        expect(secondTab.renderTab).toHaveBeenCalledTimes(1);
        await tabs.render(0);
        expect(firstTab.renderTab).toHaveBeenCalledTimes(1);
    });

    it('retries an in-progress render invalidated while the view is hidden', async () => {
        const pending = deferred();
        const tab = controller();
        tab.renderTab.mockReturnValueOnce(pending.promise);
        const tabs = createTabControllerCache(() => Promise.resolve(tab));
        const render = tabs.render(0);
        await vi.waitFor(() => expect(tab.renderTab).toHaveBeenCalledTimes(1));
        tabs.pause();
        pending.resolve();
        await render;
        await tabs.render(0);
        expect(tab.renderTab).toHaveBeenCalledTimes(2);
    });

    it('suppresses a pending render on hide and restores it on the next selection', async () => {
        const pending = deferred();
        const tab = controller();
        const tabs = createTabControllerCache(() => pending.promise);
        const render = tabs.render(0);
        tabs.pause();
        pending.resolve(tab);
        await render;
        expect(tab.renderTab).not.toHaveBeenCalled();
        await tabs.render(0);
        expect(tab.renderTab).toHaveBeenCalledTimes(1);
    });

    it('destroys cached and pending controllers without rendering after destruction', async () => {
        const pending = deferred();
        const cached = controller();
        const late = controller();
        const load = vi.fn(index => index ? pending.promise : Promise.resolve(cached));
        const tabs = createTabControllerCache(load);
        await tabs.render(0);
        const render = tabs.render(1);
        tabs.destroy();
        pending.resolve(late);
        await render;
        await tabs.render(2);
        expect(cached.destroy).toHaveBeenCalledTimes(1);
        expect(late.destroy).toHaveBeenCalledTimes(1);
        expect(late.initTab).not.toHaveBeenCalled();
        expect(late.renderTab).not.toHaveBeenCalled();
        expect(load).toHaveBeenCalledTimes(2);
    });
});
