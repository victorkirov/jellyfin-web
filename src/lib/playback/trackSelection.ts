import type { MediaStream } from '@jellyfin/sdk/lib/generated-client/models/media-stream';
import type { PlaybackMediaSource, TrackSelection } from './types';

function setTrackIndex(options: TrackSelection, streamType: string, index: number, secondary?: boolean) {
    if (streamType === 'Subtitle') {
        if (secondary) options.DefaultSecondarySubtitleStreamIndex = index;
        else options.DefaultSubtitleStreamIndex = index;
    }
    if (streamType === 'Audio') options.DefaultAudioStreamIndex = index;
}

function relativeStreamIndex(streams: MediaStream[], streamType: string, index: number) {
    let relativeIndex = 0;
    for (const stream of streams) {
        if (stream.Type !== streamType) continue;
        if (stream.Index === index) break;
        relativeIndex++;
    }
    return relativeIndex;
}

function scoreStream(previous: MediaStream, stream: MediaStream, previousRelativeIndex: number, relativeIndex: number) {
    let score = 0;
    if (previous.Codec == stream.Codec) score++;
    if (previousRelativeIndex === relativeIndex) score++;
    if (previous.DisplayTitle && previous.DisplayTitle == stream.DisplayTitle) score += 2;
    if (previous.Language && previous.Language !== 'und' && previous.Language == stream.Language) score += 2;
    return score;
}

function findMatchingStream(previous: MediaStream, streams: MediaStream[], streamType: string, previousRelativeIndex: number) {
    let bestIndex: number | undefined;
    let bestScore = 0;
    let relativeIndex = 0;
    for (const stream of streams) {
        if (stream.Type !== streamType) continue;
        const score = scoreStream(previous, stream, previousRelativeIndex, relativeIndex);
        console.debug(`AutoSet ${streamType} - Score ${score} for ${stream.Index} - ${stream.DisplayTitle}`);
        if (score > bestScore && score >= 3) {
            bestScore = score;
            bestIndex = stream.Index;
        }
        relativeIndex++;
    }
    return { index: bestIndex, score: bestScore };
}

export function rankStreamType(prevIndex: number, prevSource: PlaybackMediaSource | null | undefined, mediaStreams: MediaStream[] | null | undefined, trackOptions: TrackSelection, streamType: string, isSecondarySubtitle?: boolean) {
    if (prevIndex === -1) {
        console.debug(`AutoSet ${streamType} - No Stream Set`);
        if (streamType === 'Subtitle') setTrackIndex(trackOptions, streamType, -1, isSecondarySubtitle);
        return;
    }
    if (!prevSource!.MediaStreams || !mediaStreams) {
        console.debug(`AutoSet ${streamType} - No MediaStreams`);
        return;
    }
    const previous = prevSource!.MediaStreams[prevIndex];
    if (!previous) {
        console.debug(`AutoSet ${streamType} - No prevStream`);
        return;
    }
    console.debug(`AutoSet ${streamType} - Previous was ${previous.Index} - ${previous.DisplayTitle}`);
    const relativeIndex = relativeStreamIndex(prevSource!.MediaStreams, streamType, prevIndex);
    const best = findMatchingStream(previous, mediaStreams, streamType, relativeIndex);
    if (best.index != null) {
        console.debug(`AutoSet ${streamType} - Using ${best.index} score ${best.score}.`);
        setTrackIndex(trackOptions, streamType, best.index, isSecondarySubtitle);
    } else {
        console.debug(`AutoSet ${streamType} - Threshold not met. Using default.`);
    }
}

export function autoSetNextTracks(prevSource: PlaybackMediaSource | null | undefined, mediaStreams: MediaStream[] | null | undefined, trackOptions: TrackSelection, audio: boolean | undefined, subtitle: boolean | undefined) {
    try {
        if (!prevSource) return;
        if (!mediaStreams) {
            console.warn('AutoSet - No mediaStreams');
            return;
        }
        if (audio && typeof prevSource.DefaultAudioStreamIndex === 'number') {
            rankStreamType(prevSource.DefaultAudioStreamIndex, prevSource, mediaStreams, trackOptions, 'Audio');
        }
        if (subtitle && typeof prevSource.DefaultSubtitleStreamIndex === 'number') {
            rankStreamType(prevSource.DefaultSubtitleStreamIndex, prevSource, mediaStreams, trackOptions, 'Subtitle');
        }
        if (subtitle && typeof prevSource.DefaultSecondarySubtitleStreamIndex === 'number') {
            rankStreamType(prevSource.DefaultSecondarySubtitleStreamIndex, prevSource, mediaStreams, trackOptions, 'Subtitle', true);
        }
    } catch (error) {
        console.error(`AutoSet - Caught unexpected error: ${error}`);
    }
}
