import { createStreamInfo } from './playbackStream';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { getMediaInfoApi } from '@jellyfin/sdk/lib/utils/api/media-info-api';
import { PluginType } from 'constants/pluginType';
import type { ApiClient as PlaybackApiClient } from 'jellyfin-apiclient';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { enableLocalPlaylistManagement } from 'lib/playback/playerSelection';
import { autoSetNextTracks } from 'lib/playback/trackSelection';
import type { PlaybackDeviceProfile, PlaybackItem, PlaybackMediaSource, PlaybackOptions, PlaybackStreamInfo, TrackSelection } from 'lib/playback/types';
import { MediaError } from 'types/mediaError';
import type { PlaybackPlayer, PreplayInterceptPlugin } from 'types/plugin';
import * as bitrateTest from 'utils/bitrateTest';
import { getHttpStatus } from 'utils/httpStatus';
import appSettings from '../../scripts/settings/appSettings';
import Events from '../../utils/events';
import itemHelper from '../itemHelper';
import loading from '../loading/loading';
import { pluginManager } from '../pluginManager';
import type { PlaybackContext, PlaybackServices } from './playbackContext';
import { getItemsForPlayback, createStreamInfoFromUrlItem, isServerItem, getIntros, truncatePlayOptions, normalizePlayOptions } from './playbackItemQueries';
import { setStreamUrls, getPlaybackInfo, getOptimalMediaSource, getLiveStream, supportsDirectPlay, validatePlaybackInfoResult, showPlaybackInfoErrorMessage } from './playbackNegotiation';
import { getPlayer, getMatchingMediaSource } from './playbackRegistry';

