import { TICKS_PER_SECOND } from 'constants/time';
import type { BrowserDetection, PlayerOptions, PlayerStream } from 'types/legacyPlayer';
import detectedBrowser from 'scripts/browser';
import { currentSettings as userSettings } from 'scripts/settings/userSettings';
import itemHelper from 'components/itemHelper';
import { playbackManager } from './playbackmanager';
import { isHls } from 'utils/mediaSource';
const browser = detectedBrowser as BrowserDetection;

const NATIVE_UNSUPPORTED_SUBTITLE_CODECS = ['ssa', 'ass', 'pgssub', 'dvdsub', 'vobsub'];
export const ASS_SUBTITLE_CODECS = ['ssa', 'ass'];
export const VOBSUB_SUBTITLE_CODECS = ['dvdsub', 'vobsub'];
const BITMAP_SUBTITLE_ASPECT_MODES = ['stretch', 'contain', 'cover'];

export function resolveUrl(url: string) {
    return new Promise<string>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('HEAD', url, true);
        xhr.onload = function () {
            resolve(xhr.responseURL || url);
        };
        xhr.onerror = function (e) {
            console.error(e);
            resolve(url);
        };
        xhr.send(null);
    });
}

export function tryRemoveElement(elem: Node) {
    const parentNode = elem.parentNode;
    if (parentNode) {
        // Seeing crashes in edge webview
        try {
            parentNode.removeChild(elem);
        } catch (err) {
            console.error(`error removing dialog element: ${err}`);
        }
    }
}

export function enableNativeTrackSupport(mediaSource: PlayerOptions['mediaSource'], track?: PlayerStream | null) {
    if (track?.DeliveryMethod === 'Embed') {
        return true;
    }

    if (browser.firefox && isHls(mediaSource)) {
        return false;
    }

    if (browser.ps4) {
        return false;
    }

    if (browser.web0s) {
        return false;
    }

    // Edge is randomly not rendering subtitles
    if (browser.edge) {
        return false;
    }

    if (browser.iOS && (browser.iosVersion || 10) < 10) {
        // works in the browser but not the native app
        return false;
    }

    if (track) {
        const format = (track.Codec || '').toLowerCase();
        if (NATIVE_UNSUPPORTED_SUBTITLE_CODECS.includes(format)) {
            return false;
        }
    }

    return true;
}

export function getMediaStreamVideoTracks(mediaSource: PlayerOptions['mediaSource']) {
    return (mediaSource.MediaStreams as PlayerStream[]).filter(function (s) {
        return s.Type === 'Video';
    });
}

export function getMediaStreamAudioTracks(mediaSource: PlayerOptions['mediaSource']) {
    return (mediaSource.MediaStreams as PlayerStream[]).filter(function (s) {
        return s.Type === 'Audio';
    });
}

export function getMediaStreamTextTracks(mediaSource: PlayerOptions['mediaSource']) {
    return (mediaSource.MediaStreams as PlayerStream[]).filter(function (s) {
        return s.Type === 'Subtitle';
    });
}

export function normalizeTrackEventText(text: string, useHtml: boolean) {
    const result = text
        .replace(/\\N/gi, '\n') // Correct newline characters
        .replace(/\r/gi, '') // Remove carriage return characters
        .replace(/{\\.*?}/gi, '') // Remove ass/ssa tags
        // Force LTR as the default direction
        .split('\n').map(val => `\u200E${val}`).join('\n');
    return useHtml ? result.replace(/\n/gi, '<br>') : result;
}

export function getTextTrackUrl(track: PlayerStream, item: PlayerOptions['item'], format?: string) {
    if (itemHelper.isLocalItem(item) && track.Path) {
        return track.Path;
    }

    let url = playbackManager.getSubtitleUrl(track, item.ServerId!)!;
    if (format) {
        url = url.replace('.vtt', format);
    }

    return url;
}

export function getSubtitleFileNameHint(track: PlayerStream) {
    const candidates = [track?.Path];
    for (const candidate of candidates) {
        if (!candidate) {
            continue;
        }

        const sanitized = candidate.split(/[?#]/)[0];
        const fileName = sanitized.split(/[\\/]/).pop();
        if (fileName) {
            return fileName;
        }
    }

    const codec = (track?.Codec || '').toLowerCase();
    if (VOBSUB_SUBTITLE_CODECS.includes(codec)) {
        return 'subtitle.mks';
    }

    return undefined;
}

export function getBitmapSubtitleDisplaySettings(): { aspectMode: import('libbitsub').SubtitleAspectMode } {
    const aspectMode = userSettings.getSubtitleAppearanceSettings()?.aspectMode;
    const normalizedAspectMode = typeof aspectMode === 'string' ? aspectMode.toLowerCase() : 'stretch';

    if (BITMAP_SUBTITLE_ASPECT_MODES.includes(normalizedAspectMode)) {
        return {
            // The membership check above limits this to supported renderer modes.
            aspectMode: normalizedAspectMode as import('libbitsub').SubtitleAspectMode
        };
    }

    return {
        aspectMode: 'contain'
    };
}

export function getSubtitleTimeOffset(playOptions?: PlayerOptions, subtitleOffset: number | null | undefined = 0) {
    return ((playOptions?.transcodingOffsetTicks || 0) / TICKS_PER_SECOND) + subtitleOffset!;
}

