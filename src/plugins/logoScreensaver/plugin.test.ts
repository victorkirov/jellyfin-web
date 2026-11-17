import { afterEach, expect, it, vi } from 'vitest';
import LogoScreensaver from './plugin';

afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
});

it('shows a stationary logo and removes it without waiting for animation completion', async () => {
    vi.useFakeTimers();
    const animate = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    const screensaver = new LogoScreensaver();
    screensaver.show();
    await vi.waitFor(() => expect(document.querySelector('.logoScreenSaverImage')).not.toBeNull());
    expect(vi.getTimerCount()).toBe(0);
    await screensaver.hide();
    expect(document.querySelector('.logoScreenSaver')).toBeNull();
    expect(animate).not.toHaveBeenCalled();
    Reflect.deleteProperty(HTMLElement.prototype, 'animate');
});
