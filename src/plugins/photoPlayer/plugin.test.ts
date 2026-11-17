import { beforeEach, describe, expect, it, vi } from 'vitest';
import PhotoPlayer from './plugin';

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), block: vi.fn(), unblock: vi.fn(), show: vi.fn(), slideshow: vi.fn() }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { currentApiClient: () => ({ getCurrentUser: mocks.getCurrentUser }) } }));
vi.mock('scripts/screensavermanager', () => ({ default: { block: mocks.block, unblock: mocks.unblock } }));
vi.mock('scripts/settings/userSettings', () => ({ slideshowInterval: () => 7 }));
vi.mock('components/slideshow/slideshow', () => ({ default: function(options: unknown) { mocks.slideshow(options); return { show: mocks.show }; } }));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ Id: 'viewer' });
});

describe('photo playback', () => {
    it('preserves slideshow options and screensaver lifecycle', async () => {
        const items = [{ Id: 'photo' }];
        await expect(new PhotoPlayer().play({ items, startIndex: 1, shuffle: true })).resolves.toBeUndefined();
        expect(mocks.slideshow).toHaveBeenCalledWith(expect.objectContaining({ items, startIndex: 1, user: { Id: 'viewer' }, autoplay: { delay: 7000, enabled: true } }));
        expect(mocks.block).toHaveBeenCalledOnce();
        expect(mocks.show).toHaveBeenCalledOnce();
        const options = mocks.slideshow.mock.calls[0][0] as { onClose: () => void };
        options.onClose();
        expect(mocks.unblock).toHaveBeenCalledOnce();
    });
});
