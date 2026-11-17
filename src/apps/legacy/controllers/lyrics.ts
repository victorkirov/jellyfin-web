import { getLyricApi } from '@jellyfin/sdk/lib/utils/api/lyric-api';
import 'core-js/modules/es.array.find-last-index';
import type { LyricLine } from '@jellyfin/sdk/lib/generated-client/models/lyric-line';
import type { PlaybackPlayer } from 'types/plugin';
import type { PlaybackState } from 'lib/playback/types';
import type { PlayerState } from 'types/playbackStopInfo';
import { getLyricsHtml } from './lyricsMarkup';

import { AutoScroll } from 'apps/legacy/features/lyrics/constants/autoScroll';
import autoFocuser from 'components/autoFocuser';
import { appRouter } from 'components/router/appRouter';
import { playbackManager } from 'components/playback/playbackmanager';
import scrollManager from 'lib/scrollManager';
import focusManager from 'lib/focusManager';
import globalize from 'lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import keyboardNavigation from 'scripts/keyboardNavigation';
import LibraryMenu from 'scripts/libraryMenu';
import Events, { type Event as PlaybackEvent } from 'utils/events';

import 'styles/lyrics.scss';

let currentPlayer: PlaybackPlayer | null | undefined;
let currentItem: PlaybackState['NowPlayingItem'] | null;

let savedLyrics: LyricLine[] | null | undefined;
let isDynamicLyric = false;
let autoScroll = AutoScroll.Instant;

// TypeScript's ES5 lib omits the core-js method already used by this controller.
type SearchableLyrics = LyricLine[] & {
    findLastIndex(predicate: (lyric: LyricLine) => boolean): number;
};

function getLyricIndex(time: number, lyrics: LyricLine[]) {
    return (lyrics as SearchableLyrics).findLastIndex(lyric => lyric.Start! <= time);
}

function getCurrentPlayTime() {
    let currentTime = playbackManager.currentTime();
    if (currentTime === undefined) currentTime = 0;
    //convert to ticks
    return currentTime * 10000;
}

