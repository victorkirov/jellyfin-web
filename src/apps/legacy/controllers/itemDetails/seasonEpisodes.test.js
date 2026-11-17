import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import listView from 'components/listview/listview';
import shortcuts from 'components/shortcuts';
import focusManager from 'components/focusManager';
import viewManager from 'components/viewManager/viewManager';

const { showItem, play, layout, viewContainer, getScaledImageUrl } = vi.hoisted(() => ({
    showItem: vi.fn(), play: vi.fn(), layout: { tv: true },
    getScaledImageUrl: vi.fn(() => 'thumbnail.jpg'),
    viewContainer: { setOnBeforeChange: vi.fn(), loadView: vi.fn(), tryRestoreView: vi.fn() }
}));
const strings = JSON.parse(readFileSync('src/strings/en-us.json', 'utf8'));
vi.mock('lib/globalize', () => ({ default: { translate: (key, value) => (strings[key] || key).replace('{0}', value), getCurrentDateTimeLocale: () => 'en-US' } }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApiClient: () => ({ getScaledImageUrl }) } }));
vi.mock('components/cardbuilder/cardBuilder', () => ({ default: { getDefaultText: () => '' } }));
vi.mock('components/layoutManager', () => ({ default: layout }));
vi.mock('components/scrollManager', () => ({ default: { isEnabled: () => false } }));
vi.mock('components/viewContainer', () => ({ default: viewContainer }));
vi.mock('components/router/appRouter', () => ({ appRouter: { showItem } }));
vi.mock('components/playback/playbackmanager', () => ({ playbackManager: { play, canPlay: () => true } }));
vi.mock('scripts/inputManager', () => ({ default: { on: vi.fn(), off: vi.fn() } }));
vi.mock('scripts/settings/userSettings', () => ({ getSortValuesLegacy: () => ({ sortBy: 'SortName', sortOrder: 'Ascending' }) }));
vi.mock('components/toast/toast', () => ({ default: vi.fn() }));
vi.mock('elements/emby-button/emby-button', () => ({}));
vi.mock('elements/emby-progressbar/emby-progressbar', () => ({}));
vi.mock('elements/emby-ratingbutton/emby-ratingbutton', () => ({}));
vi.mock('elements/emby-playstatebutton/emby-playstatebutton', () => ({}));

const items = [1, 3, 4].map((number, index) => ({
    Id: 'episode-' + number, ServerId: 'server', Type: 'Episode', MediaType: 'Video',
    IndexNumber: number, IndexNumberEnd: index === 0 ? 2 : undefined, ParentIndexNumber: 1, Name: 'Episode title ' + number, RunTimeTicks: 18000000000,
    ImageTags: { Primary: 'image' }, UserData: { Played: index === 0, PlayedPercentage: index === 1 ? 50 : 0, PlaybackPositionTicks: index === 1 ? 9000000000 : 0 }
}));
let page;
let rows;
beforeEach(() => {
    vi.clearAllMocks();
    layout.tv = true;
    document.body.innerHTML = '<main class="page"><div class="itemsContainer vertical-list"></div></main>';
    page = document.querySelector('main');
    const container = page.querySelector('.itemsContainer');
    container.innerHTML = listView.getListViewHtml({ items, imageSize: 'episode', showIndexNumber: false, enableOverview: false, enableSideMediaInfo: false, action: 'link', imagePlayButton: true, includeParentInfoInTitle: false });
    rows = [...container.querySelectorAll('.listItem')];
    rows.forEach((row, index) => {
        Object.defineProperty(row, 'offsetParent', { configurable: true, value: container });
        row.getBoundingClientRect = () => ({ left: 50, right: 950, top: index * 140, bottom: index * 140 + 130, width: 900, height: 130 });
    });
    shortcuts.on(container);
});

describe('Compact season episodes', () => {
    it('renders episode numbers, titles, duration, watched and progress with smaller image requests', () => {
        expect(rows).toHaveLength(3);
        expect(rows.every(row => row.classList.contains('listItem-episode'))).toBe(true);
        expect(rows[0].querySelector('.listItemBodyText bdi').textContent).toBe('1-2. Episode title 1');
        expect(rows[0].textContent).toContain('30');
        expect(rows[0].querySelector('.playedIndicator')).not.toBeNull();
        expect(rows[1].querySelector('.listItemProgressBar')).not.toBeNull();
        expect(rows[1].dataset.positionticks).toBe('9000000000');
        expect(getScaledImageUrl).toHaveBeenCalledWith('episode-1', expect.objectContaining({ fillWidth: 240 }));
        expect(page.querySelector('.listItem-overview')).toBeNull();
    });

    it('keeps specials labels without a numeric prefix', () => {
        const special = { ...items[0], ParentIndexNumber: 0, IndexNumberEnd: undefined, Name: 'Behind the scenes' };
        const container = page.querySelector('.itemsContainer');
        container.innerHTML = listView.getListViewHtml({ items: [special], imageSize: 'episode', showIndexNumber: false, includeParentInfoInTitle: false });
        expect(container.querySelector('.listItemBodyText bdi').textContent).toBe(strings.ValueSpecialEpisodeName.replace('{0}', special.Name));
    });

    it('opens details on native button activation and moves through consecutive episodes', () => {
        rows[0].focus();
        focusManager.moveDown(rows[0]);
        expect(document.activeElement).toBe(rows[1]);
        // Enter on a native button dispatches click in the browser.
        rows[1].click();
        expect(showItem).toHaveBeenCalledWith(expect.objectContaining({ Id: 'episode-3', Type: 'Episode' }), expect.any(Object));
        expect(play).not.toHaveBeenCalled();
        focusManager.moveDown(rows[1]);
        expect(document.activeElement).toBe(rows[2]);
        focusManager.moveUp(rows[2]);
        expect(document.activeElement).toBe(rows[1]);
    });

    it('restores the selected row through the existing view manager after episode details', async () => {
        const options = { url: '#/details?id=season', autoFocus: false };
        viewContainer.loadView.mockResolvedValue(page);
        viewManager.loadView(options);
        await Promise.resolve();
        rows[1].focus();
        const episode = document.createElement('main');
        document.body.appendChild(episode);
        viewContainer.loadView.mockResolvedValue(episode);
        viewManager.loadView({ url: '#/details?id=episode-3', autoFocus: false });
        await Promise.resolve();
        rows[1].blur();
        viewContainer.tryRestoreView.mockResolvedValue(page);
        await viewManager.tryRestoreView(options);
        expect(document.activeElement).toBe(rows[1]);
        expect(page.querySelector('[data-id="episode-3"]')).toBe(rows[1]);
    });

    it('retains the separate image resume target in the existing pointer layout', () => {
        layout.tv = false;
        const container = page.querySelector('.itemsContainer');
        container.innerHTML = listView.getListViewHtml({ items: [items[1]], imageSize: 'episode', action: 'link', imagePlayButton: true, enableUserDataButtons: false, moreButton: false });
        container.querySelector('.listItemImageButton').click();
        expect(play).toHaveBeenCalledWith(expect.objectContaining({ ids: ['episode-3'], startPositionTicks: 9000000000 }));
    });
});
