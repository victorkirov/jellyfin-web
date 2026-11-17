import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { getListViewHtml } from './listview';
import { getIndex } from './rowContent';
import globalize from 'lib/globalize';
import type { ItemDto } from 'types/base/models/item-dto';

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

describe('Legacy list grouping keys', () => {
    it.each(['CommunityRating', 'CriticRating'])('preserves numeric %s buckets including zero and nonfinite keys', sortBy => {
        const ratings = [-0, 0, 4.9, 4.2, null, undefined, NaN, NaN];
        const items = ratings.map((rating, index): ItemDto => ({
            Id: String(index), Type: 'Movie', Name: 'Item ' + index,
            CommunityRating: sortBy === 'CommunityRating' ? rating : undefined,
            CriticRating: sortBy === 'CriticRating' ? rating : undefined
        }));
        expect(getIndex(items[0], { sortBy })).toBe(-0);
        expect(getIndex(items[2], { sortBy })).toBe(4);
        expect(getIndex(items[4], { sortBy })).toBe('Unrated');
        expect(getIndex(items[5], { sortBy })).toBe('Unrated');
        expect(getIndex(items[6], { sortBy })).toBeNaN();
        const host = document.createElement('div');
        host.innerHTML = getListViewHtml({ items, sortBy, showIndex: true, image: false, mediaInfo: false });
        expect(Array.from(host.querySelectorAll('.listGroupHeader'), header => header.textContent))
            .toEqual(['0', '4', 'Unrated', 'NaN', 'NaN']);
    });

    it('keeps numeric buckets distinct from matching localized text labels', () => {
        const translate = vi.spyOn(globalize, 'translate').mockImplementation(key => key === 'Unrated' ? '0' : key);
        onTestFinished(() => translate.mockRestore());
        const host = document.createElement('div');
        host.innerHTML = getListViewHtml({
            items: [{ Id: 'unrated', Type: 'Movie', Name: 'Unrated' }, { Id: 'rated', Type: 'Movie', Name: 'Rated', CommunityRating: 0 }],
            sortBy: 'CommunityRating', showIndex: true, image: false, mediaInfo: false
        });
        expect(Array.from(host.querySelectorAll('.listGroupHeader'), header => header.textContent)).toEqual(['0', '0']);
    });
});
