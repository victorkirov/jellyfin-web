import { afterEach, expect, it, vi } from 'vitest';
import YoutubePlayer from './plugin';
import { createMediaElement } from './youtubeMedia';

vi.mock('../../scripts/browser', () => ({ default: { slow: true } }));
vi.mock('../../components/router/appRouter', () => ({ appRouter: {} }));
vi.mock('../../components/loading/loading', () => ({ default: { show: vi.fn(), hide: vi.fn() } }));
vi.mock('../../components/backdrop/backdrop', () => ({ setBackdropTransparency: vi.fn(), TRANSPARENCY_LEVEL: {} }));

afterEach(() => { document.body.innerHTML = ''; document.body.classList.remove('hide-scroll'); });
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
