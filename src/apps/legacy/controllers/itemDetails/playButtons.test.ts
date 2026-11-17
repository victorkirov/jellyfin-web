import { queryClient } from 'utils/query/queryClient';
import { getItemQuery } from 'hooks/useItem';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { type ItemDto, type TrackSelect, type StateButton, getElement } from './types';
import { type Api } from '@jellyfin/sdk';
import ItemDetails from './index';
import focusManager from 'lib/focusManager';
import cardBuilder from 'components/cardbuilder/cardBuilder';
import { requestActionBarLayout } from './actionBarLayout';
import type { UserDataChangedMessage } from '@jellyfin/sdk/lib/generated-client';

const { apiClient, playbackManager, fixture, hideLoading, getListViewHtml, getSdkItem, api, getCommands, showMenu, goBack } = vi.hoisted(() => {
    const data = { item: null as (ItemDto & { allowRating?: boolean }) | null };
    const client = {
        getItem: vi.fn(() => Promise.resolve(data.item)),
        getCurrentUser: vi.fn(() => Promise.resolve({ Id: 'user', Policy: {} })),
        getCurrentUserId: () => 'user',
        getItems: vi.fn(() => Promise.resolve({ Items: [] })),
        getEpisodes: vi.fn(() => Promise.resolve({ Items: [] })),
        getSeasons: vi.fn(() => Promise.resolve({ Items: [] })),
        getLiveTvPrograms: vi.fn(() => Promise.resolve({ Items: [] })),
        getNextUpEpisodes: vi.fn<(...args: unknown[]) => Promise<{ Items: ItemDto[] }>>().mockResolvedValue({ Items: [] }),

        getSimilarItems: vi.fn(() => Promise.resolve({ Items: [] })),
        subscribe: vi.fn<(_types: unknown, listener: (message: UserDataChangedMessage) => void) => void>()
    };
    return { getCommands: vi.fn().mockResolvedValue([]), showMenu: vi.fn().mockResolvedValue(undefined), goBack: vi.fn(), api: { basePath: 'https://test' } as Api, getSdkItem: vi.fn(() => Promise.resolve({ data: data.item })), apiClient: client, fixture: data, hideLoading: vi.fn(), getListViewHtml: vi.fn(() => ''), playbackManager: { canPlay: vi.fn(() => true), getSupportedCommands: vi.fn(() => ['PlayMediaSource']), play: vi.fn() } };
});
const strings: Record<string, string> = JSON.parse(readFileSync('src/strings/en-us.json', 'utf8'));
const template = readFileSync('src/apps/legacy/controllers/itemDetails/index.html', 'utf8');
vi.mock('lib/globalize', () => ({ default: {
    translate: (key: string, value?: string | number) => (strings[key] || key).replace('{0}', String(value)),
    getCurrentDateTimeLocale: () => 'en-US'
} }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApiClient: () => apiClient, currentApiClient: () => apiClient, getApi: () => api } }));
vi.mock('@jellyfin/sdk/lib/utils/api/library-api', () => ({ getLibraryApi: () => ({ getItem: getSdkItem }) }));
vi.mock('components/playback/playbackmanager', () => ({ playbackManager }));
vi.mock('components/apphost', () => ({ appHost: { supports: () => false } }));
vi.mock('components/backdrop/backdrop', () => ({ clearBackdrop: vi.fn(), setBackdrops: vi.fn() }));
vi.mock('components/cardbuilder/cardBuilder', () => ({ default: { getCardsHtml: () => '' } }));
vi.mock('components/cardbuilder/cardImage', () => ({ buildCardImage: () => '' }));
vi.mock('components/images/imageLoader', () => ({ default: { lazyChildren: vi.fn() } }));
vi.mock('components/itemContextMenu', () => ({ default: { getCommands, show: showMenu } }));
vi.mock('components/itemHelper', () => ({ default: {
    supportsMediaSourceSelection: () => true, canMarkPlayed: (item: ItemDto & { allowRating?: boolean }) => !!item.allowRating, canRate: (item: ItemDto & { allowRating?: boolean }) => !!item.allowRating,
    getDisplayName: (item: ItemDto) => item.Name, sortTracks: (first: { Index: number }, second: { Index: number }) => first.Index - second.Index
} }));
vi.mock('components/mediainfo/mediainfo', async importOriginal => {
    const original = await importOriginal<typeof import('components/mediainfo/mediainfo')>();
    return { default: { ...original.default, fillPrimaryMediaInfo: vi.fn(), fillSecondaryMediaInfo: vi.fn() } };
});
vi.mock('elements/emby-progressbar/emby-progressbar', () => ({}));
vi.mock('components/homesections/deferSection', () => ({ deferSection: () => vi.fn() }));
vi.mock('lib/focusManager', () => ({ default: { isCurrentlyFocusable: () => false, focus: vi.fn(), autoFocus: vi.fn() } }));
vi.mock('lib/layoutManager', () => ({ default: { tv: true } }));
vi.mock('components/listview/listview', () => ({ default: { getListViewHtml } }));
vi.mock('components/loading/loading', () => ({ default: { show: vi.fn(), hide: hideLoading } }));
vi.mock('components/itemDetails/ItemDetailsMetadataGroup', () => ({ default: vi.fn() }));
vi.mock('components/router/appRouter', () => ({ appRouter: { back: goBack, getRouteUrl: () => '#/tag' } }));
vi.mock('components/shortcuts', () => ({ default: { on: vi.fn(), off: vi.fn() } }));
vi.mock('components/autoFocuser', () => ({ default: { autoFocus: vi.fn() } }));
vi.mock('scripts/playlistViewer', () => ({ default: { render: vi.fn() } }));
vi.mock('scripts/browser', () => ({ default: {} }));
vi.mock('scripts/libraryMenu', () => ({ default: { setTitle: vi.fn(), setTransparentMenu: vi.fn() } }));
vi.mock('scripts/settings/userSettings', () => ({ enableBackdrops: () => false }));
vi.mock('scripts/inputManager', () => ({ default: { on: vi.fn(), off: vi.fn() } }));
vi.mock('utils/dom', () => ({ default: { getWindowSize: () => ({ innerWidth: 1280 }) } }));
vi.mock('apps/legacy/renderComponent', () => ({ renderComponent: () => vi.fn() }));
vi.mock('components/itemscontainer/emby-itemscontainer', () => ({}));
vi.mock('elements/emby-checkbox/emby-checkbox', () => ({}));
vi.mock('components/buttons/emby-button', () => ({}));
vi.mock('components/buttons/emby-playstatebutton', () => ({}));
vi.mock('components/buttons/emby-ratingbutton', () => ({}));
vi.mock('elements/emby-scroller/emby-scroller', () => ({}));
vi.mock('components/select/emby-select', () => ({}));

beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    apiClient.getNextUpEpisodes.mockResolvedValue({ Items: [] });
    getCommands.mockResolvedValue([]);
    showMenu.mockResolvedValue(undefined);
    playbackManager.canPlay.mockReturnValue(true);
    playbackManager.getSupportedCommands.mockReturnValue(['PlayMediaSource']);
    document.body.innerHTML = template.replace(/\$\{(\w+)\}/g, (match, key) => strings[key] || key);
    document.querySelectorAll<TrackSelect>('select').forEach(select => {
        select.setLabel = vi.fn();
    });
    document.querySelectorAll<StateButton>('.btnPlaystate, .btnUserRating').forEach(button => {
        button.setItem = vi.fn();
    });
});

describe('Details playback labels and actions', () => {
    it.each([
        ['resumable', 13800000000, false, 'Resume from 23:00', true],
        ['unstarted', 0, false, 'Play', false],
        ['completed', 0, true, 'Play', false],
        ['played-progress', 13800000000, true, 'Resume from 23:00', true]
    ])('labels %s items while retaining saved-position and restart semantics', async (state, ticks, played, label, replayVisible) => {
        const page = getElement(document, '#itemDetailPage');
        const item: ItemDto = { Id: state, Type: 'Movie', UserData: { Key: 'test', PlaybackPositionTicks: ticks, Played: played } };
        fixture.item = item;
        const controller = new ItemDetails(page, { id: state });
        expect(controller).toBeDefined();
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(getElement(page, '.btnPlay').classList.contains('hide')).toBe(false));
        const resume = getElement(page, '.btnPlay');
        const restart = getElement(page, '.btnReplay');
        expect(resume.textContent.trim()).toBe(label);
        expect(resume.title).toBe(label);
        expect(restart.textContent.trim()).toBe('Restart');
        expect(!restart.classList.contains('hide')).toBe(replayVisible);
        getElement(page, '.selectSource').innerHTML = '<option value="version">Version</option>';
        getElement(page, '.selectAudio').innerHTML = '<option value="4">English</option>';
        getElement(page, '.selectSubtitles').innerHTML = '<option value="7">English</option>';
        resume.click();
        expect(playbackManager.play).toHaveBeenLastCalledWith({ items: [item], startPositionTicks: ticks, mediaSourceId: 'version', audioStreamIndex: '4', subtitleStreamIndex: '7' });
        restart.click();
        expect(playbackManager.play).toHaveBeenLastCalledWith(expect.objectContaining({ startPositionTicks: 0 }));
    });

    it('provides visible secondary labels with the state-button update hook', () => {
        const page = getElement(document, '#itemDetailPage');
        expect(getElement(page, '.btnPlayTrailer .detailButton-text').textContent).toBe('Trailer');
        expect(getElement(page, '.btnPlaystate .button-text')).not.toBeNull();
        expect(getElement(page, '.btnUserRating .button-text')).not.toBeNull();
    });
});

describe('Details metadata order by item type', () => {
    it.each(['Series', 'Season', 'MusicAlbum', 'Playlist', 'BoxSet'])('keeps the intended metadata order for %s', async type => {
        const page = getElement(document, '#itemDetailPage');
        fixture.item = { Id: type, Type: type as ItemDto['Type'], IsFolder: true, SeriesId: 'series' };
        expect(new ItemDetails(page, { id: type })).toBeDefined();
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(hideLoading).toHaveBeenCalled());
        const viewingFirst = type === 'Series' || type === 'Season';
        const firstChoice = getElement(page, viewingFirst ? '.nextUpSection' : '.collectionItems');
        const children = getElement(page, '#listChildrenCollapsible');
        for (const selector of ['.detailSectionContent', '.itemDetailsGroup']) {
            const metadata = getElement(page, selector);
            const isAfterChoices = Boolean(firstChoice.compareDocumentPosition(metadata) & Node.DOCUMENT_POSITION_FOLLOWING);
            expect(isAfterChoices).toBe(viewingFirst);
            const isAfterChildren = Boolean(children.compareDocumentPosition(metadata) & Node.DOCUMENT_POSITION_FOLLOWING);
            expect(isAfterChildren).toBe(viewingFirst);
        }
    });
});

