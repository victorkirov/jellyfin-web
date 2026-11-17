import type { MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client/models/media-source-info';
import type { BrowserDetection } from 'types/legacyPlayer';
import detectedBrowser from 'scripts/browser';

const browser = detectedBrowser as BrowserDetection;

function canPlayNativeHls() {
    const media = document.createElement('video');
    return !!(media.canPlayType('application/x-mpegURL').replace(/no/, '')
        || media.canPlayType('application/vnd.apple.mpegURL').replace(/no/, ''));
}

export function enableHlsJsPlayer(runTimeTicks?: number | null, mediaType?: string | null) {
    if (window.MediaSource == null || browser.iOS || browser.tizen || browser.web0s) {
        return false;
    }
    if (canPlayNativeHls()) {
        if (browser.android && (mediaType === 'Audio' || mediaType === 'Video')) {
            return true;
        }
        // Chromium's native HLS cannot switch HDR/SDR playlists.
        if (browser.chrome || browser.edgeChromium || browser.opera) {
            return true;
        }
        if (runTimeTicks) {
            return false;
        }
    }
    return true;
}

export function enableHlsJsPlayerForCodecs(mediaSource: MediaSourceInfo, mediaType: string) {
    // Desktop Safari's native HLS does not play VP9.
    if (!browser.iOS && browser.safari && mediaSource.MediaStreams?.some(stream => stream.Codec === 'vp9')) {
        return true;
    }
    return enableHlsJsPlayer(mediaSource.RunTimeTicks, mediaType);
}
