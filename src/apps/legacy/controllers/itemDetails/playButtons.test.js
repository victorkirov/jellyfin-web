import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import ItemDetails from './index';
import { getItemQuery } from 'hooks/useItem';
import { queryClient } from 'utils/query/queryClient';

const { apiClient, playbackManager, fixture, hideLoading, getListViewHtml, getSdkItem, api } = vi.hoisted(() => {
    const data = { item: null };
    const client = {
        getItem: vi.fn(() => Promise.resolve(data.item)),
        getCurrentUser: vi.fn(() => Promise.resolve({ Id: 'user', Policy: {} })),
        getCurrentUserId: () => 'user',
        getItems: vi.fn(() => Promise.resolve({ Items: [] })),
        getEpisodes: vi.fn(() => Promise.resolve({ Items: [] })),
        getSeasons: vi.fn(() => Promise.resolve({ Items: [] })),
        getLiveTvPrograms: vi.fn(() => Promise.resolve({ Items: [] })),
        getNextUpEpisodes: vi.fn(() => Promise.resolve({ Items: [] })),

        getSimilarItems: vi.fn(() => Promise.resolve({ Items: [] })),
        subscribe: vi.fn()
    };
    return { api: { basePath: 'https://test' }, getSdkItem: vi.fn(() => Promise.resolve({ data: data.item })), apiClient: client, fixture: data, hideLoading: vi.fn(), getListViewHtml: vi.fn(() => ''), playbackManager: { canPlay: () => true, getSupportedCommands: () => ['PlayMediaSource'], play: vi.fn() } };
});
const strings = JSON.parse(readFileSync('src/strings/en-us.json', 'utf8'));
const template = readFileSync('src/apps/legacy/controllers/itemDetails/index.html', 'utf8');
vi.mock('lib/globalize', () => ({ default: {
    translate: (key, value) => (strings[key] || key).replace('{0}', value),
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
vi.mock('components/itemContextMenu', () => ({ default: { getCommands: () => Promise.resolve([]) } }));
vi.mock('components/itemHelper', () => ({ default: {
    supportsMediaSourceSelection: () => true, canMarkPlayed: item => !!item.allowRating, canRate: item => !!item.allowRating,
    getDisplayName: item => item.Name, sortTracks: (first, second) => first.Index - second.Index
} }));
vi.mock('components/mediainfo/mediainfo', async importOriginal => {
    const original = await importOriginal();
    return { default: { ...original.default, fillPrimaryMediaInfo: vi.fn(), fillSecondaryMediaInfo: vi.fn() } };
});
vi.mock('elements/emby-progressbar/emby-progressbar', () => ({}));
vi.mock('components/homesections/deferSection', () => ({ deferSection: () => vi.fn() }));
vi.mock('lib/focusManager', () => ({ default: { isCurrentlyFocusable: () => false, focus: vi.fn(), autoFocus: vi.fn() } }));
vi.mock('lib/layoutManager', () => ({ default: { tv: true } }));
vi.mock('components/listview/listview', () => ({ default: { getListViewHtml } }));
vi.mock('components/loading/loading', () => ({ default: { show: vi.fn(), hide: hideLoading } }));
vi.mock('components/itemDetails/ItemDetailsMetadataGroup', () => ({ default: vi.fn() }));
vi.mock('components/router/appRouter', () => ({ appRouter: {} }));
vi.mock('components/shortcuts', () => ({ default: { on: vi.fn(), off: vi.fn() } }));
vi.mock('components/autoFocuser', () => ({ default: { autoFocus: vi.fn() } }));
vi.mock('scripts/playlistViewer', () => ({ default: { render: vi.fn() } }));
vi.mock('scripts/browser', () => ({ default: {} }));
vi.mock('scripts/libraryMenu', () => ({ default: { setTitle: vi.fn(), setTransparentMenu: vi.fn() } }));
vi.mock('scripts/settings/userSettings', () => ({ enableBackdrops: () => false }));
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
    document.body.innerHTML = template.replace(/\$\{(\w+)\}/g, (match, key) => strings[key] || key);
    document.querySelectorAll('select').forEach(select => {
        select.setLabel = vi.fn();
    });
    document.querySelectorAll('.btnPlaystate, .btnUserRating').forEach(button => {
        button.setItem = vi.fn();
    });
});

describe('Details playback labels and actions', () => {
    it.each([
        ['resumable', 13800000000, false, 'Resume · 23:00', true],
        ['unstarted', 0, false, 'Play', false],
        ['completed', 0, true, 'Play', false]
    ])('labels %s items while retaining saved-position and restart semantics', async (state, ticks, played, label, replayVisible) => {
        const page = document.querySelector('#itemDetailPage');
        const item = { Id: state, Type: 'Movie', UserData: { PlaybackPositionTicks: ticks, Played: played } };
        fixture.item = item;
        const controller = new ItemDetails(page, { id: state });
        expect(controller).toBeDefined();
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(page.querySelector('.btnPlay').classList.contains('hide')).toBe(false));
        const resume = page.querySelector('.btnPlay');
        const restart = page.querySelector('.btnReplay');
        expect(resume.textContent.trim()).toBe(label);
        expect(resume.title).toBe(label);
        expect(restart.textContent.trim()).toBe('Start from beginning');
        expect(!restart.classList.contains('hide')).toBe(replayVisible);
        page.querySelector('.selectSource').innerHTML = '<option value="version">Version</option>';
        page.querySelector('.selectAudio').innerHTML = '<option value="4">English</option>';
        page.querySelector('.selectSubtitles').innerHTML = '<option value="7">English</option>';
        resume.click();
        expect(playbackManager.play).toHaveBeenLastCalledWith({ items: [item], startPositionTicks: ticks, mediaSourceId: 'version', audioStreamIndex: '4', subtitleStreamIndex: '7' });
        restart.click();
        expect(playbackManager.play).toHaveBeenLastCalledWith(expect.objectContaining({ startPositionTicks: 0 }));
    });

    it('provides visible secondary labels with the state-button update hook', () => {
        const page = document.querySelector('#itemDetailPage');
        expect(page.querySelector('.btnPlayTrailer .detailButton-text').textContent).toBe('Trailer');
        expect(page.querySelector('.btnPlaystate .button-text')).not.toBeNull();
        expect(page.querySelector('.btnUserRating .button-text')).not.toBeNull();
    });
});

describe('Details metadata order by item type', () => {
    it.each(['Series', 'Season', 'MusicAlbum', 'Playlist', 'BoxSet'])('keeps the intended metadata order for %s', async type => {
        const page = document.querySelector('#itemDetailPage');
        fixture.item = { Id: type, Type: type, IsFolder: true, SeriesId: 'series' };
        new ItemDetails(page, { id: type });
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(hideLoading).toHaveBeenCalled());
        const viewingFirst = type === 'Series' || type === 'Season';
        const firstChoice = page.querySelector(viewingFirst ? '.nextUpSection' : '.collectionItems');
        const children = page.querySelector('#listChildrenCollapsible');
        for (const selector of ['.detailSectionContent', '.itemDetailsGroup']) {
            const metadata = page.querySelector(selector);
            const isAfterChoices = Boolean(firstChoice.compareDocumentPosition(metadata) & Node.DOCUMENT_POSITION_FOLLOWING);
            expect(isAfterChoices).toBe(viewingFirst);
            const isAfterChildren = Boolean(children.compareDocumentPosition(metadata) & Node.DOCUMENT_POSITION_FOLLOWING);
            expect(isAfterChildren).toBe(viewingFirst);
        }
    });
});

