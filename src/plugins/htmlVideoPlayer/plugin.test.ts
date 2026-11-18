import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DOMPurify from 'dompurify';
import HtmlVideoPlayer from './plugin';
import itemHelper from '../../components/itemHelper';

const motion = vi.hoisted(() => ({
    loading: vi.fn()
}));

vi.mock('screenfull', () => ({ default: {} }));
vi.mock('lib/playback/utils/subtitleStyles', () => ({ useCustomSubtitles: {} }));
vi.mock('components/subtitlesettings/subtitleappearancehelper', () => ({ default: {} }));
vi.mock('constants/appFeature', () => ({ AppFeature: {} }));
vi.mock('constants/pluginType', () => ({ PluginType: {} }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: {} }));
vi.mock('scripts/settings/userSettings', () => ({ currentSettings: { getSubtitleAppearanceSettings: () => ({ verticalPosition: '0' }) } }));
vi.mock('types/mediaError', () => ({ MediaError: {} }));
vi.mock('../../scripts/browser', () => ({ default: { slow: false } }));
vi.mock('../../scripts/settings/appSettings', () => ({ default: {} }));
vi.mock('../../components/apphost', () => ({ appHost: { supports: () => true } }));
vi.mock('../../components/loading/loading', () => ({ default: { show: motion.loading } }));
vi.mock('../../components/playback/playbackmanager', () => ({ playbackManager: { getSubtitleUrl: () => '/subtitles.vtt' } }));
vi.mock('../../components/router/appRouter', () => ({ appRouter: {} }));
vi.mock('../../components/htmlMediaHelper', () => ({
    getSavedVolume: () => 1,
    destroyHlsPlayer: vi.fn(), destroyFlvPlayer: vi.fn(), destroyCastPlayer: vi.fn(), getCrossOriginValue: () => null,
    applySrc: (element: HTMLVideoElement, url: string) => {
        element.setAttribute('src', url);
        return Promise.resolve();
    },
    playWithPromise: () => Promise.resolve()
}));
vi.mock('../../components/itemHelper', () => ({ default: { isLocalItem: () => false } }));
vi.mock('../../lib/globalize', () => ({ default: {} }));
vi.mock('../../scripts/browserDeviceProfile', () => ({ default: {}, canPlaySecondaryAudio: {} }));
vi.mock('../../scripts/settings/webSettings', () => ({ getIncludeCorsCredentials: vi.fn().mockResolvedValue(false) }));
vi.mock('../../components/backdrop/backdrop', () => ({ setBackdropTransparency: {} }));
vi.mock('../../utils/events.ts', () => ({ default: { trigger: vi.fn() } }));
vi.mock('../../utils/container.ts', () => ({ includesAny: {} }));
vi.mock('../../utils/mediaSource.ts', () => ({ isHls: {} }));

// Expose the legacy player's internal subtitle lifecycle to the regression tests.
type SubtitlePlayer = {
    setSubtitleAppearance: () => void;
    setCurrentSrc: (element: HTMLVideoElement, options: object) => Promise<void>;
    onTimeUpdate: (event: { target: HTMLVideoElement }) => void;
    ensureValidVideo: (element: HTMLVideoElement) => void;
    _currentPlayOptions: { transcodingOffsetTicks: number };
    createMediaElement: (options: object) => Promise<HTMLVideoElement>;
    fetchSubtitles: (track?: object, item?: object) => Promise<{ TrackEvents: {
        StartPositionTicks: number;
        EndPositionTicks: number;
        Text: string;
    }[] }>;
    renderSubtitlesWithCustomElement: (element: HTMLVideoElement | null, track: object, item: object, index: number) => void;
    updateSubtitleText: (timeMs: number) => void;
    destroyCustomTrack: (element: HTMLVideoElement | null, index: number) => void;
};

afterEach(() => vi.unstubAllGlobals());

