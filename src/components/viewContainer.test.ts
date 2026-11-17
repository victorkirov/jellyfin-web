import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadView, reset, setOnBeforeChange, tryRestoreView } from './viewContainer';

beforeEach(() => {
    document.body.innerHTML = '<div class="mainAnimatedPages"></div>';
    reset();
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
});

describe('View initialization timing', () => {
    it('initializes a new view after the custom-element timer with its supplied controller', async () => {
        const beforeChange = vi.fn();
        const controllerFactory = vi.fn();
        setOnBeforeChange(beforeChange);
        const options = { view: '<div>View</div>', url: '/view', controllerFactory };
        const result = loadView(options);
        expect(beforeChange).not.toHaveBeenCalled();
        await Promise.resolve();
        expect(beforeChange).not.toHaveBeenCalled();
        await vi.runAllTimersAsync();
        const view = await result;
        expect(beforeChange).toHaveBeenCalledWith(view, false, options);
        expect(options.controllerFactory).toBe(controllerFactory);
    });

    it('restores a cached view asynchronously without another timer', async () => {
        const beforeChange = vi.fn();
        setOnBeforeChange(beforeChange);
        const loaded = loadView({ view: '<div>View</div>', url: '/view', controllerFactory: vi.fn() });
        await vi.runAllTimersAsync();
        const view = await loaded;
        beforeChange.mockClear();
        const options = { url: '/view' };
        const restored = tryRestoreView(options);
        expect(beforeChange).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
        expect(await restored).toBe(view);
        expect(beforeChange).toHaveBeenCalledWith(view, true, options);
    });
});