export default function (view: HTMLElement) {
    function setPastLyricClassOnLine(line: number) {
        const lyric = view.querySelector<HTMLElement>(`#lyricPosition${line}`);
        if (lyric) {
            lyric.classList.remove('futureLyric');
            lyric.classList.add('pastLyric');
        }
    }

    function setFutureLyricClassOnLine(line: number) {
        const lyric = view.querySelector<HTMLElement>(`#lyricPosition${line}`);
        if (lyric) {
            lyric.classList.remove('pastLyric');
            lyric.classList.add('futureLyric');
        }
    }

    function setCurrentLyricClassOnLine(line: number) {
        const lyric = view.querySelector<HTMLElement>(`#lyricPosition${line}`);
        if (lyric) {
            lyric.classList.remove('pastLyric');
            lyric.classList.remove('futureLyric');
            if (autoScroll !== AutoScroll.NoScroll) {
                // instant scroll is used when the view is first loaded
                scrollManager.scrollToElement(lyric, autoScroll === AutoScroll.Smooth);
                focusManager.focus(lyric);
                autoScroll = AutoScroll.Smooth;
            }
        }
    }

    function updateAllLyricLines(currentLine: number, lyrics: LyricLine[]) {
        for (let lyricIndex = 0; lyricIndex <= lyrics.length; lyricIndex++) {
            if (lyricIndex < currentLine) {
                setPastLyricClassOnLine(lyricIndex);
            } else if (lyricIndex === currentLine) {
                setCurrentLyricClassOnLine(lyricIndex);
            } else if (lyricIndex > currentLine) {
                setFutureLyricClassOnLine(lyricIndex);
            }
        }
    }

    function renderNoLyricMessage() {
        const itemsContainer = view.querySelector('.lyricsContainer');
        if (itemsContainer) {
            const html = `<h1>${globalize.translate('HeaderNoLyrics')}</h1>`;
            itemsContainer.innerHTML = html;
        }
        autoFocuser.autoFocus();
    }

    function renderLyrics(lyrics: LyricLine[]) {
        const itemsContainer = view.querySelector('.lyricsContainer');
        if (itemsContainer) {
            const html = getLyricsHtml(lyrics, isDynamicLyric);
            itemsContainer.innerHTML = html;
        }

        if (isDynamicLyric) {
            const lyricLineArray = itemsContainer!.querySelectorAll<HTMLElement>('.lyricsLine');

            // attaches click event listener to change playtime to lyric start
            lyricLineArray.forEach(element => {
                element.addEventListener('click', () => onLyricClick(Number(element.getAttribute('data-lyrictime'))));
            });

            const currentIndex = getLyricIndex(getCurrentPlayTime(), lyrics);
            updateAllLyricLines(currentIndex, savedLyrics!);
        }
    }

    function updateLyrics(lyrics: LyricLine[]) {
        savedLyrics = lyrics;

        isDynamicLyric = Object.prototype.hasOwnProperty.call(lyrics[0], 'Start');

        renderLyrics(savedLyrics);

        autoFocuser.autoFocus(view);
    }

    function getLyrics(serverId: string | null | undefined, itemId: string | null | undefined) {
        const api = ServerConnections.getApi(serverId);
        if (!api) {
            console.error('[Lyrics] no Api instance available for server', serverId);
            return;
        }

        return getLyricApi(api).getLyrics({ itemId: itemId! })
            .then(({ data }) => {
                if (!data.Lyrics?.length) {
                    throw new Error('No lyrics returned');
                }
                return data.Lyrics;
            });
    }

    function bindToPlayer(player: PlaybackPlayer | null | undefined) {
        if (player === currentPlayer) {
            return;
        }

        releaseCurrentPlayer();

        currentPlayer = player;

        if (!player) {
            return;
        }

        Events.on(player, 'timeupdate', onTimeUpdate);
        Events.on(player, 'playbackstart', onPlaybackStart);
        Events.on(player, 'playbackstop', onPlaybackStop);
    }

    function releaseCurrentPlayer() {
        const player = currentPlayer;

        if (player) {
            Events.off(player, 'timeupdate', onTimeUpdate);
            Events.off(player, 'playbackstart', onPlaybackStart);
            Events.off(player, 'playbackstop', onPlaybackStop);
            currentPlayer = null;
        }
    }

    function onLyricClick(lyricTime: number) {
        autoScroll = AutoScroll.Smooth;
        playbackManager.seek(lyricTime);
        if (playbackManager.paused()) {
            playbackManager.playPause(currentPlayer);
        }
    }

    function onTimeUpdate() {
        if (isDynamicLyric) {
            const currentIndex = getLyricIndex(getCurrentPlayTime(), savedLyrics!);
            updateAllLyricLines(currentIndex, savedLyrics!);
        }
    }

    function onPlaybackStart(_event: PlaybackEvent, state: Pick<PlaybackState, 'NowPlayingItem'>) {
        if (currentItem!.Id !== state.NowPlayingItem!.Id) {
            onLoad();
        }
    }

    function onPlaybackStop(_event: PlaybackEvent, state: Pick<PlayerState, 'NextMediaType'>) {
        // TODO: switch to appRouter.back(), with fix to navigation to /#/queue. Which is broken when it has nothing playing
        if (!state.NextMediaType) {
            void appRouter.goHome();
        }
    }

    function onPlayerChange() {
        const player = playbackManager.getCurrentPlayer();
        bindToPlayer(player);
    }

    function onLoad() {
        savedLyrics = null;
        currentItem = null;
        isDynamicLyric = false;

        LibraryMenu.setTitle(globalize.translate('Lyrics'));

        const player = playbackManager.getCurrentPlayer();

        if (player) {
            bindToPlayer(player);

            const state = playbackManager.getPlayerState(player);
            currentItem = state.NowPlayingItem;

            const serverId = state.NowPlayingItem!.ServerId;
            const itemId = state.NowPlayingItem!.Id;

            void getLyrics(serverId, itemId)!.then(updateLyrics).catch(renderNoLyricMessage);
        } else {
            // if nothing is currently playing, no lyrics to display redirect to home
            void appRouter.goHome();
        }
    }

    function onWheel() {
        autoScroll = AutoScroll.NoScroll;
    }

    function onKeyDown(e: KeyboardEvent) {
        const key = keyboardNavigation.getKeyName(e);
        if (key === 'ArrowUp' || key === 'ArrowDown') {
            autoScroll = AutoScroll.NoScroll;
        }
    }

    view.addEventListener('viewshow', function () {
        Events.on(playbackManager, 'playerchange', onPlayerChange);
        autoScroll = AutoScroll.Instant;
        document.addEventListener('wheel', onWheel);
        document.addEventListener('keydown', onKeyDown);
        try {
            onLoad();
        } catch {
            void appRouter.goHome();
        }
    });

    view.addEventListener('viewbeforehide', function () {
        Events.off(playbackManager, 'playerchange', onPlayerChange);
        document.removeEventListener('wheel', onWheel);
        document.removeEventListener('keydown', onKeyDown);
        releaseCurrentPlayer();
    });
}
