import { appHost } from 'components/apphost';
import focusManager from 'lib/focusManager';
import { playbackManager } from 'components/playback/playbackmanager';
import { appRouter } from 'components/router/appRouter';
import { AppFeature } from 'constants/appFeature';

import type { CommandOptions, CommandSource } from './inputManager';

const commandTimes: Record<string, number> = {};

function checkCommandTime(command: string) {
    const last = commandTimes[command] || 0;
    const now = new Date().getTime();

    if ((now - last) < 1000) {
        return false;
    }

    commandTimes[command] = now;
    return true;
}

export function dispatchCommand(commandName: string, sourceElement: CommandSource, options?: CommandOptions) {
    const keyActions = (command: string): (() => void) | undefined => ({
        'up': () => {
            focusManager.moveUp(sourceElement);
        },
        'down': () => {
            focusManager.moveDown(sourceElement);
        },
        'left': () => {
            focusManager.moveLeft(sourceElement);
        },
        'right': () => {
            focusManager.moveRight(sourceElement);
        },
        'home': () => {
            void appRouter.goHome();
        },
        'settings': () => {
            void appRouter.showSettings();
        },
        'back': () => {
            if (appRouter.canGoBack()) {
                void appRouter.back();
            } else if (appHost.supports(AppFeature.Exit)) {
                void appHost.exit();
            }
        },
        'select': () => {
            (sourceElement as HTMLElement).click();
        },
        'nextchapter': () => {
            void playbackManager.nextChapter();
        },
        'next': () => {
            void playbackManager.nextTrack();
        },
        'nexttrack': () => {
            void playbackManager.nextTrack();
        },
        'previous': () => {
            void playbackManager.previousTrack();
        },
        'previoustrack': () => {
            void playbackManager.previousTrack();
        },
        'previouschapter': () => {
            void playbackManager.previousChapter();
        },
        'guide': () => {
            void appRouter.showGuide();
        },
        'recordedtv': () => {
            void appRouter.showRecordedTV();
        },
        'livetv': () => {
            void appRouter.showLiveTV();
        },
        'mute': () => {
            void playbackManager.setMute(true);
        },
        'unmute': () => {
            void playbackManager.setMute(false);
        },
        'togglemute': () => {
            void playbackManager.toggleMute();
        },
        'channelup': () => {
            void playbackManager.channelUp();
        },
        'channeldown': () => {
            void playbackManager.channelDown();
        },
        'volumedown': () => {
            void playbackManager.volumeDown();
        },
        'volumeup': () => {
            void playbackManager.volumeUp();
        },
        'play': () => {
            void playbackManager.unpause();
        },
        'pause': () => {
            void playbackManager.pause();
        },
        'playpause': () => {
            void playbackManager.playPause();
        },
        'stop': () => {
            if (checkCommandTime('stop')) {
                void playbackManager.stop();
            }
        },
        'changezoom': () => {
            void playbackManager.toggleAspectRatio();
        },
        'increaseplaybackrate': () => {
            void playbackManager.increasePlaybackRate();
        },
        'decreaseplaybackrate': () => {
            void playbackManager.decreasePlaybackRate();
        },
        'changeaudiotrack': () => {
            void playbackManager.changeAudioStream();
        },
        'changesubtitletrack': () => {
            void playbackManager.changeSubtitleStream();
        },
        'search': () => {
            void appRouter.showSearch();
        },
        'favorites': () => {
            void appRouter.showFavorites();
        },
        'fastforward': () => {
            void playbackManager.fastForward();
        },
        'rewind': () => {
            void playbackManager.rewind();
        },
        'seek': () => {
            void playbackManager.seekMs(options);
        },
        'togglefullscreen': () => {
            void playbackManager.toggleFullscreen();
        },
        'nowplaying': () => {
            void appRouter.showNowPlaying();
        },
        'repeatnone': () => {
            void playbackManager.setRepeatMode('RepeatNone');
        },
        'repeatall': () => {
            void playbackManager.setRepeatMode('RepeatAll');
        },
        'repeatone': () => {
            void playbackManager.setRepeatMode('RepeatOne');
        },
        'unknown': () => {
            // This is the command given by 'notify', it's a no-op
        }
    } as Record<string, () => void>)[command];

    const action = keyActions(commandName);
    if (action !== undefined) {
        action.call(undefined);
    } else {
        console.debug(`inputManager: tried to process command with no action assigned: ${commandName}`);
    }
}
