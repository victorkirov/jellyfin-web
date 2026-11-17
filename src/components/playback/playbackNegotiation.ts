import { createPlaybackRequest } from 'lib/playback/playbackRequest';
import { PlaybackErrorCode } from '@jellyfin/sdk/lib/generated-client/models/playback-error-code';
import type { PlaybackInfoDto } from '@jellyfin/sdk/lib/generated-client/models/playback-info-dto';
import type { PlaybackInfoResponse } from '@jellyfin/sdk/lib/generated-client/models/playback-info-response';
import type { TranscodingProfile } from '@jellyfin/sdk/lib/generated-client/models/transcoding-profile';
import { getMediaInfoApi } from '@jellyfin/sdk/lib/utils/api/media-info-api';
import { AppFeature } from 'constants/appFeature';
import type { ApiClient as PlaybackApiClient } from 'jellyfin-apiclient';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import type { PlaybackDeviceProfile, PlaybackItem, PlaybackMediaSource, PlaybackOptions } from 'lib/playback/types';
import type { PlaybackPlayer } from 'types/plugin';
import globalize from '../../lib/globalize';
import appSettings from '../../scripts/settings/appSettings';
import alert from '../alert';
import { appHost } from '../apphost';
import itemHelper from '../itemHelper';
import type { PlaybackContext } from './playbackContext';

export function getAudioMaxValues(deviceProfile: PlaybackDeviceProfile) {
// TODO - this could vary per codec and should be done on the server using the entire profile
    let maxAudioSampleRate = null;
    let maxAudioBitDepth = null;
    let maxAudioBitrate = null;

    deviceProfile.CodecProfiles!.forEach(codecProfile => {
        if (codecProfile.Type === 'Audio') {
            (codecProfile.Conditions || []).forEach(condition => {
                if (condition.Condition === 'LessThanEqual' && condition.Property === 'AudioBitDepth') {
                    maxAudioBitDepth = condition.Value;
                } else if (condition.Condition === 'LessThanEqual' && condition.Property === 'AudioSampleRate') {
                    maxAudioSampleRate = condition.Value;
                } else if (condition.Condition === 'LessThanEqual' && condition.Property === 'AudioBitrate') {
                    maxAudioBitrate = condition.Value;
                }
            });
        }
    });

    return {
        maxAudioSampleRate: maxAudioSampleRate,
        maxAudioBitDepth: maxAudioBitDepth,
        maxAudioBitrate: maxAudioBitrate
    };
}

export let startingPlaySession = new Date().getTime();

export function getAudioStreamUrl(item: PlaybackItem, transcodingProfile: TranscodingProfile, directPlayContainers: string, apiClient: PlaybackApiClient, startPosition: number | undefined, maxValues: { maxAudioBitrate?: string | null; maxBitrate?: number; maxAudioSampleRate?: string | null; maxAudioBitDepth?: string | null }) {
    const url = 'Audio/' + item.Id + '/universal';

    startingPlaySession++;
    return apiClient.getUrl(url, {
        UserId: apiClient.getCurrentUserId(),
        DeviceId: apiClient.deviceId(),
        MaxStreamingBitrate: maxValues.maxAudioBitrate || maxValues.maxBitrate,
        Container: directPlayContainers,
        TranscodingContainer: transcodingProfile.Container || null,
        TranscodingProtocol: transcodingProfile.Protocol || null,
        AudioCodec: transcodingProfile.AudioCodec,
        MaxAudioSampleRate: maxValues.maxAudioSampleRate,
        MaxAudioBitDepth: maxValues.maxAudioBitDepth,
        ApiKey: apiClient.accessToken(),
        PlaySessionId: startingPlaySession,
        StartTimeTicks: startPosition || 0,
        EnableRedirection: true,
        EnableRemoteMedia: appHost.supports(AppFeature.RemoteAudio),
        EnableAudioVbrEncoding: transcodingProfile.EnableAudioVbrEncoding
    });
}

export function getAudioStreamUrlFromDeviceProfile(item: PlaybackItem, deviceProfile: PlaybackDeviceProfile, maxBitrate: number | undefined, apiClient: PlaybackApiClient, startPosition: number | undefined) {
    const transcodingProfile = deviceProfile.TranscodingProfiles!.filter(function (p) {
        return p.Type === 'Audio' && p.Context === 'Streaming';
    })[0];

    let directPlayContainers = '';

    deviceProfile.DirectPlayProfiles!.forEach(p => {
        if (p.Type === 'Audio') {
            if (directPlayContainers) {
                directPlayContainers += ',' + p.Container;
            } else {
                directPlayContainers = p.Container!;
            }

            if (p.AudioCodec) {
                directPlayContainers += '|' + p.AudioCodec;
            }
        }
    });

    const maxValues = getAudioMaxValues(deviceProfile);

    return getAudioStreamUrl(item, transcodingProfile, directPlayContainers, apiClient, startPosition, { maxBitrate, ...maxValues });
}

