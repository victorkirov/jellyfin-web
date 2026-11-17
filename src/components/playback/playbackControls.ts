import type { MediaStream } from '@jellyfin/sdk/lib/generated-client/models/media-stream';
import { AppFeature } from 'constants/appFeature';
import type { ApiClient as PlaybackApiClient } from 'jellyfin-apiclient';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { enableLocalPlaylistManagement } from 'lib/playback/playerSelection';
import type { PlaybackDeviceProfile, PlaybackMediaSource, PlaybackOptions } from 'lib/playback/types';
import Screenfull from 'screenfull';
import type { PlaybackPlayer } from 'types/plugin';
import * as bitrateTest from 'utils/bitrateTest';
import appSettings from '../../scripts/settings/appSettings';
import { appHost } from '../apphost';
import { includesAny } from '../../utils/container';
import type { PlaybackContext, PlaybackServices } from './playbackContext';

function supportsPhysicalVolumeControl(player: PlaybackPlayer) {
    return player.isLocalPlayer && appHost.supports(AppFeature.PhysicalVolumeControl);
}

export function createPlaybackControls(self: PlaybackContext, services: Pick<PlaybackServices, 'getPlayerData' | 'getCurrentTicks' | 'changeStream' | 'getCurrentSubtitleStream'>) {
    let brightnessOsdLoaded: boolean | undefined;

    function isAudioStreamSupported(mediaSource: PlaybackMediaSource, index: number, deviceProfile: PlaybackDeviceProfile) {
        let mediaStream;
        const mediaStreams = mediaSource.MediaStreams;

        for (let i = 0, length = mediaStreams!.length; i < length; i++) {
            if (mediaStreams![i].Type === 'Audio' && mediaStreams![i].Index === index) {
                mediaStream = mediaStreams![i];
                break;
            }
        }

        if (!mediaStream) {
            return false;
        }

        const container = mediaSource.Container!.toLowerCase();
        const codec = (mediaStream.Codec || '').toLowerCase();

        if (!codec) {
            return false;
        }

        const profiles = deviceProfile.DirectPlayProfiles || [];

        return profiles.some(function (p) {
            return p.Type === 'Video'
                    && includesAny((p.Container || '').toLowerCase(), container)
                    && includesAny((p.AudioCodec || '').toLowerCase(), codec);
        });
    }

    function getSavedMaxStreamingBitrate(apiClient: PlaybackApiClient | null | undefined, mediaType: string | null | undefined) {
        if (!apiClient) {
            // This should hopefully never happen
            apiClient = ServerConnections.currentApiClient();
        }

        const endpointInfo = apiClient!.getSavedEndpointInfo() || {};

        return appSettings.maxStreamingBitrate(endpointInfo.IsInNetwork, mediaType);
    }

    function getDeliveryMethod(subtitleStream: MediaStream) {
        // This will be null for internal subs for local items
        if (subtitleStream.DeliveryMethod) {
            return subtitleStream.DeliveryMethod;
        }

        return subtitleStream.IsExternal ? 'External' : 'Embed';
    }

    function canUseSubtitleElement(stream: MediaStream, playMethod: string | null | undefined) {
        const delivery = getDeliveryMethod(stream);
        return delivery === 'External' || (delivery === 'Embed' && playMethod !== 'Transcode');
    }

    function selectSubtitleElement(player: PlaybackPlayer, index: number, currentStream: MediaStream | null | undefined, newStream: MediaStream | null | undefined, playMethod: string | null | undefined) {
        if (currentStream && !newStream) {
            const delivery = getDeliveryMethod(currentStream);
            if (delivery === 'Encode' || (delivery === 'Embed' && playMethod === 'Transcode')) {
                void services.changeStream(player, services.getCurrentTicks(player), { SubtitleStreamIndex: -1 });
            }
            return -1;
        }
        if (!newStream) return -1;
        if (!canUseSubtitleElement(newStream, playMethod)) {
            void services.changeStream(player, services.getCurrentTicks(player), { SubtitleStreamIndex: index });
            return -1;
        }
        if (currentStream) {
            const delivery = getDeliveryMethod(currentStream);
            if (delivery !== 'External' && delivery !== 'Embed') {
                void services.changeStream(player, services.getCurrentTicks(player), { SubtitleStreamIndex: -1 });
            }
        }
        return index;
    }
    return { services: { getDeliveryMethod, getSavedMaxStreamingBitrate }, api: {
        toggleAspectRatio: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;

            if (player) {
                const current = self.getAspectRatio(player);

                const supported = self.getSupportedAspectRatios(player);

                let index = -1;
                for (let i = 0, length = supported.length; i < length; i++) {
                    if (supported[i].id === current) {
                        index = i;
                        break;
                    }
                }

                index++;
                if (index >= supported.length) {
                    index = 0;
                }

                self.setAspectRatio(supported[index].id, player);
            }
        },
        setAspectRatio: function (val: string, player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;

            if (player?.setAspectRatio) {
                player.setAspectRatio(val);
            }
        },
        getSupportedAspectRatios: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;

            if (player?.getSupportedAspectRatios) {
                return player.getSupportedAspectRatios();
            }

            return [];
        },
        getAspectRatio: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;

            if (player?.getAspectRatio) {
                return player.getAspectRatio();
            }
        },
        increasePlaybackRate: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            if (player) {
                const current = self.getPlaybackRate(player);
                const supported = self.getSupportedPlaybackRates(player);

                let index = -1;
                for (let i = 0, length = supported.length; i < length; i++) {
                    if (supported[i].id === current) {
                        index = i;
                        break;
                    }
                }

                index = Math.min(index + 1, supported.length - 1);
                self.setPlaybackRate(supported[index].id, player);
            }
        },
        decreasePlaybackRate: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            if (player) {
                const current = self.getPlaybackRate(player);
                const supported = self.getSupportedPlaybackRates(player);

                let index = -1;
                for (let i = 0, length = supported.length; i < length; i++) {
                    if (supported[i].id === current) {
                        index = i;
                        break;
                    }
                }

                index = Math.max(index - 1, 0);
                self.setPlaybackRate(supported[index].id, player);
            }
        },
        getSupportedPlaybackRates: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            if (player?.getSupportedPlaybackRates) {
                return player.getSupportedPlaybackRates();
            }
            return [];
        },
        setBrightness: function (this: PlaybackContext, val: number, player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;

            if (player) {
                if (!brightnessOsdLoaded) {
                    brightnessOsdLoaded = true;
                    // TODO: Have this trigger an event instead to get the osd out of here
                    void import('./brightnessosd').then();
                }
                player.setBrightness!(val);
            }
        },
        getBrightness: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;

            if (player) {
                return player.getBrightness!();
            }
        },
        setVolume: function (val: number, player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;

            if (player && !supportsPhysicalVolumeControl(player)) {
                player.setVolume(val);
            }
        },
        getVolume: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;

            if (player && !supportsPhysicalVolumeControl(player)) {
                return player.getVolume();
            }

            return 1;
        },
        volumeUp: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;

            if (player && !supportsPhysicalVolumeControl(player)) {
                player.volumeUp!();
            }
        },
        volumeDown: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;

            if (player && !supportsPhysicalVolumeControl(player)) {
                player.volumeDown!();
            }
        },
        changeAudioStream: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.changeAudioStream!();
            }

            if (!player) {
                return;
            }

            const currentMediaSource = self.currentMediaSource(player);
            const mediaStreams = [];
            for (let i = 0, length = currentMediaSource!.MediaStreams!.length; i < length; i++) {
                if (currentMediaSource!.MediaStreams![i].Type === 'Audio') {
                    mediaStreams.push(currentMediaSource!.MediaStreams![i]);
                }
            }

            // Nothing to change
            if (mediaStreams.length <= 1) {
                return;
            }

            const currentStreamIndex = self.getAudioStreamIndex(player);
            let indexInList = -1;
            for (let i = 0, length = mediaStreams.length; i < length; i++) {
                if (mediaStreams[i].Index === currentStreamIndex) {
                    indexInList = i;
                    break;
                }
            }

            let nextIndex = indexInList + 1;
            if (nextIndex >= mediaStreams.length) {
                nextIndex = 0;
            }

            nextIndex = nextIndex === -1 ? -1 : mediaStreams[nextIndex].Index!;

            self.setAudioStreamIndex(nextIndex, player);
        },
        changeSubtitleStream: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.changeSubtitleStream!();
            }

            if (!player) {
                return;
            }

            const currentMediaSource = self.currentMediaSource(player);
            const mediaStreams = [];
            for (let i = 0, length = currentMediaSource!.MediaStreams!.length; i < length; i++) {
                if (currentMediaSource!.MediaStreams![i].Type === 'Subtitle') {
                    mediaStreams.push(currentMediaSource!.MediaStreams![i]);
                }
            }

            // No known streams, nothing to change
            if (!mediaStreams.length) {
                return;
            }

            const currentStreamIndex = self.getSubtitleStreamIndex(player);
            let indexInList = -1;
            for (let i = 0, length = mediaStreams.length; i < length; i++) {
                if (mediaStreams[i].Index === currentStreamIndex) {
                    indexInList = i;
                    break;
                }
            }

            let nextIndex = indexInList + 1;
            if (nextIndex >= mediaStreams.length) {
                nextIndex = -1;
            }

            nextIndex = nextIndex === -1 ? -1 : mediaStreams[nextIndex].Index!;

            self.setSubtitleStreamIndex(nextIndex, player);
        },
        getAudioStreamIndex: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.getAudioStreamIndex!();
            }

            return services.getPlayerData(player).audioStreamIndex;
        },
        setAudioStreamIndex: function (index: number, player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.setAudioStreamIndex!(index);
            }

            if (self.playMethod(player) === 'Transcode' || !player.canSetAudioStreamIndex!()) {
                void services.changeStream(player, services.getCurrentTicks(player), { AudioStreamIndex: index });
                services.getPlayerData(player).audioStreamIndex = index;
            } else {
                // See if the player supports the track without transcoding
                void player.getDeviceProfile(self.currentItem(player)).then(function (profile) {
                    if (isAudioStreamSupported(self.currentMediaSource(player)!, index, profile)) {
                        player.setAudioStreamIndex!(index);
                        services.getPlayerData(player).audioStreamIndex = index;
                    } else {
                        void services.changeStream(player, services.getCurrentTicks(player), { AudioStreamIndex: index });
                        services.getPlayerData(player).audioStreamIndex = index;
                    }
                });
            }
        },
        getMaxStreamingBitrate: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            if (player?.getMaxStreamingBitrate) {
                return player.getMaxStreamingBitrate();
            }

            const playerData = services.getPlayerData(player);

            if (playerData.maxStreamingBitrate) {
                return playerData.maxStreamingBitrate;
            }

            const mediaType = playerData.streamInfo ? playerData.streamInfo.mediaType : null;
            const currentItem = self.currentItem(player);

            const apiClient = currentItem ? ServerConnections.getApiClient(currentItem.ServerId) : ServerConnections.currentApiClient();
            return getSavedMaxStreamingBitrate(apiClient, mediaType);
        },
        enableAutomaticBitrateDetection: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            if (player?.enableAutomaticBitrateDetection) {
                return player.enableAutomaticBitrateDetection();
            }

            const playerData = services.getPlayerData(player);
            const mediaType = playerData.streamInfo ? playerData.streamInfo.mediaType : null;
            const currentItem = self.currentItem(player);

            const apiClient = currentItem ? ServerConnections.getApiClient(currentItem.ServerId) : ServerConnections.currentApiClient();
            const endpointInfo = apiClient!.getSavedEndpointInfo() || {};

            return appSettings.enableAutomaticBitrateDetection(endpointInfo.IsInNetwork, mediaType);
        },
        setMaxStreamingBitrate: function (options: PlaybackOptions, player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            if (player?.setMaxStreamingBitrate) {
                return player.setMaxStreamingBitrate(options);
            }

            const api = ServerConnections.getApi(self.currentItem(player)!.ServerId!);
            const apiClient = ServerConnections.getApiClient(self.currentItem(player)!.ServerId);

            void apiClient!.getEndpointInfo().then(function (endpointInfo) {
                const playerData = services.getPlayerData(player);
                const mediaType = playerData.streamInfo ? playerData.streamInfo.mediaType : null;

                let promise;
                if (options.enableAutomaticBitrateDetection) {
                    appSettings.enableAutomaticBitrateDetection(endpointInfo.IsInNetwork, mediaType, true);
                    promise = bitrateTest.detectBitrate(api!, true);
                } else {
                    appSettings.enableAutomaticBitrateDetection(endpointInfo.IsInNetwork, mediaType, false);
                    promise = Promise.resolve(options.maxBitrate);
                }

                void promise.then(function (bitrate) {
                    appSettings.maxStreamingBitrate(endpointInfo.IsInNetwork, mediaType, bitrate);

                    void services.changeStream(player, services.getCurrentTicks(player), {
                        MaxStreamingBitrate: bitrate
                    });
                });
            });
        },
        isFullscreen: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            if (!player.isLocalPlayer || player.isFullscreen) {
                return player.isFullscreen!();
            }

            if (!Screenfull.isEnabled) {
                // iOS Safari
                return (document as Document & { webkitIsFullScreen?: boolean }).webkitIsFullScreen;
            }

            return Screenfull.isFullscreen;
        },
        toggleFullscreen: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            if (!player.isLocalPlayer || player.toggleFullscreen) {
                return player.toggleFullscreen!();
            }

            if (Screenfull.isEnabled) {
                void Screenfull.toggle();
            } else if ((document as Document & { webkitIsFullScreen?: boolean }).webkitIsFullScreen && (document as Document & { webkitCancelFullscreen?: () => void }).webkitCancelFullscreen) {
                // iOS Safari
                (document as Document & { webkitCancelFullscreen?: () => void }).webkitCancelFullscreen!();
            } else {
                const elem = document.querySelector('video');
                if ((elem as HTMLVideoElement & { webkitEnterFullscreen?: () => void })?.webkitEnterFullscreen) {
                    (elem as HTMLVideoElement & { webkitEnterFullscreen: () => void }).webkitEnterFullscreen();
                }
            }
        },
        togglePictureInPicture: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            return player.togglePictureInPicture!();
        },
        toggleAirPlay: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            return player.toggleAirPlay!();
        },
        getSubtitleStreamIndex: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;

            if (player && !enableLocalPlaylistManagement(player)) {
                return player.getSubtitleStreamIndex!();
            }

            if (!player) {
                throw new Error('player cannot be null');
            }

            return services.getPlayerData(player).subtitleStreamIndex;
        },
        getSecondarySubtitleStreamIndex: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;

            if (!player) {
                throw new Error('player cannot be null');
            }

            try {
                if (!enableLocalPlaylistManagement(player)) {
                    return player.getSecondarySubtitleStreamIndex!();
                }
            } catch (e) {
                console.error('[playbackmanager] Failed to get secondary stream index:', e);
            }

            return services.getPlayerData(player).secondarySubtitleStreamIndex;
        },
        setSubtitleStreamIndex: function (this: PlaybackContext, index: number, player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.setSubtitleStreamIndex!(index);
            }

            const currentStream = services.getCurrentSubtitleStream(player);

            const newStream = self.getSubtitleStream(player, index);

            if (!currentStream && !newStream) {
                return;
            }

            const selectedTrackElementIndex = selectSubtitleElement(player, index, currentStream, newStream, self.playMethod(player));

            player.setSubtitleStreamIndex!(selectedTrackElementIndex);

            // Also disable secondary subtitles when disabling the primary
            // subtitles, or if it doesn't support a secondary pair
            if (selectedTrackElementIndex === -1 || !self.trackHasSecondarySubtitleSupport(newStream)) {
                self.setSecondarySubtitleStreamIndex(-1);
            }

            services.getPlayerData(player).subtitleStreamIndex = index;
        },
        setSecondarySubtitleStreamIndex: function (index: number, player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            if (!self.playerHasSecondarySubtitleSupport(player)) return;
            if (player && !enableLocalPlaylistManagement(player)) {
                try {
                    return player.setSecondarySubtitleStreamIndex!(index);
                } catch (e) {
                    console.error('[playbackmanager] AutoSet - Failed to set secondary track:', e);
                }
            }

            const currentStream = services.getCurrentSubtitleStream(player, true);

            const newStream = self.getSubtitleStream(player, index);

            if (!currentStream && !newStream) {
                return;
            }

            // Secondary subtitles are currently only handled client side
            // Changes to the server code are required before we can handle other delivery methods
            if (newStream && !self.trackHasSecondarySubtitleSupport(newStream, player)) {
                return;
            }

            try {
                player.setSecondarySubtitleStreamIndex!(index);
                services.getPlayerData(player).secondarySubtitleStreamIndex = index;
            } catch (e) {
                console.error('[playbackmanager] AutoSet - Failed to set secondary track:', e);
            }
        },
        supportSubtitleOffset: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            return player && 'setSubtitleOffset' in player;
        },
        enableShowingSubtitleOffset: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            player.enableShowingSubtitleOffset!();
        },
        disableShowingSubtitleOffset: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            if (player.disableShowingSubtitleOffset) {
                player.disableShowingSubtitleOffset();
            }
        },
        isShowingSubtitleOffsetEnabled: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            return player.isShowingSubtitleOffsetEnabled!();
        },
        isSubtitleStreamExternal: function (index: number, player?: PlaybackPlayer | null) {
            const stream = self.getSubtitleStream(player, index);
            return stream ? getDeliveryMethod(stream) === 'External' : false;
        },
        setSubtitleOffset: function (value: number, player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            if (player.setSubtitleOffset) {
                player.setSubtitleOffset(value);
            }
        },
        getPlayerSubtitleOffset: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            if (player.getSubtitleOffset) {
                return player.getSubtitleOffset();
            }
        },
        canHandleOffsetOnCurrentSubtitle: function (player?: PlaybackPlayer | null) {
            const index = self.getSubtitleStreamIndex(player);
            return index !== -1 && self.isSubtitleStreamExternal(index!, player);
        },
        seek: function (ticks: number, player?: PlaybackPlayer | null) {
            ticks = Math.max(0, ticks);

            player = (player || self._currentPlayer)!;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.seek!(ticks);
            }

            void services.changeStream(player, ticks);
        },
        seekRelative: function (this: PlaybackContext, offsetTicks: number, player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            // Preserve the existing ES5 remote-player argument until that adapter is corrected.
            if (player && !enableLocalPlaylistManagement(player) && player.seekRelative) {
                return player.seekRelative(undefined);
            }

            const ticks = services.getCurrentTicks(player) + offsetTicks;
            return this.seek(ticks, player);
        }
    } };
}