describe('Season details controller', () => {
    it('uses the compact renderer without fetching unused episode synopses', async () => {
        const page = getElement(document, '#itemDetailPage');
        fixture.item = { Id: 'season', Type: 'Season', IsFolder: true, SeriesId: 'series' };
        expect(new ItemDetails(page, { id: 'season' })).toBeDefined();
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(getListViewHtml).toHaveBeenCalled());
        expect(getListViewHtml).toHaveBeenCalledWith(expect.objectContaining({ imageSize: 'episode', showIndexNumber: false, enableOverview: false, action: 'link', imagePlayButton: true }));
        expect(apiClient.getEpisodes).toHaveBeenCalledWith('series', expect.objectContaining({ Fields: 'ItemCounts,PrimaryImageAspectRatio,CanDelete,MediaSourceCount' }));
    });
});

describe('Structured details track labels', () => {
    it('keeps useful distinctions first and retains stream identities through playback', async () => {
        const name = 'Back.to.the.Future.1985.1080p.BluRay.release';
        fixture.item = {
            Id: 'tracks', Type: 'Movie', MediaType: 'Video',
            UserData: { Key: 'test', PlaybackPositionTicks: 500000000 },
            MediaSources: [{ Id: 'tracks', Name: name, DefaultAudioStreamIndex: 5, DefaultSubtitleStreamIndex: 12, MediaStreams: [
                { Type: 'Video', Index: 0, Width: 1920, Height: 1080, Codec: 'h264', Title: name, DisplayTitle: name },
                { Type: 'Video', Index: 1, Width: 1280, Height: 720, Codec: 'hevc', Title: 'Restored edition', DisplayTitle: name },
                { Type: 'Audio', Index: 2, Language: 'eng', LocalizedLanguage: 'English', Codec: 'aac', ChannelLayout: 'stereo', IsDefault: true, DisplayTitle: name },
                { Type: 'Audio', Index: 5, Language: 'eng', LocalizedLanguage: 'English', Codec: 'aac', Channels: 2, Title: 'Director commentary', DisplayTitle: name },
                { Type: 'Audio', Index: 9, DisplayTitle: name },
                { Type: 'Subtitle', Index: 12, LocalizedLanguage: 'English', Codec: 'srt', IsForced: true, Title: 'English', DisplayTitle: name },
                { Type: 'Subtitle', Index: 13, Language: 'eng', Codec: 'srt', Title: '<b>Signs & songs</b>', DisplayTitle: name }
            ] }]
        };
        const page = getElement(document, '#itemDetailPage');
        expect(new ItemDetails(page, { id: 'tracks' })).toBeDefined();
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(getElement(page, '.selectAudio').options).toHaveLength(3));
        const video = getElement(page, '.selectVideo');
        const audio = getElement(page, '.selectAudio');
        const subtitles = getElement(page, '.selectSubtitles');
        expect([...video.options].map(option => option.textContent)).toEqual(['1080p · H264', '720p · HEVC · Restored edition']);
        expect([...audio.options].map(option => option.textContent)).toEqual(['English · AAC · stereo · Default', 'English · AAC · 2 Channels · Director commentary', 'Audio 10']);
        expect([...subtitles.options].map(option => option.textContent)).toEqual(['Off', 'English · SRT · Forced', 'eng · SRT · <b>Signs & songs</b>']);
        expect([video, audio, subtitles].map(select => select.textContent).join(' ')).not.toContain(name);
        expect(getElement(subtitles, 'b')).toBeNull();
        expect([...audio.options].map(option => option.value)).toEqual(['2', '5', '9']);
        expect(audio.value).toBe('5');
        expect(subtitles.value).toBe('12');
        audio.value = '9';
        subtitles.value = '13';
        getElement(page, '.btnPlay').click();
        expect(playbackManager.play).toHaveBeenLastCalledWith(expect.objectContaining({ startPositionTicks: 500000000, audioStreamIndex: '9', subtitleStreamIndex: '13', mediaSourceId: 'tracks' }));
    });

    it('handles absent stream metadata and caps supplementary titles without inspecting paths', async () => {
        fixture.item = { Id: 'missing', Type: 'Movie', MediaSources: [{ Id: 'missing', Name: 'Version', MediaStreams: [
            { Type: 'Video', Index: 4 }, { Type: 'Audio', Index: 8, Title: 'x'.repeat(100) }, { Type: 'Subtitle', Index: 16 }
        ] }] };
        const page = getElement(document, '#itemDetailPage');
        expect(new ItemDetails(page, { id: 'missing' })).toBeDefined();
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(getElement(page, '.selectAudio').options).toHaveLength(1));
        expect(getElement(page, '.selectVideo').textContent).toBe('Video 5');
        expect(getElement(page, '.selectAudio').textContent).toBe('Audio 9');
        expect(getElement(page, '.selectSubtitles').options[1].textContent).toBe('Subtitles 17');
        expect(getElement(page, '.selectSubtitles').value).toBe('-1');
        expect(getElement(page, '.trackSelections').textContent).not.toContain('undefined');
    });
});