export function getStreamUrls(items: PlaybackItem[], deviceProfile: PlaybackDeviceProfile, maxBitrate: number | undefined, apiClient: PlaybackApiClient, startPosition: number | undefined) {
    const audioTranscodingProfile = deviceProfile.TranscodingProfiles!.filter(function (p) {
        return p.Type === 'Audio' && p.Context === 'Streaming';
    })[0];

    let audioDirectPlayContainers = '';

    deviceProfile.DirectPlayProfiles!.forEach(p => {
        if (p.Type === 'Audio') {
            if (audioDirectPlayContainers) {
                audioDirectPlayContainers += ',' + p.Container;
            } else {
                audioDirectPlayContainers = p.Container!;
            }

            if (p.AudioCodec) {
                audioDirectPlayContainers += '|' + p.AudioCodec;
            }
        }
    });

    const maxValues = getAudioMaxValues(deviceProfile);

    const streamUrls = [];

    for (let i = 0, length = items.length; i < length; i++) {
        const item = items[i];
        let streamUrl;

        if (item.MediaType === 'Audio' && !itemHelper.isLocalItem(item)) {
            streamUrl = getAudioStreamUrl(item, audioTranscodingProfile, audioDirectPlayContainers, apiClient, startPosition, { maxBitrate, ...maxValues });
        }

        streamUrls.push(streamUrl || '');

        if (i === 0) {
            startPosition = 0;
        }
    }

    return Promise.resolve(streamUrls);
}

export function setStreamUrls(items: PlaybackItem[], deviceProfile: PlaybackDeviceProfile, maxBitrate: number | undefined, apiClient: PlaybackApiClient, startPosition: number | undefined) {
    return getStreamUrls(items, deviceProfile, maxBitrate, apiClient, startPosition).then(function (streamUrls) {
        for (let i = 0, length = items.length; i < length; i++) {
            const item = items[i];
            const streamUrl = streamUrls[i];

            if (streamUrl) {
                item.PresetMediaSource = {
                    StreamUrl: streamUrl,
                    Id: item.Id,
                    MediaStreams: [],
                    RunTimeTicks: item.RunTimeTicks
                };
            }
        }
    });
}

export async function getPlaybackInfo(player: PlaybackPlayer, apiClient: PlaybackApiClient, item: PlaybackItem, deviceProfile: PlaybackDeviceProfile, mediaSourceId: string | null | undefined, liveStreamId: string | null | undefined, options: PlaybackOptions): Promise<PlaybackInfoResponse & { MediaSources?: PlaybackMediaSource[] }> {
    if (!itemHelper.isLocalItem(item) && item.MediaType === 'Audio' && !player.useServerPlaybackInfoForAudio) {
        return {
            MediaSources: [
                {
                    StreamUrl: getAudioStreamUrlFromDeviceProfile(item, deviceProfile, options.maxBitrate, apiClient, options.startPosition),
                    Id: item.Id,
                    MediaStreams: [],
                    RunTimeTicks: item.RunTimeTicks
                }]
        };
    }

    if (item.PresetMediaSource) {
        return {
            MediaSources: [item.PresetMediaSource]
        };
    }

    const itemId = item.Id;

    const query = createPlaybackRequest(apiClient.getCurrentUserId(), options, mediaSourceId, liveStreamId);

    const api = ServerConnections.getApi(apiClient.serverId());

    if (player.enableMediaProbe && !player.enableMediaProbe(item)) {
        query.EnableMediaProbe = false;
    }

    // lastly, enforce player overrides for special situations
    if (query.EnableDirectStream !== false
    && player.supportsPlayMethod && !player.supportsPlayMethod('DirectStream', item)
    ) {
        query.EnableDirectStream = false;
    }

    if (player.getDirectPlayProtocols) {
        query.DirectPlayProtocols = player.getDirectPlayProtocols();
    }

    query.AlwaysBurnInSubtitleWhenTranscoding = appSettings.alwaysBurnInSubtitleWhenTranscoding();

    query.DeviceProfile = deviceProfile;

    const res = await getMediaInfoApi(api!).getPostedPlaybackInfo({ itemId: itemId!, playbackInfoDto: query });
    return res.data;
}

