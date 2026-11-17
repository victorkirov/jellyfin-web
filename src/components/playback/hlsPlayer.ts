export { destroyHlsPlayer } from '../htmlMediaHelper';
import type Hls from 'hls.js';
import type { ErrorData, HlsConfig } from 'hls.js';
import type { MediaInstance } from 'lib/playback/types/htmlMedia';
import { MediaError } from 'types/mediaError';
import { playWithPromise, onErrorInternal, destroyHlsPlayer } from '../htmlMediaHelper';
import { getIncludeCorsCredentials } from 'scripts/settings/webSettings';

export function handleHlsJsMediaError(instance: MediaInstance, fail?: () => void) {
    const player = instance._hlsPlayer;
    if (!player) return;
    const recovery = instance._hlsRecovery || (instance._hlsRecovery = {});
    const now = typeof window.performance?.now === 'function' ? performance.now() : Date.now();
    if (recovery.decoding == null || now - recovery.decoding > 3000) {
        recovery.decoding = now;
        player.recoverMediaError();
    } else if (recovery.swap == null || now - recovery.swap > 3000) {
        recovery.swap = now;
        player.swapAudioCodec();
        player.recoverMediaError();
    } else if (fail) {
        fail();
    } else {
        onErrorInternal(instance, MediaError.FATAL_HLS_ERROR);
    }
}

function handleError(instance: MediaInstance, hls: Hls, data: ErrorData, fail: (type: string) => void) {
    console.error('HLS Error: Type: ' + data.type + ' Details: ' + data.details + ' Fatal: ' + data.fatal);
    if (data.type === 'networkError' && data.response?.code && data.response.code >= 400) {
        fail(MediaError.SERVER_ERROR);
        return;
    }
    if (!data.fatal) return;
    switch (data.type) {
        case 'networkError':
            if (data.response?.code === 0) {
                fail(MediaError.NETWORK_ERROR);
            } else {
                hls.startLoad();
            }
            break;
        case 'mediaError':
            handleHlsJsMediaError(instance, () => fail(MediaError.FATAL_HLS_ERROR));
            break;
        default:
            fail(MediaError.FATAL_HLS_ERROR);
    }
}

export function startHlsPlayback(instance: MediaInstance, elem: HTMLMediaElement, url: string, onError: EventListener, config: Partial<HlsConfig> = {}, onAttached?: () => void) {
    destroyHlsPlayer(instance);
    return new Promise<void>((resolve, reject) => {
        let settled = false;
        const request = {
            cancel: () => {
                if (!settled) {
                    settled = true;
                    const error = new Error('HLS playback cancelled');
                    error.name = 'AbortError';
                    reject(error);
                }
            }
        };
        instance._hlsRequest = request;
        const fail = (type: string) => {
            if (instance._hlsRequest !== request) return;
            const wasSettled = settled;
            settled = true;
            destroyHlsPlayer(instance);
            if (wasSettled) onErrorInternal(instance, type);
            else reject(type);
        };
        // The prebuilt distribution includes the worker and is already ES5.
        void Promise.all([import(/* webpackChunkName: 'hls' */ 'hls.js/dist/hls.js'), getIncludeCorsCredentials()]).then(([{ default: HlsPlayer }, includeCorsCredentials]) => {
            if (instance._hlsRequest !== request) return;
            HlsPlayer.DefaultConfig.lowLatencyMode = false;
            HlsPlayer.DefaultConfig.backBufferLength = Infinity;
            HlsPlayer.DefaultConfig.liveBackBufferLength = 90;
            const hls = new HlsPlayer({
                ...config,
                manifestLoadingTimeOut: 20000,
                xhrSetup(xhr) {
                    xhr.withCredentials = includeCorsCredentials;
                }
            });
            instance._hlsPlayer = hls;
            hls.on(HlsPlayer.Events.MANIFEST_PARSED, () => {
                if (instance._hlsRequest !== request) return;
                void playWithPromise(elem, onError).then(() => {
                    if (instance._hlsRequest !== request) return;
                    settled = true;
                    resolve();
                }, () => fail(MediaError.FATAL_HLS_ERROR));
            });
            hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
                if (instance._hlsRequest === request) handleError(instance, hls, data, fail);
            });
            onAttached?.();
            hls.loadSource(url);
            if (instance._hlsRequest === request) hls.attachMedia(elem);
        }).catch(error => {
            if (instance._hlsRequest !== request) return;
            settled = true;
            destroyHlsPlayer(instance);
            reject(error);
        });
    });
}

export function isHlsAudioSource(url: string) {
    if (url.indexOf('.m3u8') !== -1) return Promise.resolve(true);
    return import('utils/fetch').then(fetchHelper => fetchHelper.ajax({ url, type: 'HEAD' })).then(response => {
        const type = (response.headers.get('Content-Type') || '').toLowerCase();
        return type === 'application/vnd.apple.mpegurl' || type === 'application/x-mpegurl';
    }, () => false);
}