describe('Season details controller', () => {
    it('uses the compact renderer without fetching unused episode synopses', async () => {
        const page = document.querySelector('#itemDetailPage');
        fixture.item = { Id: 'season', Type: 'Season', IsFolder: true, SeriesId: 'series' };
        new ItemDetails(page, { id: 'season' });
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
            UserData: { PlaybackPositionTicks: 500000000 },
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
        const page = document.querySelector('#itemDetailPage');
        new ItemDetails(page, { id: 'tracks' });
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(page.querySelector('.selectAudio').options).toHaveLength(3));
        const video = page.querySelector('.selectVideo');
        const audio = page.querySelector('.selectAudio');
        const subtitles = page.querySelector('.selectSubtitles');
        expect([...video.options].map(option => option.textContent)).toEqual(['1080p · H264', '720p · HEVC · Restored edition']);
        expect([...audio.options].map(option => option.textContent)).toEqual(['English · AAC · stereo · Default', 'English · AAC · 2 Channels · Director commentary', 'Audio 10']);
        expect([...subtitles.options].map(option => option.textContent)).toEqual(['Off', 'English · SRT · Forced', 'eng · SRT · <b>Signs & songs</b>']);
        expect([video, audio, subtitles].map(select => select.textContent).join(' ')).not.toContain(name);
        expect(subtitles.querySelector('b')).toBeNull();
        expect([...audio.options].map(option => option.value)).toEqual(['2', '5', '9']);
        expect(audio.value).toBe('5');
        expect(subtitles.value).toBe('12');
        audio.value = '9';
        subtitles.value = '13';
        page.querySelector('.btnPlay').click();
        expect(playbackManager.play).toHaveBeenLastCalledWith(expect.objectContaining({ startPositionTicks: 500000000, audioStreamIndex: '9', subtitleStreamIndex: '13', mediaSourceId: 'tracks' }));
    });

    it('handles absent stream metadata and caps supplementary titles without inspecting paths', async () => {
        fixture.item = { Id: 'missing', Type: 'Movie', MediaSources: [{ Id: 'missing', Name: 'Version', MediaStreams: [
            { Type: 'Video', Index: 4 }, { Type: 'Audio', Index: 8, Title: 'x'.repeat(100) }, { Type: 'Subtitle', Index: 16 }
        ] }] };
        const page = document.querySelector('#itemDetailPage');
        new ItemDetails(page, { id: 'missing' });
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(page.querySelector('.selectAudio').options).toHaveLength(1));
        expect(page.querySelector('.selectVideo').textContent).toBe('Video 5');
        expect(page.querySelector('.selectAudio').textContent).toBe('Audio 9');
        expect(page.querySelector('.selectSubtitles').options[1].textContent).toBe('Subtitles 17');
        expect(page.querySelector('.selectSubtitles').value).toBe('-1');
        expect(page.querySelector('.trackSelections').textContent).not.toContain('undefined');
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
        const page = document.querySelector('#itemDetailPage');
        new ItemDetails(page, { id: 'flags' });
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(page.querySelector('.selectSubtitles').options).toHaveLength(5));
        const video = page.querySelector('.selectVideo');
        const subtitles = page.querySelector('.selectSubtitles');
        expect([...video.options].map(option => option.textContent)).toEqual(['HEVC · DOVIWithHDR10', 'H264']);
        expect([...subtitles.options].map(option => option.textContent)).toEqual([
            'Off', 'English · SUBRIP', 'English · SUBRIP · HI/SDH',
            'English · SUBRIP · External subtitle', 'English · SUBRIP · External'
        ]);
        expect([...subtitles.options].map(option => option.value)).toEqual(['-1', '3', '4', '7', '9']);
        expect(subtitles.value).toBe('7');
        subtitles.value = '4';
        page.querySelector('.btnPlay').click();
        expect(playbackManager.play).toHaveBeenLastCalledWith(expect.objectContaining({ subtitleStreamIndex: '4', mediaSourceId: 'flags' }));
    });
});

