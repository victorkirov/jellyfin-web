import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LyricLine } from '@jellyfin/sdk/lib/generated-client/models/lyric-line';
import Events from 'utils/events';
import createController from './lyrics';

const mocks = vi.hoisted(() => ({
    player: { name: 'test audio', id: 'audio' },
    item: { Id: 'song', ServerId: 'server' },
    getCurrentPlayer: vi.fn(),
    getLyrics: vi.fn(),
    getApi: vi.fn(),
    currentTime: vi.fn(),
    seek: vi.fn(),
    paused: vi.fn(),
    playPause: vi.fn(),
    scroll: vi.fn(),
    focus: vi.fn(),
    autoFocus: vi.fn(),
    goHome: vi.fn(),
    setTitle: vi.fn()
}));
vi.mock('@jellyfin/sdk/lib/utils/api/lyric-api', () => ({ getLyricApi: () => ({ getLyrics: mocks.getLyrics }) }));
vi.mock('components/autoFocuser', () => ({ default: { autoFocus: mocks.autoFocus } }));
vi.mock('components/router/appRouter', () => ({ appRouter: { goHome: mocks.goHome } }));
vi.mock('lib/layoutManager', () => ({ default: { tv: true } }));
vi.mock('components/playback/playbackmanager', () => ({ playbackManager: {
    getCurrentPlayer: mocks.getCurrentPlayer,
    getPlayerState: () => ({ NowPlayingItem: mocks.item }),
    currentTime: mocks.currentTime,
    // The real playback manager coerces the original DOM attribute through Math.max.
    seek: (ticks: number | string | null) => mocks.seek(Math.max(0, Number(ticks))),
    paused: mocks.paused,
    playPause: mocks.playPause
} }));
vi.mock('lib/scrollManager', () => ({ default: { scrollToElement: mocks.scroll } }));
vi.mock('lib/focusManager', () => ({ default: { focus: mocks.focus } }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApi: mocks.getApi } }));
vi.mock('scripts/libraryMenu', () => ({ default: { setTitle: mocks.setTitle } }));
vi.mock('scripts/keyboardNavigation', () => ({ default: { getKeyName: (event: KeyboardEvent) => event.key } }));

const timedLyrics: LyricLine[] = [
    { Start: 0, Text: '<first>' },
    { Start: 10000000, Text: 'second' },
    { Start: 30000000, Text: 'third' }
];
let view: HTMLElement;

beforeEach(() => {
    vi.clearAllMocks();
    mocks.item = { Id: 'song', ServerId: 'server' };
    mocks.getApi.mockReturnValue({});
    mocks.getCurrentPlayer.mockReturnValue(mocks.player);
    mocks.currentTime.mockReturnValue(2000);
    mocks.paused.mockReturnValue(false);
    mocks.getLyrics.mockResolvedValue({ data: { Lyrics: timedLyrics } });
    view = document.createElement('main');
    view.innerHTML = '<div class="lyricsContainer"></div>';
    document.body.appendChild(view);
    createController(view);
});
afterEach(() => {
    view.dispatchEvent(new Event('viewbeforehide'));
    document.body.innerHTML = '';
});

async function show() {
    view.dispatchEvent(new Event('viewshow'));
    await vi.waitFor(() => expect(view.querySelector('.lyricsLine')).not.toBeNull());
}