describe('Track accessibility and range distinctions', () => {
    it('distinguishes SDH, external subtitles and HDR video without changing stream values', async () => {
        fixture.item = { Id: 'flags', Type: 'Movie', MediaSources: [{
            Id: 'flags', Name: 'Version', DefaultSubtitleStreamIndex: 7, MediaStreams: [
                { Type: 'Video', Index: 0, Codec: 'hevc', VideoRangeType: 'DOVIWithHDR10' },
                { Type: 'Video', Index: 1, Codec: 'h264', VideoRangeType: 'SDR' },
                { Type: 'Subtitle', Index: 3, Language: 'English', Codec: 'subrip' },
                { Type: 'Subtitle', Index: 4, Language: 'English', Codec: 'subrip', IsHearingImpaired: true },
                { Type: 'Subtitle', Index: 7, Language: 'English', Codec: 'subrip', IsExternal: true, LocalizedExternal: 'External subtitle' },
                { Type: 'Subtitle', Index: 9, Language: 'English', Codec: 'subrip', IsExternal: true }
            ]
        }] };
        const page = getElement(document, '#itemDetailPage');
        expect(new ItemDetails(page, { id: 'flags' })).toBeDefined();
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(getElement(page, '.selectSubtitles').options).toHaveLength(5));
        const video = getElement(page, '.selectVideo');
        const subtitles = getElement(page, '.selectSubtitles');
        expect([...video.options].map(option => option.textContent)).toEqual(['HEVC · DOVIWithHDR10', 'H264']);
        expect([...subtitles.options].map(option => option.textContent)).toEqual([
            'Off', 'English · SUBRIP', 'English · SUBRIP · HI/SDH',
            'English · SUBRIP · External subtitle', 'English · SUBRIP · External'
        ]);
        expect([...subtitles.options].map(option => option.value)).toEqual(['-1', '3', '4', '7', '9']);
        expect(subtitles.value).toBe('7');
        subtitles.value = '4';
        getElement(page, '.btnPlay').click();
        expect(playbackManager.play).toHaveBeenLastCalledWith(expect.objectContaining({ subtitleStreamIndex: '4', mediaSourceId: 'flags' }));
    });
});

describe('Details item query reuse and freshness', () => {
    it('reuses the item fetched by navigation without a legacy item request', async () => {
        fixture.item = { Id: 'cached', Type: 'Movie', ServerId: 'server' };
        await queryClient.fetchQuery(getItemQuery(api, 'cached', 'user'));
        const page = getElement(document, '#itemDetailPage');
        expect(new ItemDetails(page, { id: 'cached', serverId: 'server' })).toBeDefined();
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(hideLoading).toHaveBeenCalled());
        expect(getSdkItem).toHaveBeenCalledTimes(1);
        expect(apiClient.getItem).not.toHaveBeenCalled();
    });

    it.each([
        [{ basePath: 'https://other' }, 'user'],
        [{ basePath: 'https://test' }, 'other-user']
    ])('does not reuse another server or user item cache: %j / %s', async (previousApi, previousUser) => {
        fixture.item = { Id: 'switched', Type: 'Movie', ServerId: 'old-server' };
        await queryClient.fetchQuery(getItemQuery(previousApi as Api, 'switched', previousUser));
        fixture.item = { Id: 'switched', Type: 'Movie', ServerId: 'server', UserData: { Key: 'test', IsFavorite: true } };
        const page = getElement(document, '#itemDetailPage');
        expect(new ItemDetails(page, { id: 'switched', serverId: 'server' })).toBeDefined();
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(hideLoading).toHaveBeenCalled());
        expect(getSdkItem).toHaveBeenCalledTimes(2);
        expect(queryClient.getQueryData(getItemQuery(api, 'switched', 'user').queryKey)).toEqual(fixture.item);
    });

    it('refetches invalidated user data when navigating to details again', async () => {
        fixture.item = { Id: 'invalidated', Type: 'Movie', ServerId: 'server' };
        const query = getItemQuery(api, 'invalidated', 'user');
        await queryClient.fetchQuery(query);
        await queryClient.invalidateQueries({ queryKey: query.queryKey });
        fixture.item = { ...fixture.item!, UserData: { Key: 'test', Played: true, IsFavorite: true } };
        const page = getElement(document, '#itemDetailPage');
        expect(new ItemDetails(page, { id: 'invalidated', serverId: 'server' })).toBeDefined();
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(hideLoading).toHaveBeenCalled());
        expect(getSdkItem).toHaveBeenCalledTimes(2);
        expect(queryClient.getQueryData(query.queryKey)!.UserData).toEqual({ Key: 'test', Played: true, IsFavorite: true });
    });

    it('fetches an alternate version through the item cache and keeps its playback identity', async () => {
        const sources = ['first', 'second'].map(Id => ({ Id, Name: Id, MediaStreams: [] }));
        fixture.item = { Id: 'first', Type: 'Movie', ServerId: 'server', MediaSources: sources };
        const page = getElement(document, '#itemDetailPage');
        expect(new ItemDetails(page, { id: 'first', serverId: 'server' })).toBeDefined();
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(hideLoading).toHaveBeenCalled());
        fixture.item = { ...fixture.item!, Id: 'second', UserData: { Key: 'test', PlaybackPositionTicks: 10000000 } };
        const select = getElement(page, '.selectSource');
        select.value = 'second';
        select.dispatchEvent(new Event('change'));
        await vi.waitFor(() => expect(getSdkItem).toHaveBeenCalledTimes(2));
        await vi.waitFor(() => expect(getElement(page, '.btnPlay').textContent.trim()).toBe('Resume from 0:01'));
        getElement(page, '.btnPlay').click();
        expect(playbackManager.play).toHaveBeenLastCalledWith(expect.objectContaining({
            items: [fixture.item], mediaSourceId: 'second', startPositionTicks: 10000000
        }));
        expect(queryClient.getQueryData(getItemQuery(api, 'second', 'user').queryKey)).toEqual(fixture.item);
    });

    it('refreshes a restored item after playback or favourite changes without a version selector', async () => {
        fixture.item = { Id: 'restore', Type: 'Movie', ServerId: 'server', allowRating: true, UserData: { Key: 'test', PlaybackPositionTicks: 0 } };
        const page = getElement(document, '#itemDetailPage');
        expect(new ItemDetails(page, { id: 'restore', serverId: 'server' })).toBeDefined();
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(hideLoading).toHaveBeenCalled());
        fixture.item = { ...fixture.item!, UserData: { Key: 'test', PlaybackPositionTicks: 13800000000, IsFavorite: true, Played: true } };
        page.dispatchEvent(new CustomEvent('viewshow', { detail: { isRestored: true } }));
        await vi.waitFor(() => expect(getElement(page, '.btnPlay').textContent.trim()).toBe('Resume from 23:00'));
        expect(getSdkItem).toHaveBeenCalledTimes(2);
        expect((getElement(page, '.btnUserRating') as StateButton).setItem).toHaveBeenLastCalledWith(fixture.item);
        expect((getElement(page, '.btnPlaystate') as StateButton).setItem).toHaveBeenLastCalledWith(fixture.item);
    });
});

