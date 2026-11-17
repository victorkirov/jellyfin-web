import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaStreamType } from '@jellyfin/sdk/lib/generated-client/models/media-stream-type';
import { SubtitleDeliveryMethod } from '@jellyfin/sdk/lib/generated-client/models/subtitle-delivery-method';
import { MediaType } from '@jellyfin/sdk/lib/generated-client/models/media-type';

import type { ApiClient } from 'jellyfin-apiclient';
import type { PlaybackMediaSource } from 'lib/playback/types';

import { createStreamInfo, getTextTracks } from './playbackStream';

const localItem = vi.hoisted(() => vi.fn(() => false));
vi.mock('../itemHelper', () => ({ default: { isLocalItem: localItem } }));
vi.mock('utils/jellyfin-apiclient/backdropImage', () => ({ getItemBackdropImageUrl: () => 'backdrop' }));
const clientMock = {
    getUrl: vi.fn((path: string, options?: object) => 'https://server/' + path + (options ? '?direct=true' : '')),
    deviceId: () => 'tv', accessToken: () => 'token'
};
// The backdrop lookup is mocked; this fixture supplies only stream URL operations.
const client = clientMock as unknown as ApiClient;
const item = { Id: 'item', Name: 'Film', MediaType: MediaType.Video };
const source: PlaybackMediaSource = { Id: 'source', Container: 'mkv', MediaStreams: [] };
beforeEach(() => {
    clientMock.getUrl.mockClear();
    localItem.mockReturnValue(false);
});

describe('stream construction extraction', () => {
    it.each([true, false])('preserves direct play or stream options, direct play=%s', supportsDirectPlay => {
        const info = createStreamInfo(client, 'Video', item, {
            ...source, SupportsDirectPlay: supportsDirectPlay, SupportsDirectStream: true, ETag: 'etag', LiveStreamId: 'live'
        }, 125_000_000, {});
        expect(client.getUrl).toHaveBeenCalledWith('Videos/item/stream.mkv', {
            Static: true, mediaSourceId: 'source', deviceId: 'tv', ApiKey: 'token', Tag: 'etag', LiveStreamId: 'live'
        });
        expect(info).toMatchObject({
            playMethod: supportsDirectPlay ? 'DirectPlay' : 'DirectStream',
            mimeType: 'video/x-matroska', playerStartPositionTicks: 125_000_000, transcodingOffsetTicks: 0,
            backdropUrl: 'backdrop', item, title: 'Film'
        });
        expect(info.textTracks).toEqual([]);
        expect(info.textTracks).not.toBe(info.tracks);
    });

    it.each([
        ['hls', 'video?playSessionId=session', 'application/x-mpegURL', 0],
        ['http', 'video?playSessionId=session', 'video/mp4', 125_000_000],
        ['http', 'video?copytimestamps=true&playSessionId=session', 'video/mp4', 0]
    ] as const)('preserves %s timestamp and MIME boundaries for %s', (protocol, url, mimeType, offsetTicks) => {
        const info = createStreamInfo(client, 'Video', item, {
            ...source, SupportsTranscoding: true, TranscodingUrl: url, TranscodingSubProtocol: protocol, TranscodingContainer: 'mp4'
        }, 125_000_000, {});
        expect(info).toMatchObject({ playMethod: 'Transcode', mimeType, transcodingOffsetTicks: offsetTicks, playSessionId: 'session' });
    });

    it('preserves preset audio URLs and native direct paths', () => {
        expect(createStreamInfo(client, 'Audio', item, { ...source, StreamUrl: 'https://audio/stream' }, 0, {}).url).toBe('https://audio/stream');
        expect(createStreamInfo(client, 'Video', item, { ...source, enableDirectPlay: true, Path: 'file:///film.mkv' }, 0, {}).url).toBe('file:///film.mkv');
    });

    it('normalizes requested full subtitle URLs and keeps track defaults', () => {
        const mediaSource = { ...source, enableDirectPlay: true, Path: 'film.mp4', DefaultSubtitleStreamIndex: 2, MediaStreams: [
            { Type: MediaStreamType.Subtitle, DeliveryMethod: SubtitleDeliveryMethod.External, DeliveryUrl: '/subtitle.srt', Index: 2, Codec: 'srt' }
        ] };
        const info = createStreamInfo(client, 'Video', item, mediaSource, 0, { useFullSubtitleUrls: true });
        expect(mediaSource.MediaStreams[0].DeliveryUrl).toBe('https://server//subtitle.srt');
        expect(info.textTracks).toEqual([{ url: 'https://server/https://server//subtitle.srt', language: 'und', isDefault: true, index: 2, format: 'srt' }]);
    });

    it('uses paths for local subtitles and preserves external URLs', () => {
        const mediaSource = { ...source, MediaStreams: [{ Type: MediaStreamType.Subtitle, DeliveryMethod: SubtitleDeliveryMethod.External, Path: 'file:///sub.srt', DeliveryUrl: 'https://cdn/sub.srt', IsExternalUrl: true }] };
        expect(getTextTracks(client, item, mediaSource)[0].url).toBe('https://cdn/sub.srt');
        localItem.mockReturnValue(true);
        expect(getTextTracks(client, item, mediaSource)[0].url).toBe('file:///sub.srt');
    });
});
