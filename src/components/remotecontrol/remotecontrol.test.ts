import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updateNowPlayingInfo } from './remotecontrol';

const mocks = vi.hoisted(() => ({
    getItem: vi.fn(),
    getCurrentUser: vi.fn(),
    show: vi.fn()
}));
vi.mock('apps/legacy/features/playback/utils/image', () => ({ getImageUrl: () => '' }));
vi.mock('apps/legacy/features/playback/utils/itemText', () => ({ getItemTextLines: (item: { Name: string }) => [item.Name] }));
vi.mock('../../scripts/datetime', () => ({ default: {} }));
vi.mock('../backdrop/backdrop', () => ({ clearBackdrop: vi.fn(), setBackdrops: vi.fn() }));
vi.mock('../listview/listview', () => ({ default: {} }));
vi.mock('../images/imageLoader', () => ({ default: {} }));
vi.mock('../playback/playbackmanager', () => ({ playbackManager: {} }));
vi.mock('../apphost', () => ({ appHost: {} }));
vi.mock('../../lib/globalize', () => ({ default: {} }));
vi.mock('lib/jellyfin-apiclient', () => ({
    ServerConnections: { getApiClient: () => ({
        getCurrentUserId: () => 'user',
        getItem: mocks.getItem,
        getCurrentUser: mocks.getCurrentUser
    }) }
}));
vi.mock('../layoutManager', () => ({ default: {} }));
vi.mock('../../scripts/settings/userSettings', () => ({}));
vi.mock('../itemContextMenu', () => ({ default: { show: mocks.show } }));
vi.mock('../toast/toast', () => ({ default: {} }));
vi.mock('../router/appRouter', () => ({ appRouter: {} }));
vi.mock('../cardbuilder/utils/builder', () => ({ getDefaultBackgroundClass: () => '' }));
vi.mock('../../elements/emby-button/emby-button', () => ({}));
vi.mock('../../elements/emby-button/paper-icon-button-light', () => ({}));
vi.mock('../../elements/emby-itemscontainer/emby-itemscontainer', () => ({}));
vi.mock('../../elements/emby-ratingbutton/emby-ratingbutton', () => ({}));
vi.mock('../../elements/emby-slider/emby-slider', () => ({}));

function setup() {
    document.body.innerHTML = '<main><button class="btnToggleContextMenu"></button><div class="nowPlayingPageTitle"></div><div class="nowPlayingPageImageContainer"></div><div class="nowPlayingPageUserDataButtonsTitle"></div><div class="nowPlayingPageUserDataButtons"></div></main>';
    return document.querySelector('main')!;
}

function state(id: string) {
    return { NowPlayingItem: { Id: id, ServerId: 'server', Name: id, Type: 'Movie', MediaStreams: [{ Type: 'Video' }] } };
}

function fullItem(id: string) {
    return { Id: id, ServerId: 'server', Type: 'Movie', UserData: { IsFavorite: true } };
}

beforeEach(() => {
    vi.resetAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ Id: 'user' });
    mocks.show.mockResolvedValue(undefined);
});

describe('remote-control now-playing item', () => {
    it('shares one fetched item between the menu and both rating controls', async () => {
        const root = setup();
        const item = fullItem('current');
        mocks.getItem.mockResolvedValue(item);
        updateNowPlayingInfo(root, state('current'));
        await vi.waitFor(() => expect(root.querySelectorAll('[data-id="current"]')).toHaveLength(2));
        expect(mocks.getItem).toHaveBeenCalledExactlyOnceWith('user', 'current');
        root.querySelector<HTMLButtonElement>('.btnToggleContextMenu')!.click();
        expect(mocks.show).toHaveBeenCalledWith(expect.objectContaining({ item, user: { Id: 'user' } }));
    });

    it('keeps a late response for the previous track out of the current menu and ratings', async () => {
        const root = setup();
        let resolvePrevious!: (item: ReturnType<typeof fullItem>) => void;
        mocks.getItem.mockImplementation((_user, id) => id === 'previous' ? new Promise(resolve => {
            resolvePrevious = resolve;
        }) : Promise.resolve(fullItem('current')));
        updateNowPlayingInfo(root, state('previous'));
        updateNowPlayingInfo(root, state('current'));
        await vi.waitFor(() => expect(root.querySelectorAll('[data-id="current"]')).toHaveLength(2));
        resolvePrevious(fullItem('previous'));
        await Promise.resolve();
        await Promise.resolve();
        expect(root.querySelectorAll('[data-id="current"]')).toHaveLength(2);
        expect(mocks.getItem).toHaveBeenCalledTimes(2);
        root.querySelector<HTMLButtonElement>('.btnToggleContextMenu')!.click();
        expect(mocks.show).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ item: fullItem('current') }));
    });

    it('invalidates pending reads when playback stops and preserves menu focus', async () => {
        const root = setup();
        let resolveItem!: (item: ReturnType<typeof fullItem>) => void;
        mocks.getItem.mockReturnValue(new Promise(resolve => {
            resolveItem = resolve;
        }));
        root.querySelector<HTMLButtonElement>('.btnToggleContextMenu')!.focus();
        updateNowPlayingInfo(root, state('previous'));
        updateNowPlayingInfo(root, {});
        resolveItem(fullItem('previous'));
        await Promise.resolve();
        await Promise.resolve();
        expect(root.querySelectorAll('[data-id]')).toHaveLength(0);
        expect(document.activeElement).toBe(root.querySelector('.btnToggleContextMenu'));
        root.querySelector<HTMLButtonElement>('.btnToggleContextMenu')!.click();
        expect(mocks.show).not.toHaveBeenCalled();
        expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    });

    it('does not attach a menu for a previous track after delayed user lookup', async () => {
        const root = setup();
        let resolveUser!: (user: { Id: string }) => void;
        mocks.getCurrentUser.mockReturnValueOnce(new Promise(resolve => {
            resolveUser = resolve;
        })).mockResolvedValue({ Id: 'user' });
        mocks.getItem.mockImplementation((_user, id) => Promise.resolve(fullItem(id)));
        updateNowPlayingInfo(root, state('previous'));
        await Promise.resolve();
        const previousButton = root.querySelector<HTMLButtonElement>('.btnToggleContextMenu')!;
        updateNowPlayingInfo(root, state('current'));
        await vi.waitFor(() => expect(root.querySelectorAll('[data-id="current"]')).toHaveLength(2));
        resolveUser({ Id: 'user' });
        await Promise.resolve();
        previousButton.click();
        expect(mocks.show).not.toHaveBeenCalled();
        root.querySelector<HTMLButtonElement>('.btnToggleContextMenu')!.click();
        expect(mocks.show).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ item: fullItem('current') }));
    });

    it('allows the next update to recover after a rejected item request', async () => {
        const root = setup();
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mocks.getItem.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(fullItem('retry'));
        updateNowPlayingInfo(root, state('failed'));
        await Promise.resolve();
        await Promise.resolve();
        expect(errorLog).toHaveBeenCalledOnce();
        updateNowPlayingInfo(root, state('retry'));
        await vi.waitFor(() => expect(root.querySelectorAll('[data-id="retry"]')).toHaveLength(2));
        expect(mocks.getItem).toHaveBeenCalledTimes(2);
    });
});