describe('Custom subtitle cues', () => {
    let player: SubtitlePlayer;

    beforeEach(async () => {
        document.body.innerHTML = '';
        player = new HtmlVideoPlayer() as unknown as SubtitlePlayer;
        vi.spyOn(player, 'setSubtitleAppearance').mockImplementation(() => undefined);
        await player.createMediaElement({});
    });

    it('loads network subtitles through the shared response request', async () => {
        const data = { TrackEvents: [{ StartPositionTicks: 12_500_000, EndPositionTicks: 27_500_000, Text: 'Network subtitle' }] };
        const request = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(data) });
        vi.stubGlobal('fetch', request);
        expect(await player.fetchSubtitles({}, { ServerId: 'server' })).toEqual(data);
        expect(request).toHaveBeenCalledExactlyOnceWith('/subtitles.js');
    });

    it('uses network subtitles without a Windows Storage dependency', async () => {
        const data = { TrackEvents: [{ StartPositionTicks: 12_500_000, EndPositionTicks: 27_500_000, Text: 'Network subtitle' }] };
        const request = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(data) });
        const readFile = vi.fn().mockResolvedValue({});
        vi.stubGlobal('fetch', request);
        vi.stubGlobal('Windows', { Storage: {
            StorageFile: { getFileFromPathAsync: readFile },
            FileIO: { readTextAsync: () => Promise.resolve('{"TrackEvents":[]}') }
        } });
        vi.spyOn(itemHelper, 'isLocalItem').mockReturnValue(true);
        expect(await player.fetchSubtitles({ Path: '/subtitles.js' }, {})).toEqual(data);
        expect(request).toHaveBeenCalledExactlyOnceWith('/subtitles.js');
        expect(readFile).not.toHaveBeenCalled();
    });

    it('converts a fractional resume position from ticks to seconds in the media URL', async () => {
        const element = document.querySelector('video')!;
        await player.setCurrentSrc(element, {
            url: 'https://example/video.mp4',
            playerStartPositionTicks: 125_000_000,
            mediaSource: { MediaStreams: [] }
        });
        expect(element.getAttribute('src')).toBe('https://example/video.mp4#t=12.5');
    });

    it('adds transcoding ticks to subtitle playback time in milliseconds', () => {
        const element = document.querySelector('video')!;
        element.currentTime = 2.5;
        player._currentPlayOptions = { transcodingOffsetTicks: 30_000_000 };
        vi.spyOn(player, 'ensureValidVideo').mockImplementation(() => undefined);
        const update = vi.spyOn(player, 'updateSubtitleText').mockImplementation(() => undefined);
        player.onTimeUpdate({ target: element });
        expect(update).toHaveBeenCalledExactlyOnceWith(5500);
    });

    async function loadTrack(text: string, trackIndex = 0) {
        vi.spyOn(player, 'fetchSubtitles').mockResolvedValue({
            TrackEvents: [{ StartPositionTicks: 10000000, EndPositionTicks: 30000000, Text: text }]
        });
        player.renderSubtitlesWithCustomElement(document.querySelector('video'), {}, {}, trackIndex);
        await Promise.resolve();
    }

    it('sanitizes and writes only when the selected cue changes', async () => {
        await loadTrack('<b>Primary</b>');
        const sanitize = vi.spyOn(DOMPurify, 'sanitize');
        const element = document.querySelector('.videoSubtitlesInner')!;
        const hide = vi.spyOn(element.classList, 'add');
        player.updateSubtitleText(0);
        player.updateSubtitleText(500);
        expect(hide).toHaveBeenCalledTimes(1);
        for (let time = 1000; time <= 3000; time += 250) {
            player.updateSubtitleText(time);
        }
        expect(sanitize).toHaveBeenCalledTimes(1);
        expect(element.innerHTML).toBe('\u200e<b>Primary</b>');
        player.updateSubtitleText(3001);
        player.updateSubtitleText(4000);
        expect(element.classList.contains('hide')).toBe(true);
        expect(hide).toHaveBeenCalledTimes(2);
        player.updateSubtitleText(1000);
        expect(sanitize).toHaveBeenCalledTimes(2);
    });

    it('keeps secondary cues independent and renders replacement elements', async () => {
        await loadTrack('Primary');
        await loadTrack('Secondary', 1);
        const sanitize = vi.spyOn(DOMPurify, 'sanitize');
        player.updateSubtitleText(1000);
        player.updateSubtitleText(1500);
        expect(sanitize).toHaveBeenCalledTimes(2);
        expect(document.querySelector('.videoSecondarySubtitlesInner')?.textContent).toBe('\u200eSecondary');
        player.destroyCustomTrack(document.querySelector('video'), 1);
        await loadTrack('Replacement', 1);
        player.updateSubtitleText(1500);
        expect(sanitize).toHaveBeenCalledTimes(3);
        expect(document.querySelector('.videoSecondarySubtitlesInner')?.textContent).toBe('\u200eReplacement');
    });
});

it('creates and reuses fullscreen video without an animation completion event', async () => {
    document.body.innerHTML = '';
    const addListener = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const player = new HtmlVideoPlayer();
    const options = { fullscreen: true } as Parameters<HtmlVideoPlayer['createMediaElement']>[0];
    const creation = player.createMediaElement(options);
    let element: HTMLVideoElement | undefined;
    void creation.then(value => {
        element = value;
    });
    await vi.dynamicImportSettled();
    expect(element).toBe(document.querySelector('video'));
    expect(addListener.mock.calls.some(([type]) => type === 'animationend')).toBe(false);
    expect(document.querySelector<HTMLElement>('.videoPlayerContainer')?.style.animation).toBe('');
    expect(await player.createMediaElement(options)).toBe(element);
});

describe('browser picture in picture', () => {
    it('does not advertise or enter the unsupported Windows view mode', () => {
        const enterViewMode = vi.fn();
        vi.stubGlobal('Windows', { UI: { ViewManagement: {
            ApplicationView: { getForCurrentView: () => ({ isViewModeSupported: () => true, tryEnterViewModeAsync: enterViewMode }) },
            ApplicationViewMode: { compactOverlay: 1, default: 0 }
        } } });
        const player = new HtmlVideoPlayer();
        expect(HtmlVideoPlayer.getSupportedFeatures()).not.toContain('PictureInPicture');
        player.setPictureInPictureEnabled(true);
        expect(player.isPictureInPictureEnabled()).toBe(false);
        expect(enterViewMode).not.toHaveBeenCalled();
    });
});
