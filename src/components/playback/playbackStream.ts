import type { MediaStream } from '@jellyfin/sdk/lib/generated-client/models/media-stream';
import type { ApiClient } from 'jellyfin-apiclient';
import type { PlaybackItem, PlaybackMediaSource, PlaybackStreamInfo } from 'lib/playback/types';
import { getMimeType, getParam } from 'lib/playback/streamFormat';
import type { PlaybackPlayer } from 'types/plugin';
import { getItemBackdropImageUrl } from 'utils/jellyfin-apiclient/backdropImage';

import itemHelper from '../itemHelper';

type MediaAddress = Pick<PlaybackStreamInfo, 'url' | 'mimeType' | 'playMethod' | 'transcodingOffsetTicks'>;

function directStreamUrl(apiClient: ApiClient, type: string, item: PlaybackItem, source: PlaybackMediaSource, container: string) {
    const options: Record<string, string | boolean | null | undefined> = {
        Static: true,
        mediaSourceId: source.Id,
        deviceId: apiClient.deviceId(),
        ApiKey: apiClient.accessToken()
    };
    if (source.ETag) options.Tag = source.ETag;
    if (source.LiveStreamId) options.LiveStreamId = source.LiveStreamId;
    const prefix = type === 'Video' ? 'Videos' : 'Audio';
    return apiClient.getUrl(prefix + '/' + item.Id + '/stream.' + container, options);
}

function transcodeAddress(apiClient: ApiClient, type: string, source: PlaybackMediaSource, startPosition?: number): MediaAddress {
    const url = apiClient.getUrl(source.TranscodingUrl!);
    if (source.TranscodingSubProtocol === 'hls') {
        return { url, mimeType: 'application/x-mpegURL', playMethod: 'Transcode', transcodingOffsetTicks: 0 };
    }
    return {
        url,
        mimeType: getMimeType(type.toLowerCase(), source.TranscodingContainer),
        playMethod: 'Transcode',
        transcodingOffsetTicks: url.toLowerCase().indexOf('copytimestamps=true') === -1 ? startPosition || 0 : 0
    };
}

function audioVideoAddress(apiClient: ApiClient, type: string, item: PlaybackItem, source: PlaybackMediaSource, startPosition?: number): MediaAddress {
    const container = (source.Container || '').toLowerCase();
    const mimeType = getMimeType(type.toLowerCase(), container);
    if (source.enableDirectPlay) return { url: source.Path, mimeType, playMethod: 'DirectPlay', transcodingOffsetTicks: 0 };
    if (source.StreamUrl) return { url: source.StreamUrl, mimeType, playMethod: 'Transcode', transcodingOffsetTicks: 0 };
    if (source.SupportsDirectPlay || source.SupportsDirectStream) {
        return {
            url: directStreamUrl(apiClient, type, item, source, container),
            mimeType,
            playMethod: source.SupportsDirectPlay ? 'DirectPlay' : 'DirectStream',
            transcodingOffsetTicks: 0
        };
    }
    if (source.SupportsTranscoding) return transcodeAddress(apiClient, type, source, startPosition);
    return { mimeType, playMethod: 'Transcode', transcodingOffsetTicks: 0 };
}

function useFullSubtitleUrls(apiClient: ApiClient, source: PlaybackMediaSource) {
    source.MediaStreams?.forEach(stream => {
        if (stream.DeliveryUrl?.startsWith('/')) stream.DeliveryUrl = apiClient.getUrl(stream.DeliveryUrl);
    });
}

function subtitleUrl(apiClient: ApiClient, item: PlaybackItem, stream: MediaStream) {
    if (itemHelper.isLocalItem(item)) return stream.Path;
    return !stream.IsExternalUrl ? apiClient.getUrl(stream.DeliveryUrl!) : stream.DeliveryUrl;
}

export function getTextTracks(apiClient: ApiClient, item: PlaybackItem, source: PlaybackMediaSource) {
    return source.MediaStreams!.filter(stream => stream.Type === 'Subtitle')
        .filter(stream => stream.DeliveryMethod === 'External')
        .map(stream => ({
            url: subtitleUrl(apiClient, item, stream),
            language: stream.Language || 'und',
            isDefault: stream.Index === source.DefaultSubtitleStreamIndex,
            index: stream.Index,
            format: stream.Codec
        }));
}

export function createStreamInfo(apiClient: ApiClient, type: string, item: PlaybackItem, source: PlaybackMediaSource, startPosition: number | undefined, player: Pick<PlaybackPlayer, 'useFullSubtitleUrls'>) {
    if (source.MediaStreams && player.useFullSubtitleUrls) useFullSubtitleUrls(apiClient, source);
    const address = type === 'Video' || type === 'Audio' ?
        audioVideoAddress(apiClient, type, item, source, startPosition) :
        { url: source.Path, mimeType: undefined, playMethod: 'DirectPlay', transcodingOffsetTicks: 0 };
    if (!address.url && source.SupportsDirectPlay) {
        address.url = source.Path;
        address.playMethod = 'DirectPlay';
    }
    const info: PlaybackStreamInfo = {
        url: address.url,
        mimeType: address.mimeType,
        transcodingOffsetTicks: address.transcodingOffsetTicks,
        playMethod: address.playMethod,
        playerStartPositionTicks: startPosition,
        item,
        mediaSource: source,
        textTracks: getTextTracks(apiClient, item, source),
        tracks: getTextTracks(apiClient, item, source),
        mediaType: type,
        liveStreamId: source.LiveStreamId!,
        playSessionId: getParam('playSessionId', address.url!),
        title: item.Name
    };
    const backdropUrl = getItemBackdropImageUrl(apiClient, item, {}, true);
    if (backdropUrl) info.backdropUrl = backdropUrl;
    return info;
}
