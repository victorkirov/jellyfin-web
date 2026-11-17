import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ player: {} }));
vi.mock('./playbackmanager', () => ({ playbackManager: { getCurrentPlayer: () => mocks.player, getBrightness: () => 50 } }));
import Events from '../../utils/events';

afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
});

it('shows brightness immediately and hides when its visible duration ends', async () => {
    vi.useFakeTimers();
    await import('./brightnessosd');
    Events.trigger(mocks.player, 'brightnesschange');
    const osd = document.querySelector<HTMLElement>('.brightnessOsd')!;
    expect(osd.classList.contains('hide')).toBe(false);
    expect(osd.classList.contains('iconOsd-hidden')).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(osd.classList.contains('hide')).toBe(true);
    Events.trigger(mocks.player, 'brightnesschange');
    expect(osd.classList.contains('hide')).toBe(false);
    Events.trigger(mocks.player, 'playbackstop');
    expect(osd.classList.contains('hide')).toBe(true);
});