describe('Details request failures', () => {
    it.each([
        ['item', () => getSdkItem.mockRejectedValueOnce(new Error('offline'))],
        ['current user', () => apiClient.getCurrentUser.mockRejectedValueOnce(new Error('offline'))]
    ])('releases loading after the %s request rejects and permits retry', async (_name, failOnce) => {
        vi.spyOn(console, 'error').mockReturnValue(undefined);
        // The shared client retries failed queries with backoff; disable that here to test the failure path directly.
        const defaults = queryClient.getDefaultOptions();
        queryClient.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retry: false } });
        onTestFinished(() => queryClient.setDefaultOptions(defaults));
        failOnce();
        const page = getElement(document, '#itemDetailPage');
        fixture.item = { Id: 'failing-movie', Type: 'Movie', MediaType: 'Video', ServerId: 'server', UserData: { Key: 'test' } };
        expect(new ItemDetails(page, { id: 'failing-movie', serverId: 'server' })).toBeDefined();
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(hideLoading).toHaveBeenCalled());
        expect(getElement(page, '.btnPlay').classList.contains('hide')).toBe(true);
        expect(getElement(page, '.detailLoadError').classList.contains('hide')).toBe(false);
        expect(getElement(page, '.detailPageWrapperContainer').classList.contains('hide')).toBe(true);
        expect(focusManager.focus).toHaveBeenLastCalledWith(getElement(page, '.btnRetry'));
        getElement(page, '.btnDetailsBack').click();
        expect(goBack).toHaveBeenCalledOnce();
        getElement(page, '.btnRetry').click();
        await vi.waitFor(() => expect(getElement(page, '.btnPlay').classList.contains('hide')).toBe(false));
        expect(getElement(page, '.detailLoadError').classList.contains('hide')).toBe(true);
        expect(getElement(page, '.detailPageWrapperContainer').classList.contains('hide')).toBe(false);
    });
});

describe('Details failed reload recovery', () => {
    it('hides stale actions and prevents the previous title from playing after failure', async () => {
        vi.spyOn(console, 'error').mockReturnValue(undefined);
        const defaults = queryClient.getDefaultOptions();
        queryClient.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retry: false } });
        onTestFinished(() => queryClient.setDefaultOptions(defaults));
        fixture.item = { Id: 'reload', Type: 'Movie' };
        const page = getElement(document, '#itemDetailPage');
        expect(new ItemDetails(page, { id: 'reload' })).toBeDefined();
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(hideLoading).toHaveBeenCalled());
        await queryClient.invalidateQueries();
        getSdkItem.mockRejectedValueOnce(new Error('offline'));
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(getElement(page, '.detailLoadError').classList.contains('hide')).toBe(false));
        expect(getElement(page, '.detailPageWrapperContainer').classList.contains('hide')).toBe(true);
        getElement(page, '.btnPlay').click();
        expect(playbackManager.play).not.toHaveBeenCalled();
    });
});

async function openResumableSeries() {
    fixture.item = { Id: 'series', Type: 'Series', IsFolder: true, UserData: { Key: 'series', Played: false, PlaybackPositionTicks: 0, UnplayedItemCount: 5 } };
    const episode: ItemDto = { Id: 'next', SeriesId: 'series', Type: 'Episode', ParentIndexNumber: 14, IndexNumber: 8, UserData: { Key: 'next', PlaybackPositionTicks: 7200000000 } };
    apiClient.getNextUpEpisodes.mockResolvedValue({ Items: [episode] });
    const page = getElement(document, '#itemDetailPage');
    expect(new ItemDetails(page, { id: 'series' })).toBeDefined();
    page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
    await vi.waitFor(() => expect(getElement(page, '.btnPlay').title).toBe('Resume from 12:00 · S14:E8'));
    const listener = apiClient.subscribe.mock.calls[apiClient.subscribe.mock.calls.length - 1][1];
    return { page, episode, listener };
}

function actionGeometry(page: HTMLElement) {
    const bar = getElement(page, '.mainDetailButtons');
    const geometry = { width: 500 };
    Object.defineProperty(bar, 'clientWidth', { get: () => geometry.width });
    for (const button of bar.querySelectorAll<HTMLButtonElement>('button')) {
        button.getBoundingClientRect = vi.fn(() => {
            const naturalWidth = button.classList.contains('btnPlay') ? 400 : 230;
            const width = button.classList.contains('hide') ? 0 : naturalWidth;
            const height = width ? 70 : 0;
            return { x: 0, y: 0, left: 0, top: 0, width, height, right: width, bottom: height, toJSON: () => ({}) };
        });
    }
    return geometry;
}

