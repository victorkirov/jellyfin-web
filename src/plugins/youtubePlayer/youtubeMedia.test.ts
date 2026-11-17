import { afterEach, expect, it, vi } from 'vitest';
import YoutubePlayer from './plugin';
import { createMediaElement } from './youtubeMedia';

vi.mock('../../scripts/browser', () => ({ default: { slow: false } }));
vi.mock('../../components/router/appRouter', () => ({ appRouter: {} }));
vi.mock('../../components/loading/loading', () => ({ default: { show: vi.fn(), hide: vi.fn() } }));
vi.mock('../../components/backdrop/backdrop', () => ({ setBackdropTransparency: vi.fn(), ['TRANSPARENCY_LEVEL']: {} }));

afterEach(() => {
    document.body.innerHTML = '';
    document.body.classList.remove('hide-scroll');
    Reflect.deleteProperty(HTMLElement.prototype, 'animate');
});
it('creates and reuses the fullscreen YouTube element on the TV', async () => {
    const instance = new YoutubePlayer();
    const options = { fullscreen: true, url: 'https://youtube.com/watch?v=test' };
    const player = await createMediaElement(instance, options);
    expect(player?.id).toBe('player');
    expect(document.body.classList.contains('hide-scroll')).toBe(true);
    expect(await createMediaElement(instance, options)).toBe(player);
    instance.destroy();
    expect(document.querySelector('.youtubePlayerContainer')).toBeNull();
});

it('resolves fullscreen media creation without waiting for a zoom animation', async () => {
    const animate = vi.fn(() => ({}));
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    const instance = new YoutubePlayer();
    const player = createMediaElement(instance, { fullscreen: true, url: 'https://youtube.com/watch?v=test' });
    await player;
    expect(animate).not.toHaveBeenCalled();
    Reflect.deleteProperty(HTMLElement.prototype, 'animate');
});