export function createPlaybackPreparation(self: PlaybackContext, services: Pick<PlaybackServices, 'assertPlaybackAttempt' | 'translateItemsForPlayback' | 'setPlaylistState' | 'removeCurrentPlayer' | 'onPlaybackChanging' | 'getPlayerData' | 'setCurrentPlayerInternal' | 'onPlaybackStarted' | 'setSrcIntoPlayer' | 'getSavedMaxStreamingBitrate'>) {
    async function preparePlayItems(options: PlaybackOptions, attempt: number) {
        let items = options.items;
        if (!items) {
            if (!options.serverId) throw new Error('serverId required!');
            items = (await getItemsForPlayback(options.serverId, { Ids: options.ids!.join(',') })).Items;
            services.assertPlaybackAttempt(attempt);
        }
        items = await services.translateItemsForPlayback(items, options, attempt);
        services.assertPlaybackAttempt(attempt);
        const parts = await getAdditionalParts(items, options.mediaSourceId, options.startIndex || 0, attempt);
        services.assertPlaybackAttempt(attempt);
        if (options.startIndex) {
            let adjustedStartIndex = 0;
            for (let index = 0; index < options.startIndex; index++) adjustedStartIndex += parts[index].length;
            options.startIndex = adjustedStartIndex;
        }
        return parts.flat();
    }

    function playOther(items: PlaybackItem[], options: PlaybackOptions) {
        const playStartIndex = options.startIndex || 0;
        const player = getPlayer(self, items[playStartIndex], options);

        loading.hide();

        options.items = items;

        return player.play(options);
    }

    const getAdditionalParts = async (items: PlaybackItem[], mediaSourceId: string | null | undefined, startIndex: number | undefined, attempt?: number) => {
        const getItemAndParts = async function (item: PlaybackItem, isStartItem: boolean) {
            if (
                item.PartCount && item.PartCount > 1
                    && [ BaseItemKind.Episode, BaseItemKind.Movie ].includes(item.Type as typeof BaseItemKind.Episode | typeof BaseItemKind.Movie)
            ) {
                const client = ServerConnections.getApiClient(item.ServerId);
                const user = await client!.getCurrentUser();
                services.assertPlaybackAttempt(attempt);
                // When the user picked an alternate version, that version's MediaSourceId
                // equals its own BaseItem.Id, so use it to fetch the alternate's own
                // additional parts instead of the primary's - otherwise the primary's
                // stack parts would queue after the alternate finishes.
                const idForParts = (isStartItem && mediaSourceId && mediaSourceId !== item.Id) ?
                    mediaSourceId :
                    item.Id;
                const additionalParts = await client!.getAdditionalVideoParts(user.Id, idForParts!);
                services.assertPlaybackAttempt(attempt);
                if (additionalParts.Items!.length) {
                    return [ item, ...additionalParts.Items! ];
                }
            }
            return [ item ];
        };

        return Promise.all(items.map((item: PlaybackItem, index: number) => getItemAndParts(item, index === (startIndex || 0))));
    };

    function playWithIntros(items: PlaybackItem[], options: PlaybackOptions, attempt: number) {
        let playStartIndex = options.startIndex || 0;
        let firstItem = items[playStartIndex];

        // If index was bad, reset it
        if (!firstItem) {
            playStartIndex = 0;
            firstItem = items[playStartIndex];
        }

        // If it's still null then there's nothing to play
        if (!firstItem) {
            showPlaybackInfoErrorMessage(self, `PlaybackError.${MediaError.NO_MEDIA_ERROR}`);
            return Promise.reject();
        }

        if (firstItem.MediaType === 'Photo' || firstItem.MediaType === 'Book') {
            return playOther(items, options);
        }

        const apiClient = ServerConnections.getApiClient(firstItem.ServerId);

        return getIntros(firstItem, apiClient!, options).then(function (introsResult) {
            services.assertPlaybackAttempt(attempt);
            const introItems: PlaybackItem[] = introsResult.Items!;
            let introPlayOptions;

            firstItem.playOptions = truncatePlayOptions(options);

            if (introItems!.length) {
                introPlayOptions = {
                    fullscreen: firstItem.playOptions.fullscreen
                };
            } else {
                introPlayOptions = firstItem.playOptions;
            }

            items = introItems!.concat(items);

            // Needed by players that manage their own playlist
            introPlayOptions.items = items;
            introPlayOptions.startIndex = playStartIndex;

            return playInternal(items[playStartIndex], introPlayOptions, function () {
                self._playQueueManager.setPlaylist(items);

                services.setPlaylistState(items[playStartIndex].PlaylistItemId!, playStartIndex);
                loading.hide();
            }, undefined, attempt);
        });
    }

    function playInternal(item: PlaybackItem, playOptions: PlaybackOptions, onPlaybackStartedFn: () => void, prevSource?: PlaybackMediaSource | null, attempt = self._playbackAttempt.capture()) {
        if (item.IsPlaceHolder) {
            loading.hide();
            showPlaybackInfoErrorMessage(self, 'PlaybackErrorPlaceHolder');
            return Promise.reject();
        }

        // Normalize defaults to simplfy checks throughout the process
        normalizePlayOptions(playOptions);

        playOptions.isFirstItem = playOptions.isFirstItem || !prevSource;

        // TODO: This should be the media type requested, not the original media type
        const mediaType = item.MediaType;
        let ownsLoading = false;

        return runInterceptors(item, playOptions, attempt)
            .catch(() => {
                services.assertPlaybackAttempt(attempt);
                return onInterceptorRejection();
            })
            .then(() => {
                services.assertPlaybackAttempt(attempt);
                if (playOptions.fullscreen) {
                    self._playbackAttempt.claimLoading(attempt);
                    ownsLoading = true;
                    loading.show();
                }
            })
            .then(() => detectBitrate(item, mediaType, attempt))
            .then((bitrate) => {
                services.assertPlaybackAttempt(attempt);
                return playAfterBitrateDetect(bitrate, item, playOptions, onPlaybackStartedFn, prevSource, attempt)
                    .catch((error: unknown) => {
                        services.assertPlaybackAttempt(attempt);
                        return onPlaybackRejection(error);
                    });
            })
            .catch(() => {
                if (self._playbackAttempt.isCurrent(attempt) && playOptions.fullscreen) {
                    loading.hide();
                }
                return false;
            }).then(result => {
                if (ownsLoading) self._playbackAttempt.finish(attempt);
                return result;
            }, (error: unknown) => {
                if (ownsLoading) self._playbackAttempt.finish(attempt);
                throw error;
            });
    }

    function cancelPlayback() {
        const player = self._currentPlayer;

        if (player) {
            destroyPlayer(player);
            services.removeCurrentPlayer(player);
        }

        Events.trigger(self, 'playbackcancelled');
    }

    function onInterceptorRejection() {
        cancelPlayback();

        return Promise.reject();
    }

    function onPlaybackRejection(e: unknown) {
        cancelPlayback();

        let displayErrorCode = 'ErrorDefault';

        const status = getHttpStatus(e);
        if (status! >= 500) {
            displayErrorCode = `PlaybackError.${MediaError.SERVER_ERROR}`;
        } else if (status! >= 400) {
            displayErrorCode = `PlaybackError.${MediaError.NO_MEDIA_ERROR}`;
        }

        showPlaybackInfoErrorMessage(self, displayErrorCode);

        return Promise.reject();
    }

    function destroyPlayer(player: PlaybackPlayer) {
        player.destroy();
    }

    function runInterceptors(item: PlaybackItem, playOptions: PlaybackOptions, attempt: number) {
        return new Promise<void>(function (resolve, reject) {
            // Registry type tags identify adapters whose operational methods are loaded lazily.
            const interceptors = pluginManager.ofType(PluginType.PreplayIntercept) as unknown as PreplayInterceptPlugin[];

            interceptors.sort(function (a, b) {
                return (a.priority || 0) - (b.priority || 0);
            });

            if (!interceptors.length) {
                resolve();
                return;
            }

            const options = Object.assign({}, playOptions);

            options.mediaType = item.MediaType;
            options.item = item;

            runNextPrePlay(interceptors, 0, options, resolve, reject, attempt);
        });
    }

    function runNextPrePlay(interceptors: PreplayInterceptPlugin[], index: number, options: PlaybackOptions, resolve: () => void, reject: (reason: unknown) => void, attempt: number) {
        if (index >= interceptors.length) {
            resolve();
            return;
        }

        const interceptor = interceptors[index];

        // runInterceptors enriches these options with item and mediaType before dispatch.
        void interceptor.intercept(options as import('types/plugin').InterceptOptions).then(function () {
            services.assertPlaybackAttempt(attempt);
            runNextPrePlay(interceptors, index + 1, options, resolve, reject, attempt);
        }, reject).catch(reject);
    }

    function sendPlaybackListToPlayer(player: PlaybackPlayer, items: PlaybackItem[], deviceProfile: PlaybackDeviceProfile, apiClient: PlaybackApiClient, mediaSourceId: string | null | undefined, options: PlaybackOptions) {
        return setStreamUrls(items, deviceProfile, options.maxBitrate, apiClient, options.startPosition).then(function () {
            loading.hide();

            return player.play({
                items,
                startPositionTicks: options.startPosition || 0,
                mediaSourceId,
                audioStreamIndex: options.audioStreamIndex,
                subtitleStreamIndex: options.subtitleStreamIndex,
                startIndex: options.startIndex
            });
        });
    }

    function detectBitrate(item: PlaybackItem, mediaType: string | null | undefined, attempt: number) {
        const api = ServerConnections.getApi(item.ServerId!);
        const apiClient = ServerConnections.getApiClient(item.ServerId);

        if (!isServerItem(item) || itemHelper.isLocalItem(item)) {
            return Promise.resolve(services.getSavedMaxStreamingBitrate(apiClient, mediaType));
        }

        return apiClient!.getEndpointInfo()
            .then(/** @returns The immediate cancellation result or the existing pending stream operation. */ (endpointInfo) => {
                services.assertPlaybackAttempt(attempt);
                if ((mediaType === 'Video' || mediaType === 'Audio') && appSettings.enableAutomaticBitrateDetection(endpointInfo.IsInNetwork, mediaType)) {
                    return bitrateTest.detectBitrate(api!)
                        .then((bitrate) => {
                            services.assertPlaybackAttempt(attempt);
                            appSettings.maxStreamingBitrate(endpointInfo.IsInNetwork, mediaType, bitrate);
                            return bitrate;
                        });
                }

                return services.getSavedMaxStreamingBitrate(apiClient, mediaType);
            })
            .catch(() => {
                services.assertPlaybackAttempt(attempt);
                return services.getSavedMaxStreamingBitrate(apiClient, mediaType);
            });
    }

    function playAfterBitrateDetect(maxBitrate: number, item: PlaybackItem, playOptions: PlaybackOptions, onPlaybackStartedFn: () => void, prevSource: PlaybackMediaSource | null | undefined, attempt: number) {
        const startPosition = playOptions.startPositionTicks;

        const player = getPlayer(self, item, playOptions);
        const activePlayer = self._currentPlayer;

        let promise;

        if (activePlayer) {
            // TODO: if changing players within the same playlist, this will cause nextItem to be null
            self._playNextAfterEnded = false;
            promise = services.onPlaybackChanging(activePlayer, player, item);
        } else {
            promise = Promise.resolve();
        }

        if (!player) {
            return promise.then(() => {
                cancelPlayback();
                loading.hide();
                console.error(`No player found for the requested media: ${item.Url}`);
                showPlaybackInfoErrorMessage(self, 'ErrorPlayerNotFound');
            });
        }

        if (!isServerItem(item) || item.MediaType === 'Book') {
            return promise.then(function () {
                services.assertPlaybackAttempt(attempt);
                const streamInfo = createStreamInfoFromUrlItem(item);
                streamInfo.fullscreen = playOptions.fullscreen;
                const playerData = services.getPlayerData(player);
                playerData.isChangingStream = false;
                playerData.streamInfo = streamInfo;
                services.setCurrentPlayerInternal(player);
                services.assertPlaybackAttempt(attempt);
                return player.play(streamInfo).then(() => {
                    if (!self._playbackAttempt.isCurrent(attempt) || playerData.streamInfo !== streamInfo || self._currentPlayer !== player) return false;
                    loading.hide();
                    onPlaybackStartedFn();
                    services.onPlaybackStarted(player, playOptions, streamInfo);
                    return true;
                }).catch((errorCode: string) => {
                    if (self._playbackAttempt.isCurrent(attempt) && playerData.streamInfo === streamInfo && self._currentPlayer === player) {
                        void self.stop(player);
                        loading.hide();
                        showPlaybackInfoErrorMessage(self, errorCode || 'ErrorDefault');
                    }
                    return false;
                });
            });
        }

        let mediaSourceId = playOptions.mediaSourceId;

        const apiClient = ServerConnections.getApiClient(item.ServerId);
        const isLiveTv = [BaseItemKind.TvChannel, BaseItemKind.LiveTvChannel].includes(item.Type as typeof BaseItemKind.TvChannel | typeof BaseItemKind.LiveTvChannel);
        const getSourceItem = isLiveTv ? Promise.resolve(null) : apiClient!.getItem(apiClient!.getCurrentUserId(), mediaSourceId || item.Id!);

        return Promise.all([promise, player.getDeviceProfile(item), apiClient!.getCurrentUser(), getSourceItem]).then(async function (responses) {
            services.assertPlaybackAttempt(attempt);
            const deviceProfile = responses[1];
            const user = responses[2];
            const sourceItem = responses[3];

            // Queued items do not always carry their media sources, in which case the version
            // to keep playing can only be matched on the item fetched for playback.
            const versionSource = mediaSourceId ? null : getMatchingMediaSource(sourceItem?.MediaSources, prevSource);

            if (versionSource) {
                mediaSourceId = versionSource.Id!;
            }

            const mediaStreams = versionSource?.MediaStreams || sourceItem?.MediaStreams || [];

            const audioStreamIndex = playOptions.audioStreamIndex;
            const subtitleStreamIndex = playOptions.subtitleStreamIndex;
            const options: PlaybackOptions = {
                aspectRatio: playOptions.aspectRatio,
                maxBitrate,
                startPosition,
                isPlayback: null,
                audioStreamIndex,
                subtitleStreamIndex,
                startIndex: playOptions.startIndex,
                enableDirectPlay: null,
                enableDirectStream: null,
                allowVideoStreamCopy: null,
                allowAudioStreamCopy: null
            };

            if (player && !enableLocalPlaylistManagement(player)) {
                return sendPlaybackListToPlayer(player, playOptions.items!, deviceProfile, apiClient!, mediaSourceId, options);
            }

            // this reference was only needed by sendPlaybackListToPlayer
            playOptions.items = null;

            const trackOptions: TrackSelection = {};
            let isIdFallbackNeeded = false;

            autoSetNextTracks(prevSource, mediaStreams, trackOptions, user.Configuration!.RememberAudioSelections, user.Configuration!.RememberSubtitleSelections);
            if (trackOptions.DefaultAudioStreamIndex != null) {
                options.audioStreamIndex = trackOptions.DefaultAudioStreamIndex;
                isIdFallbackNeeded = true;
            }
            if (trackOptions.DefaultSubtitleStreamIndex != null) {
                options.subtitleStreamIndex = trackOptions.DefaultSubtitleStreamIndex;
                isIdFallbackNeeded = true;
            }

            if (isIdFallbackNeeded) {
                mediaSourceId ||= item.Id;
            }

            let openedLiveStreamId: string | null | undefined;
            let accepted = false;
            let preparedStreamInfo: PlaybackStreamInfo | undefined;
            const recordOpenedSource = (source: PlaybackMediaSource) => {
                openedLiveStreamId = source.LiveStreamId;
            };
            const acceptSource = () => {
                accepted = true;
            };
            try {
                return await getPlaybackMediaSource(player, apiClient!, deviceProfile, item, mediaSourceId, options, { attempt, onOpened: recordOpenedSource }).then(async (mediaSource: PlaybackMediaSource) => {
                    services.assertPlaybackAttempt(attempt);
                    if (trackOptions.DefaultSecondarySubtitleStreamIndex != null) {
                        mediaSource.DefaultSecondarySubtitleStreamIndex = trackOptions.DefaultSecondarySubtitleStreamIndex;
                    }

                    if (mediaSource.DefaultSubtitleStreamIndex == null || mediaSource.DefaultSubtitleStreamIndex < 0) {
                        if (mediaSource.DefaultSecondarySubtitleStreamIndex != null) {
                            mediaSource.DefaultSubtitleStreamIndex = mediaSource.DefaultSecondarySubtitleStreamIndex;
                        }
                        mediaSource.DefaultSecondarySubtitleStreamIndex = -1;
                    }

                    const subtitleTrack1 = mediaSource.MediaStreams![mediaSource.DefaultSubtitleStreamIndex!];
                    const subtitleTrack2 = mediaSource.MediaStreams![mediaSource.DefaultSecondarySubtitleStreamIndex!];

                    if (!self.trackHasSecondarySubtitleSupport(subtitleTrack1, player)
                            || !self.trackHasSecondarySubtitleSupport(subtitleTrack2, player)) {
                        mediaSource.DefaultSecondarySubtitleStreamIndex = -1;
                    }

                    const playedItem = await getItemOfMediaSource(apiClient!, item, mediaSource, sourceItem);
                    services.assertPlaybackAttempt(attempt);

                    const streamInfo = createStreamInfo(apiClient!, item.MediaType!, playedItem, mediaSource, startPosition, player);
                    preparedStreamInfo = streamInfo;
                    streamInfo.aspectRatio = playOptions.aspectRatio;
                    streamInfo.fullscreen = playOptions.fullscreen;

                    const playerData = services.getPlayerData(player);

                    playerData.isChangingStream = false;
                    playerData.maxStreamingBitrate = maxBitrate;
                    playerData.streamInfo = streamInfo;
                    playerData.audioStreamIndex = mediaSource.DefaultAudioStreamIndex;
                    playerData.subtitleStreamIndex = mediaSource.DefaultSubtitleStreamIndex;
                    playerData.secondarySubtitleStreamIndex = mediaSource.DefaultSecondarySubtitleStreamIndex;

                    streamInfo.onPlaybackStarted = function (startedStreamInfo: PlaybackStreamInfo) {
                        loading.hide();
                        onPlaybackStartedFn();
                        services.onPlaybackStarted(player, playOptions, startedStreamInfo, startedStreamInfo.mediaSource);
                    };
                    // Select the pending player so Stop can cancel it before play resolves.
                    services.setCurrentPlayerInternal(player);
                    return services.setSrcIntoPlayer(apiClient!, player, streamInfo, attempt, acceptSource);
                });
            } finally {
                if (openedLiveStreamId && !accepted && !preparedStreamInfo?.ended) {
                    await closeUnacceptedLiveStream(item, openedLiveStreamId);
                }
            }
        });
    }

    // Chapters and trickplay data belong to the item owning the played media source.
    function getItemOfMediaSource(apiClient: PlaybackApiClient, item: PlaybackItem, mediaSource: PlaybackMediaSource, sourceItem: PlaybackItem | null) {
        if (!mediaSource.hasAlternateVersions || mediaSource.Id === item.Id) {
            return Promise.resolve(item);
        }

        const getVersionItem = sourceItem?.Id === mediaSource.Id ?
            Promise.resolve(sourceItem) :
            apiClient.getItem(apiClient.getCurrentUserId(), mediaSource.Id!).catch(() => null);

        return getVersionItem.then(function (versionItem) {
            if (!versionItem) {
                return item;
            }

            return {
                ...item,
                Chapters: versionItem.Chapters,
                // Trickplay manifests are keyed by media source, so they can just be added
                Trickplay: { ...item.Trickplay, ...versionItem.Trickplay }
            };
        });
    }

    async function closeUnacceptedLiveStream(item: PlaybackItem, liveStreamId: string) {
        try {
            const api = ServerConnections.getApi(item.ServerId!);
            await getMediaInfoApi(api!).closeLiveStream({ liveStreamId });
        } catch (cleanupError) {
            console.warn('[playbackmanager] failed to close cancelled live stream', getHttpStatus(cleanupError));
        }
    }

    async function prepareOpenedStream(apiClient: PlaybackApiClient, item: PlaybackItem, opened: PlaybackMediaSource, source: PlaybackMediaSource, attempt?: number) {
        services.assertPlaybackAttempt(attempt);
        const directPlay = await supportsDirectPlay(apiClient, item, opened);
        services.assertPlaybackAttempt(attempt);
        opened.enableDirectPlay = directPlay;
        opened.hasAlternateVersions = source.hasAlternateVersions;
        return opened;
    }

    function getPlaybackMediaSource(player: PlaybackPlayer, apiClient: PlaybackApiClient, deviceProfile: PlaybackDeviceProfile, item: PlaybackItem, mediaSourceId: string | null | undefined, options: PlaybackOptions, preparation: { attempt?: number; onOpened?: (source: PlaybackMediaSource) => void } = {}) {
        const { attempt, onOpened } = preparation;
        options.isPlayback = true;

        return getPlaybackInfo(player, apiClient, item, deviceProfile, mediaSourceId, null, options).then(function (playbackInfoResult) {
            const opened = playbackInfoResult.MediaSources?.find(source => !!source.LiveStreamId);
            if (opened) onOpened?.(opened);
            services.assertPlaybackAttempt(attempt);
            if (validatePlaybackInfoResult(self, playbackInfoResult)) {
                return getOptimalMediaSource(apiClient, item, playbackInfoResult.MediaSources!).then(function (mediaSource: PlaybackMediaSource) {
                    services.assertPlaybackAttempt(attempt);
                    if (mediaSource) {
                        // Remember whether alternate versions exists
                        mediaSource.hasAlternateVersions = playbackInfoResult.MediaSources!.length > 1
                                || (item.MediaSources?.length || 0) > 1
                                || (!!mediaSourceId && mediaSourceId !== item.Id);

                        if (mediaSource.RequiresOpening && !mediaSource.LiveStreamId) {
                            options.audioStreamIndex = null;
                            options.subtitleStreamIndex = null;

                            return getLiveStream(player, apiClient, item, playbackInfoResult.PlaySessionId, deviceProfile, mediaSource, options).then(function (openLiveStreamResult) {
                                onOpened?.(openLiveStreamResult.MediaSource);
                                return prepareOpenedStream(apiClient, item, openLiveStreamResult.MediaSource, mediaSource, attempt);
                            });
                        } else {
                            if (item.AlbumId != null) {
                                return apiClient.getItem(apiClient.getCurrentUserId(), item.AlbumId).then(function(result) {
                                    mediaSource.albumNormalizationGain = result.NormalizationGain;
                                    return mediaSource;
                                });
                            }
                            return mediaSource;
                        }
                    } else {
                        showPlaybackInfoErrorMessage(self, `PlaybackError.${MediaError.NO_MEDIA_ERROR}`);
                        return Promise.reject();
                    }
                });
            } else {
                return Promise.reject();
            }
        });
    }

    const api = {
        play: async function (options: PlaybackOptions) {
            const ownsLoading = options.fullscreen !== false && (!self._currentPlayer || !!self._currentPlayer.isLocalPlayer);
            const attempt = self._playbackAttempt.begin(ownsLoading);
            try {
                normalizePlayOptions(options);
                if (self._currentPlayer && !self._currentPlayer.isLocalPlayer) {
                    if (options.enableRemotePlayers === false) throw new Error('Remote players are disabled');
                    return await self._currentPlayer.play(options);
                }
                if (options.fullscreen) loading.show();
                const items = await preparePlayItems(options, attempt);
                services.assertPlaybackAttempt(attempt);
                return await playWithIntros(items, options, attempt);
            } catch (error) {
                if (!self._playbackAttempt.isCurrent(attempt)) return false;
                if (ownsLoading) loading.hide();
                throw error;
            } finally {
                if (ownsLoading) self._playbackAttempt.finish(attempt);
            }
        },
        getPlaybackInfo: function (this: PlaybackContext, item: PlaybackItem, options: PlaybackOptions) {
            options = options || {};
            const startPosition = options.startPositionTicks || 0;
            const mediaType = options.mediaType || item.MediaType;
            const player = getPlayer(self, item, options);
            const apiClient = ServerConnections.getApiClient(item.ServerId);

            // Call this just to ensure the value is recorded, it is needed with services.getSavedMaxStreamingBitrate
            return apiClient!.getEndpointInfo().then(function () {
                const maxBitrate = services.getSavedMaxStreamingBitrate(ServerConnections.getApiClient(item.ServerId), mediaType);

                return player.getDeviceProfile(item).then(function (deviceProfile: PlaybackDeviceProfile) {
                    const mediaOptions = {
                        maxBitrate,
                        startPosition,
                        isPlayback: null,
                        audioStreamIndex: options.audioStreamIndex,
                        subtitleStreamIndex: options.subtitleStreamIndex,
                        startIndex: null,
                        enableDirectPlay: null,
                        enableDirectStream: null,
                        allowVideoStreamCopy: null,
                        allowAudioStreamCopy: null
                    };

                    return getPlaybackMediaSource(player, apiClient!, deviceProfile, item, options.mediaSourceId, mediaOptions).then(function (mediaSource: PlaybackMediaSource) {
                        return createStreamInfo(apiClient!, item.MediaType!, item, mediaSource, startPosition, player);
                    });
                });
            });
        },
        getPlaybackMediaSources: function (this: PlaybackContext, item: PlaybackItem, options: PlaybackOptions) {
            options = options || {};
            const startPosition = options.startPositionTicks || 0;
            const mediaType = options.mediaType || item.MediaType;
            // TODO: Remove the true forceLocalPlayer hack
            const player = getPlayer(self, item, options, true);
            const apiClient = ServerConnections.getApiClient(item.ServerId);

            // Call this just to ensure the value is recorded, it is needed with services.getSavedMaxStreamingBitrate
            return apiClient!.getEndpointInfo().then(function () {
                const maxBitrate = services.getSavedMaxStreamingBitrate(ServerConnections.getApiClient(item.ServerId), mediaType);

                return player.getDeviceProfile(item).then(function (deviceProfile: PlaybackDeviceProfile) {
                    const mediaOptions = {
                        maxBitrate,
                        startPosition,
                        isPlayback: true,
                        audioStreamIndex: null,
                        subtitleStreamIndex: null,
                        enableDirectPlay: null,
                        enableDirectStream: null,
                        allowVideoStreamCopy: null,
                        allowAudioStreamCopy: null
                    };

                    return getPlaybackInfo(player, apiClient!, item, deviceProfile, null, null, mediaOptions).then(function (playbackInfoResult) {
                        return playbackInfoResult.MediaSources;
                    });
                });
            });
        }
    };
    return {

        services: { playInternal, destroyPlayer },
        api
    };
}