it('restores a series target and aria-label without waiting for the item refresh', async () => {
    const { page, episode } = await openResumableSeries();
    const geometry = actionGeometry(page);
    const play = getElement(page, '.btnPlay');
    const shuffle = getElement(page, '.btnShuffle');
    requestActionBarLayout(page);
    await Promise.resolve();
    expect(shuffle.classList.contains('detailButton-iconOnly')).toBe(true);
    page.dispatchEvent(new CustomEvent('viewbeforehide'));
    geometry.width = 0;
    requestActionBarLayout(page);
    await Promise.resolve();
    let resolveItem!: (value: { data: typeof fixture.item }) => void;
    getSdkItem.mockReturnValueOnce(new Promise(resolve => {
        resolveItem = resolve;
    }));
    const resumed = { ...episode, UserData: { ...episode.UserData!, PlaybackPositionTicks: 18000000000 } };
    apiClient.getNextUpEpisodes.mockResolvedValueOnce({ Items: [resumed] });
    geometry.width = 1200;
    page.dispatchEvent(new CustomEvent('viewshow', { detail: { isRestored: true } }));
    expect(apiClient.getNextUpEpisodes).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(play.getAttribute('aria-label')).toBe('Resume from 30:00 · S14:E8'));
    expect(play.title).toBe('Resume from 30:00 · S14:E8');
    expect(shuffle.classList.contains('detailButton-iconOnly')).toBe(false);
    play.click();
    expect(playbackManager.play).toHaveBeenLastCalledWith(expect.objectContaining({ items: [resumed], startPositionTicks: 18000000000 }));
    resolveItem({ data: fixture.item });
    await vi.waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(apiClient.getNextUpEpisodes).toHaveBeenCalledTimes(2);
    expect(play.getAttribute('aria-label')).toBe(play.title);
});

it('re-runs a movie layout skipped at zero width on restored viewshow', async () => {
    fixture.item = { Id: 'movie', Type: 'Movie', UserData: { Key: 'movie', PlaybackPositionTicks: 7200000000 } };
    const page = getElement(document, '#itemDetailPage');
    expect(new ItemDetails(page, { id: 'movie' })).toBeDefined();
    page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
    await vi.waitFor(() => expect(hideLoading).toHaveBeenCalled());
    const geometry = actionGeometry(page);
    const play = getElement(page, '.btnPlay');
    const restart = getElement(page, '.btnReplay');
    requestActionBarLayout(page);
    await Promise.resolve();
    expect(restart.classList.contains('detailButton-iconOnly')).toBe(true);
    page.dispatchEvent(new CustomEvent('viewbeforehide'));
    geometry.width = 0;
    requestActionBarLayout(page);
    await Promise.resolve();
    let resolveItem!: (value: { data: typeof fixture.item }) => void;
    getSdkItem.mockReturnValueOnce(new Promise(resolve => {
        resolveItem = resolve;
    }));
    geometry.width = 1200;
    page.dispatchEvent(new CustomEvent('viewshow', { detail: { isRestored: true } }));
    await Promise.resolve();
    expect(restart.classList.contains('detailButton-iconOnly')).toBe(false);
    expect(play.getAttribute('aria-label')).toBe('Resume from 12:00');
    resolveItem({ data: fixture.item });
    await vi.waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(apiClient.getNextUpEpisodes).not.toHaveBeenCalled();
});

