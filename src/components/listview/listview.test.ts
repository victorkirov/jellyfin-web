import { describe, expect, it, vi } from 'vitest';
import { getListViewHtml } from './listview';

vi.mock('lib/layoutManager', () => ({ default: { tv: true } }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApiClient: () => ({ getScaledImageUrl: () => 'image' }) } }));
vi.mock('../itemHelper', () => ({ default: { getDisplayName: (item: { Name: string }) => item.Name } }));
vi.mock('../mediainfo/mediainfo', () => ({ default: { getPrimaryMediaInfoHtml: () => '<span>media</span>' } }));
vi.mock('../indicators/indicators', () => ({ default: { getPlayedIndicatorHtml: () => '', getProgressBarHtml: () => '' } }));
vi.mock('../cardbuilder/cardBuilder', () => ({ default: { getDefaultText: () => 'fallback' } }));
vi.mock('../buttons/emby-ratingbutton', () => ({}));
vi.mock('../buttons/emby-playstatebutton', () => ({}));

describe('TV list markup', () => {
    it('keeps whole-row actions, escaped titles and no nested buttons', () => {
        const html = getListViewHtml({
            items: [{ Id: 'episode', ServerId: 'server', Type: 'Episode', Name: '<Pilot>', IsFolder: false, ImageTags: { Primary: 'tag' }, UserData: { Key: 'episode', PlaybackPositionTicks: 20 } }],
            imageSize: 'episode', enableOverview: true, dragHandle: true, imagePlayButton: true,
            infoButton: true, rightButtons: [{ id: 'extra', title: 'Extra', icon: 'add' }]
        });
        expect(html).toMatchSnapshot();
        const host = document.createElement('div');
        host.innerHTML = html;
        const row = host.querySelector('button')!;
        expect(row.dataset).toMatchObject({ id: 'episode', action: 'link', serverid: 'server', positionticks: '20' });
        expect(row.querySelector('button')).toBeNull();
        expect(row.querySelector('.listViewDragHandle')).toBeNull();
        expect(row.textContent).toContain('<Pilot>');
        document.body.appendChild(host);
        row.focus();
        expect(document.activeElement).toBe(row);
        row.click();
        host.remove();
    });
});
