import { createStreamInfo } from './playbackStream';
import { TICKS_PER_MILLISECOND } from 'constants/time';
import type { ApiClient as PlaybackApiClient } from 'jellyfin-apiclient';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import type { PlaybackDeviceProfile, PlaybackStreamInfo } from 'lib/playback/types';
import { MediaError } from 'types/mediaError';
import type { PlaybackPlayer } from 'types/plugin';
import { getMediaError } from 'utils/mediaError';
import Events from '../../utils/events';
import type { PlaybackContext, PlaybackServices } from './playbackContext';
import { getPlaybackInfo, validatePlaybackInfoResult, showPlaybackInfoErrorMessage } from './playbackNegotiation';

function changeStreamToUrl(services: Pick<PlaybackServices, 'getPlayerData' | 'setSrcIntoPlayer'>, apiClient: PlaybackApiClient, player: PlaybackPlayer, playSessionId: string | null | undefined, streamInfo: PlaybackStreamInfo): Promise<boolean | void> {
    const playerData = services.getPlayerData(player);
    const previousStreamInfo = playerData.streamInfo;
    playerData.isChangingStream = true;

    if (previousStreamInfo && playSessionId) {
        return apiClient.stopActiveEncodings(playSessionId).then(/** @returns The immediate cancellation result or the existing pending stream operation. */ function () {
            if (playerData.streamInfo !== previousStreamInfo) return false;
            // The old URL may still be requested until the player has replaced its source.
            return services.setSrcIntoPlayer(apiClient, player, streamInfo).then(result => {
                return apiClient.stopActiveEncodings(playSessionId).then(() => result, (error: unknown) => {
                    console.warn('[playbackmanager] failed to stop old encodings', error);
                    return result;
                });
            });
        });
    }
    return services.setSrcIntoPlayer(apiClient, player, streamInfo);
}