describe('Details action eligibility and resolved series target', () => {
    it.each(['Series', 'Season'] as const)('keeps generic Play on unresolved %s and retains folder actions', async Type => {
        fixture.item = { Id: 'folder', Type, IsFolder: true };
        const page = getElement(document, '#itemDetailPage');
        expect(new ItemDetails(page, { id: 'folder' })).toBeDefined();
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(hideLoading).toHaveBeenCalled());
        expect(getElement(page, '.btnPlay').title).toBe('Play');
        expect(getElement(page, '.btnShuffle').classList.contains('hide')).toBe(false);
        expect(getElement(page, '.btnReplay').classList.contains('hide')).toBe(true);
        expect(getElement(page, '.detailOverviewGroup').classList.contains('hide')).toBe(true);
        getElement(page, '.btnPlay').click();
        expect(playbackManager.play).toHaveBeenCalledWith(expect.objectContaining({ items: [fixture.item] }));
    });

    it.each([[0, 'Play S14:E8'], [7200000000, 'Resume from 12:00 · S14:E8']])('binds the series label and position to the exact Next Up episode: %s', async (ticks, label) => {
        fixture.item = { Id: 'series', Type: 'Series', IsFolder: true };
        const episode: ItemDto = { Id: 'next', SeriesId: 'series', Type: 'Episode', ParentIndexNumber: 14, IndexNumber: 8, UserData: { Key: 'next', PlaybackPositionTicks: ticks } };
        apiClient.getNextUpEpisodes.mockResolvedValue({ Items: [episode] });
        const page = getElement(document, '#itemDetailPage');
        expect(new ItemDetails(page, { id: 'series' })).toBeDefined();
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(getElement(page, '.btnPlay').title).toBe(label));
        getElement(page, '.btnPlay').click();
        expect(playbackManager.play).toHaveBeenCalledWith(expect.objectContaining({ items: [episode], startPositionTicks: ticks }));
        expect(apiClient.getNextUpEpisodes).toHaveBeenCalledTimes(1);
        page.dispatchEvent(new CustomEvent('viewshow', { detail: { isRestored: true } }));
        await vi.waitFor(() => expect(apiClient.getNextUpEpisodes).toHaveBeenCalledTimes(2));
        await vi.waitFor(() => expect(getElement(page, '.btnPlay').title).toBe(label));
        getElement(page, '.btnPlay').click();
        expect(playbackManager.play).toHaveBeenLastCalledWith(expect.objectContaining({ items: [episode], startPositionTicks: ticks }));
    });

    it.each([{ IsFavorite: true }, { Likes: true }, { Played: false }, { PlaybackPositionTicks: 0 }, { UnplayedItemCount: 5 }])('keeps the resume target for non-playback or unchanged series data: %j', async change => {
        const { page, episode, listener } = await openResumableSeries();
        listener({ Data: { UserId: 'user', UserDataList: [{ ItemId: 'series', Key: 'series', ...change }] } });
        expect(getElement(page, '.btnPlay').title).toBe('Resume from 12:00 · S14:E8');
        getElement(page, '.btnPlay').click();
        expect(playbackManager.play).toHaveBeenLastCalledWith(expect.objectContaining({ items: [episode], startPositionTicks: 7200000000 }));
        expect(apiClient.getNextUpEpisodes).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['series', { Played: true }],
        ['series', { PlaybackPositionTicks: 10000000 }],
        ['series', { UnplayedItemCount: 4 }],
        ['next', { IsFavorite: true }]
    ] as const)('re-resolves the live target for playback-relevant changes: %s / %j', async (itemId, change) => {
        const { page, listener } = await openResumableSeries();
        const episode: ItemDto = { Id: 'new', SeriesId: 'series', Type: 'Episode', ParentIndexNumber: 14, IndexNumber: 9 };
        apiClient.getNextUpEpisodes.mockResolvedValueOnce({ Items: [episode] });
        listener({ Data: { UserId: 'user', UserDataList: [{ ItemId: itemId, Key: 'series', ...change }] } });
        const pendingLabel = 'PlaybackPositionTicks' in change ? 'Resume from 0:01' : 'Play';
        expect(getElement(page, '.btnPlay').title).toBe(pendingLabel);
        expect(getElement(page, '.btnPlay').classList.contains('hide')).toBe(false);
        getElement(page, '.btnPlay').click();
        expect(playbackManager.play).toHaveBeenLastCalledWith(expect.objectContaining({ items: [expect.objectContaining({ Id: 'series' })] }));
        await vi.waitFor(() => expect(getElement(page, '.btnPlay').title).toBe('Play S14:E9'));
        getElement(page, '.btnPlay').click();
        expect(playbackManager.play).toHaveBeenLastCalledWith(expect.objectContaining({ items: [episode], startPositionTicks: 0 }));
        expect(apiClient.getNextUpEpisodes).toHaveBeenCalledTimes(2);
    });

    it.each([['other', 'user'], ['next', 'another-user']])('ignores unrelated items and other users: %s / %s', async (itemId, userId) => {
        const { page, listener } = await openResumableSeries();
        listener({ Data: { UserId: userId, UserDataList: [{ ItemId: itemId, Key: itemId, Played: true }] } });
        expect(getElement(page, '.btnPlay').title).toBe('Resume from 12:00 · S14:E8');
        expect(apiClient.getNextUpEpisodes).toHaveBeenCalledTimes(1);
    });

    it('accepts a pending Next Up response after a Favorite-only series change', async () => {
        const episode: ItemDto = { Id: 'next', SeriesId: 'series', Type: 'Episode', ParentIndexNumber: 14, IndexNumber: 8, UserData: { Key: 'next', PlaybackPositionTicks: 7200000000 } };
        fixture.item = { Id: 'series', Type: 'Series', IsFolder: true };
        let resolveNextUp!: (value: { Items: ItemDto[] }) => void;
        apiClient.getNextUpEpisodes.mockReturnValueOnce(new Promise(resolve => {
            resolveNextUp = resolve;
        }));
        const page = getElement(document, '#itemDetailPage');
        expect(new ItemDetails(page, { id: 'series' })).toBeDefined();
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(hideLoading).toHaveBeenCalled());
        const listener = apiClient.subscribe.mock.calls[apiClient.subscribe.mock.calls.length - 1][1];
        listener({ Data: { UserId: 'user', UserDataList: [{ ItemId: 'series', Key: 'series', IsFavorite: true }] } });
        resolveNextUp({ Items: [episode] });
        await vi.waitFor(() => expect(getElement(page, '.btnPlay').title).toBe('Resume from 12:00 · S14:E8'));
        getElement(page, '.btnPlay').click();
        expect(playbackManager.play).toHaveBeenLastCalledWith(expect.objectContaining({ items: [episode], startPositionTicks: 7200000000 }));
        expect(apiClient.getNextUpEpisodes).toHaveBeenCalledTimes(1);
    });

    it.each(['series', 'next'])('ignores an older %s refresh response for both the target and Next Up cards', async itemId => {
        const { page, listener } = await openResumableSeries();
        const cards = vi.spyOn(cardBuilder, 'getCardsHtml');
        let resolveOlder!: (value: { Items: ItemDto[] }) => void;
        let resolveLatest!: (value: { Items: ItemDto[] }) => void;
        apiClient.getNextUpEpisodes.mockReturnValueOnce(new Promise(resolve => {
            resolveOlder = resolve;
        })).mockReturnValueOnce(new Promise(resolve => {
            resolveLatest = resolve;
        }));
        listener({ Data: { UserId: 'user', UserDataList: [{ ItemId: itemId, Key: 'series', Played: true }] } });
        listener({ Data: { UserId: 'user', UserDataList: [{ ItemId: itemId, Key: 'series', Played: false }] } });
        const latest: ItemDto = { Id: 'latest', SeriesId: 'series', Type: 'Episode', ParentIndexNumber: 14, IndexNumber: 10 };
        resolveLatest({ Items: [latest] });
        await vi.waitFor(() => expect(getElement(page, '.btnPlay').title).toBe('Play S14:E10'));
        resolveOlder({ Items: [{ ...latest, Id: 'old', IndexNumber: 9 }] });
        await Promise.resolve();
        expect(getElement(page, '.btnPlay').title).toBe('Play S14:E10');
        expect(cards).toHaveBeenLastCalledWith(expect.objectContaining({ items: [latest] }));
        getElement(page, '.btnPlay').click();
        expect(playbackManager.play).toHaveBeenLastCalledWith(expect.objectContaining({ items: [latest] }));
        expect(apiClient.getNextUpEpisodes).toHaveBeenCalledTimes(3);
    });

    it('keeps generic Play usable when a Next Up refresh fails', async () => {
        const { page, listener } = await openResumableSeries();
        vi.spyOn(console, 'error').mockReturnValue(undefined);
        apiClient.getNextUpEpisodes.mockRejectedValueOnce(new Error('offline'));
        listener({ Data: { UserId: 'user', UserDataList: [{ ItemId: 'series', Key: 'series', Played: true }] } });
        await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith('failed to load Next Up', expect.any(Error)));
        expect(getElement(page, '.btnPlay').title).toBe('Play');
        getElement(page, '.btnPlay').click();
        expect(playbackManager.play).toHaveBeenLastCalledWith(expect.objectContaining({ items: [expect.objectContaining({ Id: 'series' })] }));
    });

    it('leaves Play generic when Next Up lacks a verified episode number', async () => {
        fixture.item = { Id: 'series', Type: 'Series', IsFolder: true };
        apiClient.getNextUpEpisodes.mockResolvedValue({ Items: [{ Id: 'unknown', Type: 'Episode' }] });
        const page = getElement(document, '#itemDetailPage');
        expect(new ItemDetails(page, { id: 'series' })).toBeDefined();
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(apiClient.getNextUpEpisodes).toHaveBeenCalled());
        expect(getElement(page, '.btnPlay').title).toBe('Play');
        getElement(page, '.btnPlay').click();
        expect(playbackManager.play).toHaveBeenCalledWith(expect.objectContaining({ items: [fixture.item] }));
    });

    it('preserves trailer eligibility and hides unsupported playback without placeholders', async () => {
        fixture.item = { Id: 'unplayable', Type: 'Movie', LocalTrailerCount: 1 };
        playbackManager.canPlay.mockReturnValue(false);
        const page = getElement(document, '#itemDetailPage');
        expect(new ItemDetails(page, { id: 'unplayable' })).toBeDefined();
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(hideLoading).toHaveBeenCalled());
        for (const selector of ['.btnPlay', '.btnReplay', '.btnShuffle', '.btnInstantMix', '.btnPlayTrailer']) {
            expect(getElement(page, selector).classList.contains('hide')).toBe(true);
        }
    });

    it.each([
        [{ LocalTrailerCount: 1 }, true],
        [{ RemoteTrailers: [{ Url: 'https://example.test/trailer' }] }, true],
        [{ LocalTrailerCount: 0, RemoteTrailers: [] }, false]
    ] as const)('shows Trailer only when an existing trailer is available: %j', async (trailerData, expected) => {
        fixture.item = { Id: 'trailer', Type: 'Movie', ...trailerData } as ItemDto;
        playbackManager.getSupportedCommands.mockReturnValue(['PlayMediaSource', 'PlayTrailers']);
        const page = getElement(document, '#itemDetailPage');
        expect(new ItemDetails(page, { id: 'trailer' })).toBeDefined();
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(hideLoading).toHaveBeenCalled());
        expect(!getElement(page, '.btnPlayTrailer').classList.contains('hide')).toBe(expected);
    });

    it('opens More as a menu even when Media info is its sole command', async () => {
        fixture.item = { Id: 'movie', Type: 'Movie', MediaSources: [{ Id: 'movie', MediaStreams: [] }] };
        getCommands.mockResolvedValue([{ id: 'moremediainfo', name: 'Media info' }]);
        const page = getElement(document, '#itemDetailPage');
        expect(new ItemDetails(page, { id: 'movie' })).toBeDefined();
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(getElement(page, '.btnMoreCommands').classList.contains('hide')).toBe(false));
        expect(getElement(page, '.btnMoreCommands').title).toBe('More');
        getElement(page, '.btnMoreCommands').click();
        await vi.waitFor(() => expect(showMenu).toHaveBeenCalledWith(expect.objectContaining({ item: fixture.item, positionTo: getElement(page, '.btnMoreCommands') })));
    });

    it('renders tags as literal, noninteractive text', async () => {
        fixture.item = { Id: 'tags', Type: 'Movie', Tags: ['<script>unsafe</script>', 'Time & space'] };
        const page = getElement(document, '#itemDetailPage');
        expect(new ItemDetails(page, { id: 'tags' })).toBeDefined();
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(hideLoading).toHaveBeenCalled());
        const tags = getElement(page, '.itemTags');
        expect(tags.textContent).toContain('<script>unsafe</script>, Time & space');
        expect(tags.querySelector('a, button, script, [tabindex]')).toBeNull();
    });
});
