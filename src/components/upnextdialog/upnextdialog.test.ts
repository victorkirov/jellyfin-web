import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../playback/playbackmanager', () => ({ playbackManager: { duration: () => 0, currentTime: () => 0, nextTrack: vi.fn() } }));
vi.mock('../mediainfo/mediainfo', () => ({ default: { getPrimaryMediaInfoHtml: () => '' } }));
vi.mock('../../lib/layoutManager', () => ({ default: { tv: false } }));
vi.mock('../../lib/focusManager', () => ({ default: { focus: vi.fn() } }));
vi.mock('../../lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApiClient: () => ({ getCurrentUser: async () => ({ Configuration: {} }) }) } }));
vi.mock('../itemHelper', () => ({ default: { getDisplayName: () => 'Next video' } }));
vi.mock('../buttons/emby-button', () => ({}));

import Events from '../../utils/events';
import UpNextDialog from './upnextdialog';

afterEach(() => { document.body.innerHTML = ''; });

describe('up next lifecycle', () => {
    it('shows the next item and hides with its completion event', async () => {
        const parent = document.createElement('div');
        document.body.appendChild(parent);
        const instance = new UpNextDialog({ parent, nextItem: { Id: 'next' } });
        await vi.waitFor(() => expect(parent.classList.contains('upNextDialog-hidden')).toBe(false));
        const hidden = vi.fn();
        Events.on(instance, 'hide', hidden);
        const dismissed = instance.hide();
        parent.dispatchEvent(new Event('transitionend'));
        await dismissed;
        expect(parent.classList.contains('hide')).toBe(true);
        expect(hidden).toHaveBeenCalledOnce();
        instance.destroy();
    });
});
