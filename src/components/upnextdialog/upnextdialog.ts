import { millisecondsToTicks, ticksToMilliseconds } from 'constants/time';
import { playbackManager } from '../playback/playbackmanager';
import Events from '../../utils/events';
import mediaInfo from '../mediainfo/mediainfo';
import layoutManager from '../../lib/layoutManager';
import focusManager from '../../lib/focusManager';
import globalize from '../../lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import itemHelper from '../itemHelper';

import './upnextdialog.scss';
import '../buttons/emby-button';
import '../../styles/flexstyles.scss';

import getHtml from './upNextMarkup';
import type { PlaybackItem } from 'lib/playback/types';
import type { PlaybackPlayer } from 'types/plugin';

type UpNextOptions = { parent: HTMLElement; player?: PlaybackPlayer; nextItem: PlaybackItem };

function setNextVideoText(this: UpNextDialog) {
    const elem = this.options!.parent;

    const secondsRemaining = Math.max(Math.round(getTimeRemainingMs(this) / 1000), 0);

    console.debug('up next seconds remaining: ' + secondsRemaining);

    const timeText = '<span class="upNextDialog-countdownText">' + globalize.translate('HeaderSecondsValue', secondsRemaining) + '</span>';

    let nextVideoText;
    if (this.itemType === 'Episode') {
        nextVideoText = this.showStaticNextText ?
            globalize.translate('HeaderNextEpisode') :
            globalize.translate('HeaderNextEpisodePlayingInValue', timeText);
    } else {
        nextVideoText = this.showStaticNextText ?
            globalize.translate('HeaderNextVideo') :
            globalize.translate('HeaderNextVideoPlayingInValue', timeText);
    }

    elem.querySelector<HTMLElement>('.upNextDialog-nextVideoText')!.innerHTML = nextVideoText;
}

function fillItem(this: UpNextDialog, item: PlaybackItem) {
    const elem = this.options!.parent;

    elem.querySelector<HTMLElement>('.upNextDialog-mediainfo')!.innerHTML = mediaInfo.getPrimaryMediaInfoHtml(item, {
        criticRating: true,
        originalAirDate: false,
        starRating: true,
        subtitles: false
    });

    let title = itemHelper.getDisplayName(item);
    if (item.SeriesName) {
        title = item.SeriesName + ' - ' + title;
    }

    elem.querySelector<HTMLElement>('.upNextDialog-title')!.innerText = title || '';

    this.itemType = item.Type;

    this.show();
}

function clearCountdownTextTimeout(instance: UpNextDialog) {
    if (instance._countdownTextTimeout) {
        clearInterval(instance._countdownTextTimeout);
        instance._countdownTextTimeout = null;
    }
}

async function onStartNowClick(this: UpNextDialog) {
    const options = this.options;

    if (options) {
        const player = options.player;

        await this.hide();

        playbackManager.nextTrack(player);
    }
}

function init(instance: UpNextDialog, options: UpNextOptions) {
    void showStaticNextText(options.nextItem).then(value => {
        instance.showStaticNextText = value;

        options.parent.innerHTML = getHtml();

        options.parent.classList.add('hide');
        options.parent.classList.add('upNextDialog');
        options.parent.classList.add('upNextDialog-hidden');

        fillItem.call(instance, options.nextItem);

        options.parent.querySelector<HTMLElement>('.btnHide')!.addEventListener('click', instance.hide.bind(instance));
        options.parent.querySelector<HTMLElement>('.btnStartNow')!.addEventListener('click', onStartNowClick.bind(instance));
    });
}

async function hideComingUpNext(this: UpNextDialog) {
    clearCountdownTextTimeout(this);

    if (!this.options) {
        return;
    }

    const elem = this.options!.parent;

    if (!elem) {
        return;
    }

    if (elem.classList.contains('upNextDialog-hidden')) {
        return;
    }

    elem.classList.add('upNextDialog-hidden', 'hide');
    Events.trigger(this, 'hide');
}

function getTimeRemainingMs(instance: UpNextDialog) {
    const options = instance.options;
    if (options) {
        const runtimeTicks = playbackManager.duration(options.player);

        if (runtimeTicks) {
            const timeRemainingTicks = runtimeTicks - millisecondsToTicks(playbackManager.currentTime(options.player)!);

            return Math.round(ticksToMilliseconds(timeRemainingTicks));
        }
    }

    return 0;
}

function startComingUpNextHideTimer(instance: UpNextDialog) {
    const timeRemainingMs = getTimeRemainingMs(instance);

    if (timeRemainingMs <= 0) {
        return;
    }

    setNextVideoText.call(instance);
    clearCountdownTextTimeout(instance);

    if (!instance.showStaticNextText) instance._countdownTextTimeout = setInterval(setNextVideoText.bind(instance), 400);
}

async function showStaticNextText(nextItem: PlaybackItem) {
    const apiClient = ServerConnections.getApiClient(nextItem.ServerId);
    const currentUser = await apiClient!.getCurrentUser();
    return !currentUser.Configuration?.EnableNextEpisodeAutoPlay;
}

class UpNextDialog {
    options: UpNextOptions | null;
    showStaticNextText: boolean;
    itemType: PlaybackItem['Type'] | null = null;
    _countdownTextTimeout: ReturnType<typeof setInterval> | null = null;
    constructor(options: UpNextOptions) {
        this.options = options;
        this.showStaticNextText = false; // default to showing countdown text

        init(this, options);
    }
    show() {
        const elem = this.options!.parent;

        elem.classList.remove('hide');

        elem.classList.remove('upNextDialog-hidden');

        if (layoutManager.tv) {
            focusManager.focus(elem.querySelector<HTMLElement>('.btnStartNow')!);
        }

        startComingUpNextHideTimer(this);
    }
    async hide() {
        await hideComingUpNext.bind(this)();
    }
    destroy() {
        void hideComingUpNext.call(this);

        this.options = null;
        this.showStaticNextText = false;
        this.itemType = null;
    }
}

export default UpNextDialog;