describe('Details item query reuse and freshness', () => {
    it('reuses the item fetched by navigation without a legacy item request', async () => {
        fixture.item = { Id: 'cached', Type: 'Movie', ServerId: 'server' };
        await queryClient.fetchQuery(getItemQuery(api, 'cached', 'user'));
        const page = document.querySelector('#itemDetailPage');
        new ItemDetails(page, { id: 'cached', serverId: 'server' });
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
        await queryClient.fetchQuery(getItemQuery(previousApi, 'switched', previousUser));
        fixture.item = { Id: 'switched', Type: 'Movie', ServerId: 'server', UserData: { IsFavorite: true } };
        const page = document.querySelector('#itemDetailPage');
        new ItemDetails(page, { id: 'switched', serverId: 'server' });
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
        fixture.item = { ...fixture.item, UserData: { Played: true, IsFavorite: true } };
        const page = document.querySelector('#itemDetailPage');
        new ItemDetails(page, { id: 'invalidated', serverId: 'server' });
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(hideLoading).toHaveBeenCalled());
        expect(getSdkItem).toHaveBeenCalledTimes(2);
        expect(queryClient.getQueryData(query.queryKey).UserData).toEqual({ Played: true, IsFavorite: true });
    });

    it('fetches an alternate version through the item cache and keeps its playback identity', async () => {
        const sources = ['first', 'second'].map(Id => ({ Id, Name: Id, MediaStreams: [] }));
        fixture.item = { Id: 'first', Type: 'Movie', ServerId: 'server', MediaSources: sources };
        const page = document.querySelector('#itemDetailPage');
        new ItemDetails(page, { id: 'first', serverId: 'server' });
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(hideLoading).toHaveBeenCalled());
        fixture.item = { ...fixture.item, Id: 'second', UserData: { PlaybackPositionTicks: 10000000 } };
        const select = page.querySelector('.selectSource');
        select.value = 'second';
        select.dispatchEvent(new Event('change'));
        await vi.waitFor(() => expect(getSdkItem).toHaveBeenCalledTimes(2));
        await vi.waitFor(() => expect(page.querySelector('.btnPlay').textContent.trim()).toBe('Resume · 0:01'));
        page.querySelector('.btnPlay').click();
        expect(playbackManager.play).toHaveBeenLastCalledWith(expect.objectContaining({
            items: [fixture.item], mediaSourceId: 'second', startPositionTicks: 10000000
        }));
        expect(queryClient.getQueryData(getItemQuery(api, 'second', 'user').queryKey)).toEqual(fixture.item);
    });

    it('refreshes a restored item after playback or favourite changes without a version selector', async () => {
        fixture.item = { Id: 'restore', Type: 'Movie', ServerId: 'server', allowRating: true, UserData: { PlaybackPositionTicks: 0 } };
        const page = document.querySelector('#itemDetailPage');
        new ItemDetails(page, { id: 'restore', serverId: 'server' });
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(hideLoading).toHaveBeenCalled());
        fixture.item = { ...fixture.item, UserData: { PlaybackPositionTicks: 13800000000, IsFavorite: true, Played: true } };
        page.dispatchEvent(new CustomEvent('viewshow', { detail: { isRestored: true } }));
        await vi.waitFor(() => expect(page.querySelector('.btnPlay').textContent.trim()).toBe('Resume · 23:00'));
        expect(getSdkItem).toHaveBeenCalledTimes(2);
        expect(page.querySelector('.btnUserRating').setItem).toHaveBeenLastCalledWith(fixture.item);
        expect(page.querySelector('.btnPlaystate').setItem).toHaveBeenLastCalledWith(fixture.item);
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
        const page = document.querySelector('#itemDetailPage');
        fixture.item = { Id: 'failing-movie', Type: 'Movie', MediaType: 'Video', ServerId: 'server', UserData: {} };
        new ItemDetails(page, { id: 'failing-movie', serverId: 'server' });
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(hideLoading).toHaveBeenCalled());
        expect(page.querySelector('.btnPlay').classList.contains('hide')).toBe(true);
        page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
        await vi.waitFor(() => expect(page.querySelector('.btnPlay').classList.contains('hide')).toBe(false));
    });
});
