import { hideAll } from './common';
import { type UserDto } from '@jellyfin/sdk/lib/generated-client';
import { type ItemDto } from 'types/base/models/item-dto';
import { playbackManager } from 'components/playback/playbackmanager';
import { type DetailsPage, getElement, queryAll } from './types';

import itemHelper from 'components/itemHelper';
import globalize from 'lib/globalize';
import datetime from 'scripts/datetime';

export function getContextMenuOptions(item: ItemDto, user: UserDto, button: HTMLElement | undefined = undefined) {
    return {
        item: item,
        open: false,
        play: false,
        playAllFromHere: false,
        queueAllFromHere: false,
        positionTo: button,
        shuffle: false,
        instantMix: false,
        user: user
    };
}

export function reloadPlayButtons(page: DetailsPage, item: ItemDto, nextUpEpisode?: ItemDto) {
    let canPlay = false;

    if (item.Type == 'Program') {
        const now = new Date();

        if (now >= datetime.parseISO8601Date(item.StartDate, true) && now < datetime.parseISO8601Date(item.EndDate, true)) {
            hideAll(page, 'btnPlay', true);
            canPlay = true;
        } else {
            hideAll(page, 'btnPlay');
        }

        hideAll(page, 'btnReplay');
        hideAll(page, 'btnInstantMix');
        hideAll(page, 'btnShuffle');
    } else if (playbackManager.canPlay(item)) {
        hideAll(page, 'btnPlay', true);
        const enableInstantMix = ['Audio', 'MusicAlbum', 'MusicGenre', 'MusicArtist'].indexOf(item.Type!) !== -1;
        hideAll(page, 'btnInstantMix', enableInstantMix);
        const enableShuffle = item.IsFolder || ['MusicAlbum', 'MusicGenre', 'MusicArtist'].indexOf(item.Type!) !== -1;
        hideAll(page, 'btnShuffle', enableShuffle);
        canPlay = true;

        const isResumable = (item.UserData?.PlaybackPositionTicks || 0) > 0;
        hideAll(page, 'btnReplay', isResumable);
    } else {
        hideAll(page, 'btnPlay');
        hideAll(page, 'btnReplay');
        hideAll(page, 'btnInstantMix');
        hideAll(page, 'btnShuffle');
    }

    const positionTicks = item.Type === 'Program' ? 0 : (item.UserData?.PlaybackPositionTicks || 0);
    const episodeLabel = nextUpEpisode ? ' S' + nextUpEpisode.ParentIndexNumber + ':E' + nextUpEpisode.IndexNumber : '';
    const label = positionTicks > 0 ?
        globalize.translate('ResumeAt', datetime.getDisplayRunningTime(positionTicks)) :
        globalize.translate('Play') + episodeLabel;
    for (const btnPlay of queryAll(page, '.btnPlay')) {
        btnPlay.title = label;
        getElement(btnPlay, '.detailButton-text').textContent = label;
    }

    return canPlay;
}

export function reloadUserDataButtons(page: DetailsPage, item: ItemDto) {
    let i;
    let length;
    const btnPlaystates = queryAll(page, '.btnPlaystate');

    for (i = 0, length = btnPlaystates.length; i < length; i++) {
        const btnPlaystate = btnPlaystates[i];

        if (itemHelper.canMarkPlayed(item)) {
            btnPlaystate.classList.remove('hide');
            btnPlaystate.setItem(item);
        } else {
            btnPlaystate.classList.add('hide');
            btnPlaystate.setItem(null);
        }
    }

    const btnUserRatings = queryAll(page, '.btnUserRating');

    for (i = 0, length = btnUserRatings.length; i < length; i++) {
        const btnUserRating = btnUserRatings[i];

        if (itemHelper.canRate(item)) {
            btnUserRating.classList.remove('hide');
            btnUserRating.setItem(item);
        } else {
            btnUserRating.classList.add('hide');
            btnUserRating.setItem(null);
        }
    }
}

export function setTrailerButtonVisibility(page: DetailsPage, item: ItemDto) {
    if ((item.LocalTrailerCount || (item.RemoteTrailers?.length || 0)) && playbackManager.getSupportedCommands()!.indexOf('PlayTrailers') !== -1) {
        hideAll(page, 'btnPlayTrailer', true);
    } else {
        hideAll(page, 'btnPlayTrailer');
    }
}
