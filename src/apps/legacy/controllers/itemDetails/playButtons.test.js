import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ItemDetails from './index';

const { apiClient, playbackManager, fixture, hideLoading, getListViewHtml } = vi.hoisted(() => {
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
    return { apiClient: client, fixture: data, hideLoading: vi.fn(), getListViewHtml: vi.fn(() => ''), playbackManager: { canPlay: () => true, getSupportedCommands: () => ['PlayMediaSource'], play: vi.fn() } };
});
const strings = JSON.parse(readFileSync('src/strings/en-us.json', 'utf8'));
const template = readFileSync('src/apps/legacy/controllers/itemDetails/index.html', 'utf8');
vi.mock('lib/globalize', () => ({ default: {
    translate: (key, value) => (strings[key] || key).replace('{0}', value),
    getCurrentDateTimeLocale: () => 'en-US'
} }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApiClient: () => apiClient, currentApiClient: () => apiClient, getApi: () => ({}) } }));
vi.mock('components/playback/playbackmanager', () => ({ playbackManager }));
vi.mock('components/apphost', () => ({ appHost: { supports: () => false } }));
vi.mock('components/backdrop/backdrop', () => ({ clearBackdrop: vi.fn(), setBackdrops: vi.fn() }));
vi.mock('components/cardbuilder/cardBuilder', () => ({ default: { getCardsHtml: () => '' } }));
vi.mock('components/cardbuilder/cardImage', () => ({ buildCardImage: () => '' }));
vi.mock('components/images/imageLoader', () => ({ default: { lazyChildren: vi.fn() } }));
vi.mock('components/itemContextMenu', () => ({ default: { getCommands: () => Promise.resolve([]) } }));
vi.mock('components/itemHelper', () => ({ default: {
    supportsMediaSourceSelection: () => true, canMarkPlayed: () => false, canRate: () => false,
    getDisplayName: item => item.Name, sortTracks: (first, second) => first.Index - second.Index
} }));
vi.mock('components/mediainfo/mediainfo', async importOriginal => {
    const original = await importOriginal();
    return { default: { ...original.default, fillPrimaryMediaInfo: vi.fn(), fillSecondaryMediaInfo: vi.fn() } };
});
vi.mock('elements/emby-progressbar/emby-progressbar', () => ({}));
vi.mock('components/homesections/deferSection', () => ({ deferSection: () => vi.fn() }));
vi.mock('components/focusManager', () => ({ default: { isCurrentlyFocusable: () => false, focus: vi.fn(), autoFocus: vi.fn() } }));
vi.mock('components/layoutManager', () => ({ default: { tv: true } }));
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
vi.mock('utils/reactUtils', () => ({ renderComponent: () => vi.fn() }));
vi.mock('elements/emby-itemscontainer/emby-itemscontainer', () => ({}));
vi.mock('elements/emby-checkbox/emby-checkbox', () => ({}));
vi.mock('elements/emby-button/emby-button', () => ({}));
vi.mock('elements/emby-playstatebutton/emby-playstatebutton', () => ({}));
vi.mock('elements/emby-ratingbutton/emby-ratingbutton', () => ({}));
vi.mock('elements/emby-scroller/emby-scroller', () => ({}));
vi.mock('elements/emby-select/emby-select', () => ({}));

beforeEach(() => {
    vi.clearAllMocks();
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