export function createPlaybackStreamChange(self: PlaybackContext, services: Pick<PlaybackServices, 'canPlayerSeek' | 'getPlayerData' | 'getDefaultPlayOptions' | 'onPlaybackStopped' | 'sendProgressUpdate' | 'onPlaybackError' | 'setSrcIntoPlayer'>) {
    function changeStream(player: PlaybackPlayer, ticks: number, params?: { EnableDirectPlay?: boolean; EnableDirectStream?: boolean; AllowVideoStreamCopy?: boolean; AllowAudioStreamCopy?: boolean | null; AudioStreamIndex?: number; SubtitleStreamIndex?: number; SecondarySubtitleStreamIndex?: number; MaxStreamingBitrate?: number }): Promise<boolean | void> | void {
        if (services.canPlayerSeek(player) && params == null) {
            player.currentTime(parseInt(String(ticks / TICKS_PER_MILLISECOND), 10));
            return;
        }

        params = params || {};

        const liveStreamId = services.getPlayerData(player).streamInfo!.liveStreamId;
        const lastMediaInfoQuery = services.getPlayerData(player).streamInfo!.lastMediaInfoQuery;

        const playSessionId = self.playSessionId(player);

        const currentItem = self.currentItem(player);

        const previousStreamInfo = services.getPlayerData(player).streamInfo;
        const stopOnFailure = params.EnableDirectPlay === false || !previousStreamInfo!.started;
        return player.getDeviceProfile(currentItem, {
            isRetry: params.EnableDirectPlay === false
        }).then(/** @returns The immediate cancellation result or the existing pending stream operation. */ function (deviceProfile: PlaybackDeviceProfile) {
            if (services.getPlayerData(player).streamInfo !== previousStreamInfo) return false;
            const audioStreamIndex = params.AudioStreamIndex == null ? services.getPlayerData(player).audioStreamIndex : params.AudioStreamIndex;
            const subtitleStreamIndex = params.SubtitleStreamIndex == null ? services.getPlayerData(player).subtitleStreamIndex : params.SubtitleStreamIndex;
            const secondarySubtitleStreamIndex = params.SecondarySubtitleStreamIndex == null ? services.getPlayerData(player).secondarySubtitleStreamIndex : params.SecondarySubtitleStreamIndex;

            let currentMediaSource = self.currentMediaSource(player);
            const apiClient = ServerConnections.getApiClient(currentItem!.ServerId);

            if (ticks) {
                ticks = parseInt(String(ticks), 10);
            }

            const maxBitrate = params.MaxStreamingBitrate || self.getMaxStreamingBitrate(player);

            const currentPlayOptions = currentItem!.playOptions || services.getDefaultPlayOptions();

            const options = {
                maxBitrate,
                startPosition: ticks,
                isPlayback: true,
                audioStreamIndex,
                subtitleStreamIndex,
                enableDirectPlay: params.EnableDirectPlay,
                enableDirectStream: params.EnableDirectStream,
                allowVideoStreamCopy: params.AllowVideoStreamCopy,
                allowAudioStreamCopy: params.AllowAudioStreamCopy
            };

            return getPlaybackInfo(player, apiClient!, currentItem!, deviceProfile, currentMediaSource!.Id, liveStreamId, options).then(/** @returns The immediate cancellation result or the existing pending stream operation. */ function (result) {
                if (services.getPlayerData(player).streamInfo !== previousStreamInfo) return false;
                if (validatePlaybackInfoResult(self, result)) {
                    // Changing streams requests only the active source; keep the version availability flag.
                    result.MediaSources![0].hasAlternateVersions = currentMediaSource!.hasAlternateVersions;
                    currentMediaSource = result.MediaSources![0];

                    const streamInfo = createStreamInfo(apiClient!, currentItem!.MediaType!, currentItem!, currentMediaSource, ticks, player);
                    streamInfo.fullscreen = currentPlayOptions.fullscreen;
                    streamInfo.lastMediaInfoQuery = lastMediaInfoQuery;
                    streamInfo.resetSubtitleOffset = false;

                    if (!streamInfo.url) {
                        if (stopOnFailure) {
                            services.onPlaybackStopped.call(player, null, `.${MediaError.NO_MEDIA_ERROR}`);
                        } else {
                            services.getPlayerData(player).isChangingStream = false;
                            showPlaybackInfoErrorMessage(self, `PlaybackError.${MediaError.NO_MEDIA_ERROR}`);
                        }
                        return false;
                    }

                    services.getPlayerData(player).subtitleStreamIndex = subtitleStreamIndex;
                    services.getPlayerData(player).secondarySubtitleStreamIndex = secondarySubtitleStreamIndex;
                    services.getPlayerData(player).audioStreamIndex = audioStreamIndex;
                    services.getPlayerData(player).maxStreamingBitrate = maxBitrate;

                    return changeStreamToUrl(services, apiClient!, player, playSessionId, streamInfo);
                }
                services.getPlayerData(player).isChangingStream = false;
                if (stopOnFailure) {
                    self._playNextAfterEnded = false;
                    services.onPlaybackStopped.call(player);
                }
                return false;
            });
        }).catch((error: unknown) => {
            if (services.getPlayerData(player).streamInfo === previousStreamInfo) {
                services.getPlayerData(player).isChangingStream = false;
                if (stopOnFailure) {
                    Events.trigger(self, 'playbackerror', [getMediaError(error as DOMException)]);
                    services.onPlaybackStopped.call(player, error, `.${getMediaError(error as DOMException)}`);
                }
            }
            return false;
        });
    }

    function setSrcIntoPlayer(apiClient: PlaybackApiClient, player: PlaybackPlayer, streamInfo: PlaybackStreamInfo): Promise<boolean | void> {
        const playerData = services.getPlayerData(player);
        streamInfo.started = playerData.streamInfo?.started;
        streamInfo.onPlaybackStarted = playerData.streamInfo?.onPlaybackStarted;
        playerData.streamInfo = streamInfo;

        return player.play(streamInfo).then(function () {
            if (playerData.streamInfo !== streamInfo || self._currentPlayer !== player) return false;
            playerData.isChangingStream = false;
            streamInfo.ended = false;

            if (streamInfo.onPlaybackStarted) {
                const onStarted = streamInfo.onPlaybackStarted;
                delete streamInfo.onPlaybackStarted;
                onStarted(streamInfo);
            } else {
                streamInfo.started = true;
                services.sendProgressUpdate(player, 'timeupdate');
            }
            return true;
        }, /** @returns The immediate cancellation result or the existing pending stream operation. */ function (e: unknown) {
            if (playerData.streamInfo !== streamInfo || self._currentPlayer !== player) return false;
            playerData.isChangingStream = false;

            return services.onPlaybackError.call(player, e, {
                type: getMediaError(e as DOMException),
                streamInfo
            });
        });
    }

    return {

        services: { changeStream, setSrcIntoPlayer }
    };
}
