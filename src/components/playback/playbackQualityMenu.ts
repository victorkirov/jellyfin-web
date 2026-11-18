import type { PlaybackPlayer } from 'types/plugin';
import actionsheet from '../actionSheet/actionSheet';
import { playbackManager } from './playbackmanager';
import qualityoptions from '../qualityOptions';

type QualityOption = { name: string; bitrate: number; secondaryText?: string; selected?: boolean; autoText?: string };
type MenuItem = Parameters<typeof actionsheet.show>[0]['items'][number];

export function showQualityMenu(player: PlaybackPlayer, btn?: Element | null) {
    const videoStream = playbackManager.currentMediaSource(player)!.MediaStreams!.filter(function (stream) {
        return stream.Type === 'Video';
    })[0];

    const videoCodec = videoStream ? videoStream.Codec : null;
    const videoBitRate = videoStream ? videoStream.BitRate : null;

    const options: QualityOption[] = qualityoptions.getVideoQualityOptions({
        currentMaxBitrate: playbackManager.getMaxStreamingBitrate(player),
        isAutomaticBitrateEnabled: playbackManager.enableAutomaticBitrateDetection(player),
        videoCodec,
        videoBitRate,
        enableAuto: true
    }) as QualityOption[];

    const menuItems = options.map(function (o) {
        const opt: MenuItem = {
            name: o.name,
            id: String(o.bitrate),
            asideText: o.secondaryText
        };

        if (o.selected) {
            opt.selected = true;
        }

        return opt;
    });

    const selectedId = options.filter(function (o) {
        return o.selected;
    });

    const selectedBitrate = selectedId.length ? selectedId[0].bitrate : null;

    return actionsheet.show({
        items: menuItems,
        positionTo: btn
    }).then(function (id) {
        const bitrate = parseInt(String(id), 10);
        if (bitrate !== selectedBitrate) {
            return playbackManager.setMaxStreamingBitrate({
                enableAutomaticBitrateDetection: !bitrate,
                maxBitrate: bitrate
            }, player);
        }
    });
}

export function getQualitySecondaryText(player: PlaybackPlayer) {
    const state = playbackManager.getPlayerState(player);

    const videoStream = playbackManager.currentMediaSource(player)!.MediaStreams!.filter(function (stream) {
        return stream.Type === 'Video';
    })[0];

    const videoCodec = videoStream ? videoStream.Codec : null;
    const videoBitRate = videoStream ? videoStream.BitRate : null;
    const videoWidth = videoStream ? videoStream.Width : null;
    const videoHeight = videoStream ? videoStream.Height : null;

    const options: QualityOption[] = qualityoptions.getVideoQualityOptions({
        currentMaxBitrate: playbackManager.getMaxStreamingBitrate(player),
        isAutomaticBitrateEnabled: playbackManager.enableAutomaticBitrateDetection(player),
        videoCodec,
        videoBitRate,
        videoWidth: videoWidth,
        videoHeight: videoHeight,
        enableAuto: true
    }) as QualityOption[];

    const selectedOptions = options.filter(function (o) {
        return o.selected;
    });

    if (!selectedOptions.length) {
        return null;
    }

    const selectedOption = selectedOptions[0];
    let text = selectedOption.name;

    if (selectedOption.autoText) {
        if (state.PlayState && state.PlayState.PlayMethod !== 'Transcode') {
            text += ' - Direct';
        } else {
            text += ' ' + selectedOption.autoText;
        }
    }

    return text;
}

