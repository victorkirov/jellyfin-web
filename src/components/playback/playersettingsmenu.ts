import actionsheet from '../actionSheet/actionSheet';
import { playbackManager } from '../playback/playbackmanager';
import globalize from 'lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import type { PlaybackPlayer } from 'types/plugin';
import type { UserDto } from '@jellyfin/sdk/lib/generated-client';
import { getQualitySecondaryText, showQualityMenu } from './playbackQualityMenu';

type SettingsMenuOptions = {
    player: PlaybackPlayer;
    positionTo?: Element | null;
    quality?: boolean | null;
    stats?: boolean;
    suboffset?: boolean;
    mediaType?: string;
    onOption?: (id: string) => void;
};
type MenuItem = Parameters<typeof actionsheet.show>[0]['items'][number];

function showRepeatModeMenu(player: PlaybackPlayer, btn?: Element | null) {
    const menuItems: MenuItem[] = [];
    const currentValue = playbackManager.getRepeatMode(player);

    menuItems.push({
        name: globalize.translate('RepeatAll'),
        id: 'RepeatAll',
        selected: currentValue === 'RepeatAll'
    });

    menuItems.push({
        name: globalize.translate('RepeatOne'),
        id: 'RepeatOne',
        selected: currentValue === 'RepeatOne'
    });

    menuItems.push({
        name: globalize.translate('None'),
        id: 'RepeatNone',
        selected: currentValue === 'RepeatNone'
    });

    return actionsheet.show({
        items: menuItems,
        positionTo: btn
    }).then(function (mode) {
        if (mode) {
            playbackManager.setRepeatMode(String(mode), player);
        }
    });
}

function showAspectRatioMenu(player: PlaybackPlayer, btn?: Element | null) {
    // each has a name and id
    const currentId = playbackManager.getAspectRatio(player);
    const menuItems = playbackManager.getSupportedAspectRatios(player)
        .map(({ id, name }) => ({
            id,
            name,
            selected: id === currentId
        }));

    return actionsheet.show({
        items: menuItems,
        positionTo: btn
    }).then(function (id) {
        if (id) {
            playbackManager.setAspectRatio(String(id), player);
            return Promise.resolve();
        }

        return Promise.reject();
    });
}

function showPlaybackRateMenu(player: PlaybackPlayer, btn?: Element | null) {
    // each has a name and id
    const currentId = playbackManager.getPlaybackRate(player);
    const menuItems = playbackManager.getSupportedPlaybackRates(player).map(i => ({
        id: String(i.id),
        name: i.name,
        selected: i.id === currentId
    }));

    return actionsheet.show({
        items: menuItems,
        positionTo: btn
    }).then(function (id) {
        if (id) {
            playbackManager.setPlaybackRate(Number(id), player);
            return Promise.resolve();
        }

        return Promise.reject();
    });
}

function showWithUser(options: SettingsMenuOptions, player: PlaybackPlayer, user: UserDto | null) {
    const supportedCommands = playbackManager.getSupportedCommands(player) || [];

    const menuItems: MenuItem[] = [];
    if (supportedCommands.indexOf('SetAspectRatio') !== -1) {
        const currentAspectRatioId = playbackManager.getAspectRatio(player);
        const currentAspectRatio = playbackManager.getSupportedAspectRatios(player).filter(function (i) {
            return i.id === currentAspectRatioId;
        })[0];

        menuItems.push({
            name: globalize.translate('AspectRatio'),
            id: 'aspectratio',
            asideText: currentAspectRatio ? currentAspectRatio.name : undefined
        });
    }

    if (supportedCommands.indexOf('PlaybackRate') !== -1) {
        const currentPlaybackRateId = playbackManager.getPlaybackRate(player);
        const currentPlaybackRate = playbackManager.getSupportedPlaybackRates(player).filter(i => i.id === currentPlaybackRateId)[0];

        menuItems.push({
            name: globalize.translate('PlaybackRate'),
            id: 'playbackrate',
            asideText: currentPlaybackRate ? currentPlaybackRate.name : undefined
        });
    }

    if (options.quality && supportedCommands.includes('SetMaxStreamingBitrate')
            && user?.Policy?.EnableVideoPlaybackTranscoding) {
        const secondaryQualityText = getQualitySecondaryText(player);

        menuItems.push({
            name: globalize.translate('Quality'),
            id: 'quality',
            asideText: secondaryQualityText || undefined
        });
    }

    const repeatMode = playbackManager.getRepeatMode(player);

    if (supportedCommands.indexOf('SetRepeatMode') !== -1 && playbackManager.currentMediaSource(player)?.RunTimeTicks) {
        menuItems.push({
            name: globalize.translate('RepeatMode'),
            id: 'repeatmode',
            asideText: repeatMode === 'RepeatNone' ? globalize.translate('None') : globalize.translate('' + repeatMode)
        });
    }

    if (options.suboffset) {
        menuItems.push({
            name: globalize.translate('SubtitleOffset'),
            id: 'suboffset',
            asideText: undefined
        });
    }

    if (options.stats) {
        menuItems.push({
            name: globalize.translate('PlaybackData'),
            id: 'stats',
            asideText: undefined
        });
    }

    return actionsheet.show({
        items: menuItems,
        positionTo: options.positionTo
    }).then(function (id) {
        return handleSelectedOption(String(id), options, player);
    });
}

export function show(options: SettingsMenuOptions) {
    const player = options.player;
    const currentItem = playbackManager.currentItem(player);

    if (!currentItem?.ServerId) {
        return showWithUser(options, player, null);
    }

    const apiClient = ServerConnections.getApiClient(currentItem.ServerId);
    return apiClient!.getCurrentUser().then(function (user) {
        return showWithUser(options, player, user);
    });
}

function handleSelectedOption(id: string, options: SettingsMenuOptions, player: PlaybackPlayer) {
    switch (id) {
        case 'quality':
            return showQualityMenu(player, options.positionTo);
        case 'aspectratio':
            return showAspectRatioMenu(player, options.positionTo);
        case 'playbackrate':
            return showPlaybackRateMenu(player, options.positionTo);
        case 'repeatmode':
            return showRepeatModeMenu(player, options.positionTo);
        case 'stats':
            if (options.onOption) {
                options.onOption('stats');
            }
            return Promise.resolve();
        case 'suboffset':
            if (options.onOption) {
                options.onOption('suboffset');
            }
            return Promise.resolve();
        default:
            break;
    }

    return Promise.reject();
}

export default {
    show: show
};
