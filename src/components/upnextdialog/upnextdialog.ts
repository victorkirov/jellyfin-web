import dom from '../../utils/dom';
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

const transitionEndEventName = dom.whichTransitionEvent();

import getHtml from './upNextMarkup';
import type { PlaybackItem } from 'lib/playback/types';
import type { PlaybackPlayer } from 'types/plugin';

type UpNextOptions = { parent: HTMLElement; player?: PlaybackPlayer; nextItem: PlaybackItem };

function setNextVideoText(this: UpNextDialog) {
    const instance = this;

    const elem = instance.options!.parent;

    const secondsRemaining = Math.max(Math.round(getTimeRemainingMs(instance) / 1000), 0);

    console.debug('up next seconds remaining: ' + secondsRemaining);

    const timeText = '<span class="upNextDialog-countdownText">' + globalize.translate('HeaderSecondsValue', secondsRemaining) + '</span>';

    let nextVideoText;
    if (instance.itemType === 'Episode') {
        nextVideoText = instance.showStaticNextText ?
            globalize.translate('HeaderNextEpisode') :
            globalize.translate('HeaderNextEpisodePlayingInValue', timeText);
    } else {
        nextVideoText = instance.showStaticNextText ?
            globalize.translate('HeaderNextVideo') :
            globalize.translate('HeaderNextVideoPlayingInValue', timeText);
    }

    elem.querySelector<HTMLElement>('.upNextDialog-nextVideoText')!.innerHTML = nextVideoText;
}

function fillItem(this: UpNextDialog, item: PlaybackItem) {
    const instance = this;

    const elem = instance.options!.parent;

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

    instance.itemType = item.Type;

    instance.show();
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

async function init(instance: UpNextDialog, options: UpNextOptions) {
    instance.showStaticNextText = await showStaticNextText(options.nextItem);

    options.parent.innerHTML = getHtml();

    options.parent.classList.add('hide');
    options.parent.classList.add('upNextDialog');
    options.parent.classList.add('upNextDialog-hidden');

    fillItem.call(instance, options.nextItem);

    options.parent.querySelector<HTMLElement>('.btnHide')!.addEventListener('click', instance.hide.bind(instance));
    options.parent.querySelector<HTMLElement>('.btnStartNow')!.addEventListener('click', onStartNowClick.bind(instance));
}

function clearHideAnimationEventListeners(instance: UpNextDialog, elem: HTMLElement) {
    const fn = instance._onHideAnimationComplete;

    if (fn) {
        dom.removeEventListener(elem, transitionEndEventName, fn, {
            once: true
        });
    }
}

function onHideAnimationComplete(this: UpNextDialog, e: Event) {
    const instance = this;
    const elem = e.target as HTMLElement;

    elem.classList.add('hide');

    clearHideAnimationEventListeners(instance, elem);
    Events.trigger(instance, 'hide');
}

async function hideComingUpNext(this: UpNextDialog) {
    const instance = this;
    clearCountdownTextTimeout(this);

    if (!instance.options) {
        return;
    }

    const elem = instance.options!.parent;

    if (!elem) {
        return;
    }

    clearHideAnimationEventListeners(this, elem);

    if (elem.classList.contains('upNextDialog-hidden')) {
        return;
    }

    const fn = onHideAnimationComplete.bind(instance);
    instance._onHideAnimationComplete = fn;

    const transitionEvent = await new Promise<Event>((resolve) => {
        dom.addEventListener(elem, transitionEndEventName, resolve, {
            once: true
        });

        // trigger a reflow to force it to animate again
        void elem.offsetWidth;

        elem.classList.add('upNextDialog-hidden');
    });

    instance._onHideAnimationComplete!(transitionEvent);
}

function getTimeRemainingMs(instance: UpNextDialog) {
    const options = instance.options;
    if (options) {
        const runtimeTicks = playbackManager.duration(options.player);

        if (runtimeTicks) {
            const timeRemainingTicks = runtimeTicks - playbackManager.currentTime(options.player)! * 10000;

            return Math.round(timeRemainingTicks / 10000);
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
    itemType: PlaybackItem["Type"] | null = null;
    _countdownTextTimeout: ReturnType<typeof setInterval> | null = null;
    _onHideAnimationComplete?: (event: Event) => void;
    constructor(options: UpNextOptions) {
        this.options = options;
        this.showStaticNextText = false; // default to showing countdown text

        init(this, options);
    }
    show() {
        const elem = this.options!.parent;

        clearHideAnimationEventListeners(this, elem);

        elem.classList.remove('hide');

        // trigger a reflow to force it to animate again
        void elem.offsetWidth;

        elem.classList.remove('upNextDialog-hidden');

        if (layoutManager.tv) {
            setTimeout(function () {
                focusManager.focus(elem.querySelector<HTMLElement>('.btnStartNow')!);
            }, 50);
        }

        startComingUpNextHideTimer(this);
    }
    async hide() {
        await hideComingUpNext.bind(this)();
    }
    destroy() {
        hideComingUpNext.call(this);

        this.options = null;
        this.showStaticNextText = false;
        this.itemType = null;
    }
}

export default UpNextDialog;
