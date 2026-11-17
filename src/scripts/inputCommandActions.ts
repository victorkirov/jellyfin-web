import { appHost } from 'components/apphost';
import { playbackManager } from 'components/playback/playbackmanager';
import { appRouter } from 'components/router/appRouter';
import { AppFeature } from 'constants/appFeature';

import type { CommandOptions } from './inputManager';

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

const commandActions: Record<string, (options?: CommandOptions) => void> = {
    'home': () => appRouter.goHome(),
    'settings': () => appRouter.showSettings(),
    'back': () => {
        if (appRouter.canGoBack()) {
            void appRouter.back();
        } else if (appHost.supports(AppFeature.Exit)) {
            appHost.exit();
        }
    },
    'nextchapter': () => playbackManager.nextChapter(),
    'next': () => playbackManager.nextTrack(),
    'nexttrack': () => playbackManager.nextTrack(),
    'previous': () => playbackManager.previousTrack(),
    'previoustrack': () => playbackManager.previousTrack(),
    'previouschapter': () => playbackManager.previousChapter(),
    'guide': () => appRouter.showGuide(),
    'recordedtv': () => appRouter.showRecordedTV(),
    'livetv': () => appRouter.showLiveTV(),
    'mute': () => playbackManager.setMute(true),
    'unmute': () => playbackManager.setMute(false),
    'togglemute': () => playbackManager.toggleMute(),
    'channelup': () => playbackManager.channelUp(),
    'channeldown': () => playbackManager.channelDown(),
    'volumedown': () => playbackManager.volumeDown(),
    'volumeup': () => playbackManager.volumeUp(),
    'play': () => playbackManager.unpause(),
    'pause': () => playbackManager.pause(),
    'playpause': () => playbackManager.playPause(),
    'stop': () => {
        if (checkCommandTime('stop')) {
            void playbackManager.stop();
        }
    },
    'changezoom': () => playbackManager.toggleAspectRatio(),
    'increaseplaybackrate': () => playbackManager.increasePlaybackRate(),
    'decreaseplaybackrate': () => playbackManager.decreasePlaybackRate(),
    'changeaudiotrack': () => playbackManager.changeAudioStream(),
    'changesubtitletrack': () => playbackManager.changeSubtitleStream(),
    'search': () => appRouter.showSearch(),
    'favorites': () => appRouter.showFavorites(),
    'fastforward': () => playbackManager.fastForward(),
    'rewind': () => playbackManager.rewind(),
    'seek': (options) => playbackManager.seekMs(options),
    'togglefullscreen': () => playbackManager.toggleFullscreen(),
    'nowplaying': () => appRouter.showNowPlaying(),
    'repeatnone': () => playbackManager.setRepeatMode('RepeatNone'),
    'repeatall': () => playbackManager.setRepeatMode('RepeatAll'),
    'repeatone': () => playbackManager.setRepeatMode('RepeatOne')
};

export function dispatchCommand(commandName: string, options?: CommandOptions) {
    if (Object.prototype.hasOwnProperty.call(commandActions, commandName)) {
        commandActions[commandName](options);
    } else {
        console.debug(`inputManager: tried to process command with no action assigned: ${commandName}`);
    }
}