export function getOptimalMediaSource(apiClient: PlaybackApiClient, item: PlaybackItem, versions: PlaybackMediaSource[]) {
    const promises = versions.map(function (v) {
        return supportsDirectPlay(apiClient, item, v);
    });

    if (!promises.length) {
        return Promise.reject();
    }

    return Promise.all(promises).then(function (results) {
        for (let i = 0, length = versions.length; i < length; i++) {
            versions[i].enableDirectPlay = results[i] || false;
        }

        // Prefer the played item's own source, transcoding it if needed, over another version
        const ownSource = versions.find(v => v.Id === item.Id);

        if (ownSource && (ownSource.enableDirectPlay || ownSource.SupportsDirectStream || ownSource.SupportsTranscoding)) {
            return ownSource;
        }

        let optimalVersion = versions.filter(function (v) {
            return v.enableDirectPlay;
        })[0];

        if (!optimalVersion) {
            optimalVersion = versions.filter(function (v) {
                return v.SupportsDirectStream;
            })[0];
        }

        optimalVersion = optimalVersion || versions.filter(function (s) {
            return s.SupportsTranscoding;
        })[0];

        return optimalVersion || versions[0];
    });
}

export function getLiveStream(player: PlaybackPlayer, apiClient: PlaybackApiClient, item: PlaybackItem, playSessionId: string | null | undefined, deviceProfile: PlaybackDeviceProfile, mediaSource: PlaybackMediaSource, options: PlaybackOptions) {
    const postData = {
        DeviceProfile: deviceProfile,
        OpenToken: mediaSource.OpenToken
    };

    const query: PlaybackInfoDto & { SecondarySubtitleStreamIndex?: number | null; IsPlayback?: boolean; EnableMediaProbe?: boolean; DirectPlayProtocols?: string[]; ItemId?: string | null; PlaySessionId?: string | null } = {
        UserId: apiClient.getCurrentUserId(),
        StartTimeTicks: options.startPosition || 0,
        ItemId: item.Id,
        PlaySessionId: playSessionId
    };

    if (options.maxBitrate) {
        query.MaxStreamingBitrate = options.maxBitrate;
    }
    if (options.audioStreamIndex != null) {
        query.AudioStreamIndex = options.audioStreamIndex;
    }
    if (options.subtitleStreamIndex != null) {
        query.SubtitleStreamIndex = options.subtitleStreamIndex;
    }

    // lastly, enforce player overrides for special situations
    if (query.EnableDirectStream !== false
    && player.supportsPlayMethod && !player.supportsPlayMethod('DirectStream', item)
    ) {
        query.EnableDirectStream = false;
    }

    return apiClient.ajax({
        url: apiClient.getUrl('LiveStreams/Open', query),
        type: 'POST',
        data: JSON.stringify(postData),
        contentType: 'application/json',
        dataType: 'json'

    });
}

export function isHostReachable(mediaSource: PlaybackMediaSource, apiClient: PlaybackApiClient) {
    if (mediaSource.IsRemote) {
        return Promise.resolve(true);
    }

    return apiClient.getEndpointInfo().then(function (endpointInfo) {
        if (endpointInfo.IsInNetwork) {
            if (!endpointInfo.IsLocal) {
                const path = (mediaSource.Path || '').toLowerCase();
                if (path.indexOf('localhost') !== -1 || path.indexOf('127.0.0.1') !== -1) {
                // This will only work if the app is on the same machine as the server
                    return Promise.resolve(false);
                }
            }

            return Promise.resolve(true);
        }

        // media source is in network, but connection is out of network
        return Promise.resolve(false);
    });
}

export function supportsDirectPlay(apiClient: PlaybackApiClient, item: PlaybackItem, mediaSource: PlaybackMediaSource) {
// folder rip hacks due to not yet being supported by the stream building engine
    const isFolderRip = mediaSource.VideoType === 'BluRay' || mediaSource.VideoType === 'Dvd' || (mediaSource.VideoType as string) === 'HdDvd';

    if (mediaSource.SupportsDirectPlay || isFolderRip) {
        if (mediaSource.IsRemote && !appHost.supports(AppFeature.RemoteVideo)) {
            return Promise.resolve(false);
        }

        if (mediaSource.Protocol === 'Http' && !mediaSource.RequiredHttpHeaders!.length) {
        // If this is the only way it can be played, then allow it
            if (!mediaSource.SupportsDirectStream && !mediaSource.SupportsTranscoding) {
                return Promise.resolve(true);
            } else {
                return isHostReachable(mediaSource, apiClient);
            }
        }
    }

    return Promise.resolve(false);
}

export function validatePlaybackInfoResult(instance: PlaybackContext, result: PlaybackInfoResponse) {
    if (result.ErrorCode) {
    // NOTE: To avoid needing to retranslate the "NoCompatibleStream" message,
    // we need to keep the key in the same format.
        const errMessage = result.ErrorCode === PlaybackErrorCode.NoCompatibleStream ?
            'PlaybackErrorNoCompatibleStream' : `PlaybackError.${result.ErrorCode}`;
        showPlaybackInfoErrorMessage(instance, errMessage);
        return false;
    }

    return true;
}

export function showPlaybackInfoErrorMessage(instance: PlaybackContext, errorCode: string) {
    void alert({
        text: globalize.translate(errorCode),
        title: globalize.translate('HeaderPlaybackError')
    });
}