describe('legacy lyrics controller characterization', () => {
    it('renders escaped timed lyrics and follows the current line', async () => {
        await show();
        expect(mocks.getLyrics).toHaveBeenCalledWith({ itemId: 'song' });
        expect(view.querySelectorAll('button')).toHaveLength(3);
        expect(view.querySelector('#lyricPosition0')?.textContent?.trim()).toBe('<first>');
        expect(view.querySelector('first')).toBeNull();
        expect(view.querySelector('#lyricPosition0')?.innerHTML).toBe('\n    &lt;first&gt;\n');
        expect(view.querySelector('#lyricPosition0')?.classList.contains('pastLyric')).toBe(true);
        expect(view.querySelector('#lyricPosition2')?.classList.contains('futureLyric')).toBe(true);
        expect(mocks.scroll.mock.lastCall?.[0]).toBe(view.querySelector('#lyricPosition1'));
        expect(mocks.focus).toHaveBeenCalledWith(view.querySelector('#lyricPosition1'));
        mocks.currentTime.mockReturnValue(4000);
        Events.trigger(mocks.player, 'timeupdate');
        expect(mocks.scroll.mock.lastCall?.[0]).toBe(view.querySelector('#lyricPosition2'));
    });

    it.each(['wheel', 'keyboard'])('pauses following after %s input and resumes after activating a lyric', async input => {
        await show();
        mocks.scroll.mockClear();
        document.dispatchEvent(input === 'wheel' ? new Event('wheel') : new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        Events.trigger(mocks.player, 'timeupdate');
        expect(mocks.scroll).not.toHaveBeenCalled();
        mocks.paused.mockReturnValue(true);
        view.querySelector<HTMLButtonElement>('#lyricPosition2')!.click();
        expect(mocks.seek).toHaveBeenCalledWith(30000000);
        expect(mocks.playPause).toHaveBeenCalledWith(mocks.player);
        Events.trigger(mocks.player, 'timeupdate');
        expect(mocks.scroll).toHaveBeenCalledOnce();
    });

    it('keeps untimed lyrics static and releases playback listeners when hidden', async () => {
        mocks.getLyrics.mockResolvedValue({ data: { Lyrics: [{ Text: 'plain lyrics' }] } });
        await show();
        expect(mocks.scroll).not.toHaveBeenCalled();
        expect(view.querySelector('.dynamicLyric')).toBeNull();
        Events.trigger(mocks.player, 'timeupdate');
        expect(mocks.scroll).not.toHaveBeenCalled();
        view.dispatchEvent(new Event('viewbeforehide'));
        mocks.getCurrentPlayer.mockClear();
        const { playbackManager } = await import('components/playback/playbackmanager');
        Events.trigger(playbackManager, 'playerchange');
        expect(mocks.getCurrentPlayer).not.toHaveBeenCalled();
    });

    it('reloads for a different track and renders the no-lyrics state for empty responses', async () => {
        await show();
        Events.trigger(mocks.player, 'playbackstart', [{ NowPlayingItem: mocks.item }]);
        expect(mocks.getLyrics).toHaveBeenCalledOnce();
        mocks.item = { Id: 'next', ServerId: 'server' };
        mocks.getLyrics.mockResolvedValue({ data: { Lyrics: [] } });
        Events.trigger(mocks.player, 'playbackstart', [{ NowPlayingItem: mocks.item }]);
        await vi.waitFor(() => expect(view.querySelector('h1')?.textContent).toBe('HeaderNoLyrics'));
        expect(mocks.getLyrics).toHaveBeenLastCalledWith({ itemId: 'next' });
    });

    it('returns home when playback has ended or no player is available', async () => {
        await show();
        Events.trigger(mocks.player, 'playbackstop', [{ NextMediaType: null }]);
        expect(mocks.goHome).toHaveBeenCalledOnce();
        mocks.getCurrentPlayer.mockReturnValue(null);
        view.dispatchEvent(new Event('viewshow'));
        expect(mocks.goHome).toHaveBeenCalledTimes(2);
    });
});

it('keeps the lyrics route and its extensionless controller import working', async () => {
    const { LEGACY_USER_ROUTES } = await import('../routes/legacyRoutes/user');
    const route = LEGACY_USER_ROUTES.find(candidate => candidate.path === 'lyrics');
    expect(route?.pageProps).toMatchObject({ controller: 'lyrics', view: 'lyrics.html' });
    const controller = await import('./lyrics');
    expect(controller.default).toBe(createController);
});
