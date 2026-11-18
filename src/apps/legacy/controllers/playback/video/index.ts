import { createOsdVisibility } from './osdVisibility';
import type { MediaSegmentDto, TrickplayInfoDto } from '@jellyfin/sdk/lib/generated-client';
import type { PlaybackItem, PlaybackState } from 'lib/playback/types';
import type { PlaybackPlayer } from 'types/plugin';
type OptionItem = Parameters<typeof import('components/actionSheet/actionSheet').default.show>[0]['items'][number];
type VideoPlayer = PlaybackPlayer & { forcedFullscreen?: boolean; isFetching?: boolean };
import type { VideoSlider } from './videoTypes';

import { getChapterBubbleHtml, getTrickplayResolution, updateTrickplayBubbleHtml } from './videoPreview';

import { PlayerEvent } from 'lib/playback/constants/playerEvent';
import { AppFeature } from 'constants/appFeature';
import { TICKS_PER_MILLISECOND, TICKS_PER_MINUTE, TICKS_PER_SECOND } from 'constants/time';
import { EventType } from 'constants/eventType';

import { playbackManager } from 'components/playback/playbackmanager';
import browser from 'scripts/browser';
import dom from 'utils/dom';
import inputManager from 'scripts/inputManager';
import mouseManager from 'scripts/mouseManager';
import datetime from 'scripts/datetime';
import itemHelper from 'components/itemHelper';
import mediaInfo from 'components/mediainfo/mediainfo';
import focusManager from 'lib/focusManager';
import Events from 'utils/events';
import globalize from 'lib/globalize';
import { appHost } from 'components/apphost';
import layoutManager from 'lib/layoutManager';
import * as userSettings from 'scripts/settings/userSettings';
import keyboardnavigation from 'scripts/keyboardNavigation';
import 'styles/scrollstyles.scss';
import 'elements/emby-slider/emby-slider';
import 'elements/emby-button/paper-icon-button-light';
import 'components/buttons/emby-ratingbutton';
import 'styles/videoosd.scss';
import shell from 'scripts/shell';
import SubtitleSync from 'components/subtitlesync/subtitlesync';
import { appRouter } from 'components/router/appRouter';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import LibraryMenu from 'scripts/libraryMenu';
import { setBackdropTransparency, TRANSPARENCY_LEVEL } from 'components/backdrop/backdrop';

function getOpenedDialog() {
    return document.querySelector<HTMLElement>('.dialogContainer .dialog.opened')!;
}

export default function (view: HTMLElement) {
    function getDisplayItem(item: PlaybackItem) {
        if (item.Type === 'TvChannel') {
            const apiClient = ServerConnections.getApiClient(item.ServerId!)!;
            return apiClient.getItem(apiClient.getCurrentUserId()!, item.Id!).then(function (refreshedItem) {
                return {
                    originalItem: refreshedItem,
                    displayItem: refreshedItem.CurrentProgram
                };
            });
        }

        return Promise.resolve({
            originalItem: item
        });
    }

    function updateDisplayItem(itemInfo: { originalItem: PlaybackItem; displayItem?: PlaybackItem }) {
        const item = itemInfo.originalItem;
        currentItem = item;
        const displayItem = itemInfo.displayItem || item;
        let parentName = displayItem.SeriesName || displayItem.Album;

        if (displayItem.EpisodeTitle || displayItem.IsSeries) {
            parentName = displayItem.Name;
        }

        setTitle(displayItem, parentName);

        const secondaryMediaInfo = view.querySelector<HTMLElement>('.osdSecondaryMediaInfo')!;
        const secondaryMediaInfoHtml = mediaInfo.getSecondaryMediaInfoHtml(displayItem, {
            startDate: false,
            programTime: false
        });
        secondaryMediaInfo.innerHTML = secondaryMediaInfoHtml;

        if (secondaryMediaInfoHtml) {
            secondaryMediaInfo.classList.remove('hide');
        } else {
            secondaryMediaInfo.classList.add('hide');
        }

        if (enableProgressByTimeOfDay) {
            setDisplayTime(startTimeText, displayItem.StartDate);
            setDisplayTime(endTimeText, displayItem.EndDate);
            startTimeText.classList.remove('hide');
            endTimeText.classList.remove('hide');
            programStartDateMs = displayItem.StartDate ? datetime.parseISO8601Date(displayItem.StartDate).getTime() : 0;
            programEndDateMs = displayItem.EndDate ? datetime.parseISO8601Date(displayItem.EndDate).getTime() : 0;
        } else {
            startTimeText.classList.add('hide');
            endTimeText.classList.add('hide');
            startTimeText.innerHTML = '';
            endTimeText.innerHTML = '';
            programStartDateMs = 0;
            programEndDateMs = 0;
        }

        // Set currently playing item for favorite button
        const btnUserRating = view.querySelector<HTMLElement & { setItem(item: PlaybackItem | null): void }>('.btnUserRating')!;

        if (itemHelper.canRate(currentItem)) {
            btnUserRating.classList.remove('hide');
            btnUserRating.setItem(currentItem);
        } else {
            btnUserRating.classList.add('hide');
            btnUserRating.setItem(null);
        }

        trickplayResolution = getTrickplayResolution(item, currentPlayer!.streamInfo!.mediaSource!.Id!);
    }

    function getDisplayTimeWithoutAmPm(date: Date, showSeconds?: boolean) {
        if (showSeconds) {
            return datetime.toLocaleTimeString(date, {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit'
            }).toLowerCase().replace('am', '').replace('pm', '').trim();
        }

        return datetime.getDisplayTime(date).toLowerCase().replace('am', '').replace('pm', '').trim();
    }

    function setDisplayTime(elem: HTMLElement, date?: string | null) {
        let html;

        if (date) {
            html = getDisplayTimeWithoutAmPm(datetime.parseISO8601Date(date));
        }

        elem.innerHTML = html || '';
    }

    function shouldEnableProgressByTimeOfDay(item: PlaybackItem) {
        return !(item.Type !== 'TvChannel' || !item.CurrentProgram);
    }

    function updateNowPlayingInfo(player: PlaybackPlayer, state: PlaybackState) {
        const item = state.NowPlayingItem;

        currentItem = item;
        if (!item) {
            LibraryMenu.setTitle('');
            Events.trigger(document, EventType.VIDEO_TITLE_CHANGE, [ '' ]);
            nowPlayingVolumeSlider.disabled = true;
            nowPlayingPositionSlider.disabled = true;
            btnFastForward.disabled = true;
            btnRewind.disabled = true;
            view.querySelector<HTMLElement>('.btnSubtitles')!.classList.add('hide');
            view.querySelector<HTMLElement>('.btnAudio')!.classList.add('hide');
            view.querySelector<HTMLElement>('.osdTitle')!.innerHTML = '';
            view.querySelector<HTMLElement>('.osdMediaInfo')!.innerHTML = '';
            return;
        }

        enableProgressByTimeOfDay = shouldEnableProgressByTimeOfDay(item);
        void getDisplayItem(item).then(updateDisplayItem);
        nowPlayingVolumeSlider.disabled = false;
        nowPlayingPositionSlider.disabled = false;
        btnFastForward.disabled = false;
        btnRewind.disabled = false;

        if (playbackManager.subtitleTracks(player).length) {
            view.querySelector<HTMLElement>('.btnSubtitles')!.classList.remove('hide');
            toggleSubtitleSync();
        } else {
            view.querySelector<HTMLElement>('.btnSubtitles')!.classList.add('hide');
            toggleSubtitleSync('forceToHide');
        }

        if (playbackManager.audioTracks(player).length > 1) {
            view.querySelector<HTMLElement>('.btnAudio')!.classList.remove('hide');
        } else {
            view.querySelector<HTMLElement>('.btnAudio')!.classList.add('hide');
        }

        if (Number(currentItem!.Chapters?.length) > 1) {
            view.querySelector<HTMLElement>('.btnPreviousChapter')!.classList.remove('hide');
            view.querySelector<HTMLElement>('.btnNextChapter')!.classList.remove('hide');
        } else {
            view.querySelector<HTMLElement>('.btnPreviousChapter')!.classList.add('hide');
            view.querySelector<HTMLElement>('.btnNextChapter')!.classList.add('hide');
        }
    }

    function setTitle(item: PlaybackItem, parentName?: string | null) {
        let itemName = itemHelper.getDisplayName(item, {
            includeParentInfo: item.Type !== 'Program',
            includeIndexNumber: item.Type !== 'Program'
        });

        if (itemName && parentName) {
            itemName = `${parentName} - ${itemName}`;
        }

        if (!itemName) {
            itemName = parentName || '';
        }

        // Display the item with its premiere date if it has one
        let title = itemName;
        if (item.Type == 'Movie' && item.ProductionYear) {
            title += ` (${datetime.toLocaleString(item.ProductionYear, { useGrouping: false })})`;
        } else if (item.PremiereDate) {
            try {
                const year = datetime.toLocaleString(datetime.parseISO8601Date(item.PremiereDate).getFullYear(), { useGrouping: false });
                title += ` (${year})`;
            } catch (e) {
                console.error(e);
            }
        }

        LibraryMenu.setTitle(title);
        Events.trigger(document, EventType.VIDEO_TITLE_CHANGE, [ title ]);

        document.title = title;
    }

    let mouseIsDown = false;

    function showOsd(focusElement?: HTMLElement | null) {
        Events.trigger(document, EventType.SHOW_VIDEO_OSD, [ true ]);
        osdVisibility.showHeader();
        showMainOsdControls(focusElement);
        resetIdle();
    }

    function hideOsd() {
        Events.trigger(document, EventType.SHOW_VIDEO_OSD, [ false ]);
        osdVisibility.hideHeader();
        hideMainOsdControls();
        mouseManager.hideCursor();
    }

    function startOsdHideTimer() {
        stopOsdHideTimer();
        osdHideTimeout = setTimeout(hideOsd, 3e3);
    }

    function stopOsdHideTimer() {
        if (osdHideTimeout) {
            clearTimeout(osdHideTimeout);
            osdHideTimeout = null;
        }
    }

    const _focus = function (focusElement?: HTMLElement | null) {
        // If no focus element is provided, try to keep current focus if it's valid,
        // otherwise default to pause button
        const currentFocus = focusElement || document.activeElement;
        if (!currentFocus || !focusManager.isCurrentlyFocusable(currentFocus)) {
            focusElement = osdBottomElement.querySelector<HTMLElement>('.btnPause')!;
        }

        if (focusElement) focusManager.focus(focusElement);
    };

    function showMainOsdControls(focusElement?: HTMLElement | null) {
        if (!currentVisibleMenu) {
            currentVisibleMenu = 'osd';
            osdVisibility.showControls();

            if (currentPlayer && currentItem) {
                currentRuntimeTicks = playbackManager.duration(currentPlayer);
                updateTimeDisplay(playbackManager.currentTime(currentPlayer)! * TICKS_PER_MILLISECOND, currentRuntimeTicks, playbackManager.playbackStartTime(currentPlayer), playbackManager.getPlaybackRate(currentPlayer), playbackManager.getBufferedRanges(currentPlayer));
            }

            _focus(focusElement);

            toggleSubtitleSync();
        } else if (currentVisibleMenu === 'osd') {
            _focus(focusElement);
        }
    }

    function hideMainOsdControls() {
        if (currentVisibleMenu === 'osd') {
            osdVisibility.hideControls();
            currentVisibleMenu = null;
            toggleSubtitleSync('hide');

            // Firefox does not blur by itself
            if (osdBottomElement.contains(document.activeElement)
                || headerElement.contains(document.activeElement)) {
                (document.activeElement as HTMLElement).blur();
            }
        }
    }

    // TODO: Move all idle-related code to `inputManager` or `idleManager` or `idleHelper` (per dialog thing) and listen event from there.

    function resetIdle() {
        // Restart hide timer if OSD is currently visible and there is no opened dialog
        if (currentVisibleMenu && !mouseIsDown && !getOpenedDialog()) {
            startOsdHideTimer();
        } else {
            stopOsdHideTimer();
        }
    }

    function onPointerMove(e: MouseEvent & { pointerType?: string }) {
        if ((e.pointerType || 'mouse') === 'mouse') {
            const eventX = e.screenX || e.clientX || 0;
            const eventY = e.screenY || e.clientY || 0;
            const obj = lastPointerMoveData;

            if (!obj) {
                lastPointerMoveData = {
                    x: eventX,
                    y: eventY
                };
                return;
            }

            if (Math.abs(eventX - obj.x) < 10 && Math.abs(eventY - obj.y) < 10) {
                return;
            }

            obj.x = eventX;
            obj.y = eventY;
            showOsd();
        }
    }

    function onInputCommand(e: Event) {
        const player = currentPlayer;

        switch ((e as CustomEvent<{ command: string }>).detail.command) {
            case 'left':
                if (currentVisibleMenu === 'osd') {
                    showOsd();
                } else if (!currentVisibleMenu) {
                    e.preventDefault();
                    playbackManager.rewind(player);
                }

                break;

            case 'right':
                if (currentVisibleMenu === 'osd') {
                    showOsd();
                } else if (!currentVisibleMenu) {
                    e.preventDefault();
                    playbackManager.fastForward(player);
                }

                break;

            case 'pageup':
                playbackManager.nextChapter(player);
                break;

            case 'pagedown':
                playbackManager.previousChapter(player);
                break;

            case 'up':
            case 'down':
            case 'select':
            case 'menu':
            case 'info':
            case 'play':
            case 'playpause':
            case 'pause':
            case 'fastforward':
            case 'rewind':
            case 'next':
            case 'previous':
                showOsd();
                break;

            case 'togglestats':
                toggleStats();
                break;

            case 'back':
                // Ignore command when some dialog is opened
                if (currentVisibleMenu === 'osd' && !getOpenedDialog()) {
                    hideOsd();
                    e.preventDefault();
                }
                break;
        }
    }

    function onFullscreenChanged() {
        if (currentPlayer!.forcedFullscreen && !playbackManager.isFullscreen(currentPlayer)) {
            void appRouter.back();
            return;
        }

        updateFullscreenIcon();
    }

    function updateFullscreenIcon() {
        const button = view.querySelector<HTMLElement>('.btnFullscreen')!;
        const icon = button.querySelector<HTMLElement>('.material-icons')!;

        icon.classList.remove('fullscreen_exit', 'fullscreen');

        if (playbackManager.isFullscreen(currentPlayer)) {
            button.setAttribute('title', globalize.translate('ExitFullscreen') + ' (F)');
            icon.classList.add('fullscreen_exit');
        } else {
            button.setAttribute('title', globalize.translate('Fullscreen') + ' (F)');
            icon.classList.add('fullscreen');
        }
    }

    function onPlayerChange() {
        bindToPlayer(playbackManager.getCurrentPlayer());
    }

    function onStateChanged(this: PlaybackPlayer, event: { type: string }, state: PlaybackState) {
        if (state.NowPlayingItem) {
            isEnabled = true;
            updatePlayerStateInternal(event, this, state);
            void updatePlaylist();
            enableStopOnBack(true);
            updatePlaybackRate(this);
        }
    }

    function onPlayPauseStateChanged(this: PlaybackPlayer) {
        if (isEnabled) {
            updatePlayPauseState(this.paused());
        }
    }

    function onVolumeChanged(this: PlaybackPlayer) {
        if (isEnabled) {
            updatePlayerVolumeState(this, this.isMuted(), this.getVolume());
        }
    }

    function onPlaybackStart(this: PlaybackPlayer, e: { type: string }, state: PlaybackState) {
        console.debug('nowplaying event: ' + e.type);
        onStateChanged.call(this, e, state);
        resetUpNextDialog();
    }

    function resetUpNextDialog() {
        comingUpNextDisplayed = false;
        const dlg = currentUpNextDialog;

        if (dlg) {
            dlg.destroy();
            currentUpNextDialog = null;
        }
    }

    function onPlaybackStopped(e: { type: string }, state: PlaybackState) {
        currentRuntimeTicks = null;
        resetUpNextDialog();
        console.debug('nowplaying event: ' + e.type);

        if (state.NextMediaType !== 'Video') {
            view.removeEventListener('viewbeforehide', onViewHideStopPlayback);
            void appRouter.back();
        }
    }

    function onMediaStreamsChanged(this: PlaybackPlayer) {
        const state = playbackManager.getPlayerState(this);
        onStateChanged.call(this!, {
            type: 'init'
        }, state);
    }

    function onBeginFetch() {
        view.querySelector<HTMLElement>('.osdMediaStatus')!.classList.remove('hide');
    }

    function onEndFetch() {
        view.querySelector<HTMLElement>('.osdMediaStatus')!.classList.add('hide');
    }

    function bindToPlayer(player: VideoPlayer | null | undefined) {
        if (player !== currentPlayer) {
            releaseCurrentPlayer();
            currentPlayer = player;
            if (!player) return;
        }
        const state = playbackManager.getPlayerState(player);
        onStateChanged.call(player!, {
            type: 'init'
        }, state);
        Events.on(player, 'playbackstart', onPlaybackStart);
        Events.on(player, 'playbackstop', onPlaybackStopped);
        Events.on(player, PlayerEvent.PromptSkip, onPromptSkip);
        Events.on(player, 'volumechange', onVolumeChanged);
        Events.on(player, 'pause', onPlayPauseStateChanged);
        Events.on(player, 'unpause', onPlayPauseStateChanged);
        Events.on(player, 'timeupdate', onTimeUpdate);
        Events.on(player, 'fullscreenchange', onFullscreenChanged);
        Events.on(player, 'mediastreamschange', onMediaStreamsChanged);
        Events.on(player, 'beginFetch', onBeginFetch);
        Events.on(player, 'endFetch', onEndFetch);
        resetUpNextDialog();

        if (player!.isFetching) {
            onBeginFetch();
        }
    }

    function releaseCurrentPlayer() {
        destroyStats();
        destroySubtitleSync();
        resetUpNextDialog();
        const player = currentPlayer;

        if (player) {
            Events.off(player, 'playbackstart', onPlaybackStart);
            Events.off(player, 'playbackstop', onPlaybackStopped);
            Events.off(player, PlayerEvent.PromptSkip, onPromptSkip);
            Events.off(player, 'volumechange', onVolumeChanged);
            Events.off(player, 'pause', onPlayPauseStateChanged);
            Events.off(player, 'unpause', onPlayPauseStateChanged);
            Events.off(player, 'timeupdate', onTimeUpdate);
            Events.off(player, 'fullscreenchange', onFullscreenChanged);
            Events.off(player, 'mediastreamschange', onMediaStreamsChanged);
            Events.off(player, 'beginFetch', onBeginFetch);
            Events.off(player, 'endFetch', onEndFetch);
            currentPlayer = null;
        }
    }

    function onTimeUpdate(this: PlaybackPlayer) {
        // Test for 'currentItem' is required for Firefox since its player spams 'timeupdate' events even being at breakpoint
        if (isEnabled && currentItem) {
            const now = new Date().getTime();

            if (now - lastUpdateTime >= 700) {
                lastUpdateTime = now;
                currentRuntimeTicks = playbackManager.duration(this);
                const currentTime = playbackManager.currentTime(this)! * TICKS_PER_MILLISECOND;
                if (currentVisibleMenu === 'osd') {
                    updateTimeDisplay(currentTime, currentRuntimeTicks, playbackManager.playbackStartTime(this), playbackManager.getPlaybackRate(this), playbackManager.getBufferedRanges(this));
                }
                const item = currentItem;
                refreshProgramInfoIfNeeded(this, item);
                showComingUpNextIfNeeded(this, item, currentTime, currentRuntimeTicks);
            }
        }
    }

    function onPromptSkip(this: PlaybackPlayer, e: { type: string }, mediaSegment: MediaSegmentDto) {
        if (mediaSegment && this && mediaSegment.EndTicks != null
            && mediaSegment.EndTicks >= playbackManager.duration(this)
            && playbackManager.getNextItem()
            && userSettings.enableNextVideoInfoOverlay()
        ) {
            showComingUpNext(this);
        }
    }

    function showComingUpNextIfNeeded(player: PlaybackPlayer, currentItem: PlaybackItem, currentTimeTicks: number, runtimeTicks: number) {
        if (runtimeTicks && currentTimeTicks && !comingUpNextDisplayed && !currentVisibleMenu && currentItem!.Type === 'Episode' && userSettings.enableNextVideoInfoOverlay()) {
            let showAtSecondsLeft = 30;
            if (runtimeTicks >= 50 * TICKS_PER_MINUTE) {
                showAtSecondsLeft = 40;
            } else if (runtimeTicks >= 40 * TICKS_PER_MINUTE) {
                showAtSecondsLeft = 35;
            }
            const showAtTicks = runtimeTicks - showAtSecondsLeft * TICKS_PER_SECOND;
            const timeRemainingTicks = runtimeTicks - currentTimeTicks;

            if (currentTimeTicks >= showAtTicks && runtimeTicks >= (10 * TICKS_PER_MINUTE) && timeRemainingTicks >= (20 * TICKS_PER_SECOND)) {
                showComingUpNext(player);
            }
        }
    }

    function onUpNextHidden() {
        if (currentVisibleMenu === 'upnext') {
            currentVisibleMenu = null;
        }
    }

    function showComingUpNext(player: PlaybackPlayer) {
        void import('components/upnextdialog/upnextdialog').then(({ default: UpNextDialog }) => {
            if (!(currentVisibleMenu || currentUpNextDialog)) {
                currentVisibleMenu = 'upnext';
                comingUpNextDisplayed = true;
                playbackManager.nextItem(player).then(function (nextItem) {
                    currentUpNextDialog = new UpNextDialog({
                        parent: view.querySelector<HTMLElement>('.upNextContainer')!,
                        player: player,
                        nextItem: nextItem
                    });
                    Events.on(currentUpNextDialog, 'hide', onUpNextHidden);
                }, onUpNextHidden);
            }
        });
    }

    function refreshProgramInfoIfNeeded(player: PlaybackPlayer, item: PlaybackItem) {
        if (item.Type === 'TvChannel') {
            const program = item.CurrentProgram;

            if (program?.EndDate) {
                try {
                    const endDate = datetime.parseISO8601Date(program.EndDate);

                    if (new Date().getTime() >= endDate.getTime()) {
                        console.debug('program info needs to be refreshed');
                        const state = playbackManager.getPlayerState(player);
                        onStateChanged.call(player!, {
                            type: 'init'
                        }, state);
                    }
                } catch (e) {
                    console.error('error parsing date: ' + program.EndDate, e);
                }
            }
        }
    }

    function updatePlayPauseState(isPaused?: boolean) {
        const btnPlayPause = view.querySelector<HTMLElement>('.btnPause')!;
        const btnPlayPauseIcon = btnPlayPause.querySelector<HTMLElement>('.material-icons')!;

        btnPlayPauseIcon.classList.remove('play_arrow', 'pause');

        let icon;
        let title;

        if (isPaused) {
            icon = 'play_arrow';
            title = globalize.translate('Play');
        } else {
            icon = 'pause';
            title = globalize.translate('ButtonPause');
        }

        btnPlayPauseIcon.classList.add(icon);
        dom.setElementTitle(btnPlayPause, title + ' (K)', title);
    }

    function updatePlayerStateInternal(event: { type: string }, player: PlaybackPlayer, state: PlaybackState) {
        const playState = state.PlayState || {};
        updatePlayPauseState(playState.IsPaused);
        const supportedCommands = playbackManager.getSupportedCommands(player)!;
        currentPlayerSupportedCommands = supportedCommands;
        updatePlayerVolumeState(player, playState.IsMuted, playState.VolumeLevel);

        if (nowPlayingPositionSlider && !nowPlayingPositionSlider.dragging) {
            nowPlayingPositionSlider.disabled = !playState.CanSeek;
        }

        btnFastForward.disabled = !playState.CanSeek;
        btnRewind.disabled = !playState.CanSeek;
        const nowPlayingItem = state.NowPlayingItem || {};
        playbackStartTimeTicks = playState.PlaybackStartTimeTicks;
        updateTimeDisplay(playState.PositionTicks, nowPlayingItem!.RunTimeTicks, playState.PlaybackStartTimeTicks, playState.PlaybackRate, playState.BufferedRanges || []);
        updateNowPlayingInfo(player, state);

        const isProgressClear = state.MediaSource && state.MediaSource.RunTimeTicks == null;
        nowPlayingPositionSlider.setIsClear(isProgressClear);

        if (nowPlayingItem.RunTimeTicks) {
            nowPlayingPositionSlider.setKeyboardSteps(userSettings.skipBackLength() * TICKS_PER_MILLISECOND * 100 / nowPlayingItem.RunTimeTicks,
                userSettings.skipForwardLength() * TICKS_PER_MILLISECOND * 100 / nowPlayingItem.RunTimeTicks);
        }

        if (supportedCommands.indexOf('ToggleFullscreen') === -1 || player.isLocalPlayer && layoutManager.tv && playbackManager.isFullscreen(player)) {
            view.querySelector<HTMLElement>('.btnFullscreen')!.classList.add('hide');
        } else {
            view.querySelector<HTMLElement>('.btnFullscreen')!.classList.remove('hide');
        }

        if (supportedCommands.indexOf('PictureInPicture') === -1) {
            view.querySelector<HTMLElement>('.btnPip')!.classList.add('hide');
        } else {
            view.querySelector<HTMLElement>('.btnPip')!.classList.remove('hide');
        }

        if (supportedCommands.indexOf('AirPlay') === -1) {
            view.querySelector<HTMLElement>('.btnAirPlay')!.classList.add('hide');
        } else {
            view.querySelector<HTMLElement>('.btnAirPlay')!.classList.remove('hide');
        }

        onFullscreenChanged();
    }

    function getDisplayPercentByTimeOfDay(programStartDateMs: number, programRuntimeMs: number, currentTimeMs: number) {
        return (currentTimeMs - programStartDateMs) / programRuntimeMs * 100;
    }

    function updateTimeDisplay(positionTicks: number | null | undefined, runtimeTicks: number | null | undefined, playbackStartTimeTicks: number | null | undefined, playbackRate: number | null | undefined, bufferedRanges: { start: number; end: number }[]) {
        if (enableProgressByTimeOfDay) {
            updateTimeOfDayProgress(positionTicks, playbackStartTimeTicks, bufferedRanges);
        } else {
            updatePositionProgress(positionTicks, runtimeTicks, playbackRate);
            updatePositionText(positionTicks, runtimeTicks, bufferedRanges);
        }
    }

    function updateTimeOfDayProgress(positionTicks: number | null | undefined, playbackStartTimeTicks: number | null | undefined, bufferedRanges: { start: number; end: number }[]) {
        if (nowPlayingPositionSlider && !nowPlayingPositionSlider.dragging) {
            if (programStartDateMs && programEndDateMs) {
                const currentTimeMs = (playbackStartTimeTicks! + (positionTicks || 0)) / TICKS_PER_MILLISECOND;
                const programRuntimeMs = programEndDateMs - programStartDateMs;

                nowPlayingPositionSlider.value = getDisplayPercentByTimeOfDay(programStartDateMs, programRuntimeMs, currentTimeMs);

                if (bufferedRanges.length) {
                    const rangeStart = getDisplayPercentByTimeOfDay(programStartDateMs, programRuntimeMs, (playbackStartTimeTicks! + (bufferedRanges[0].start || 0)) / TICKS_PER_MILLISECOND);
                    const rangeEnd = getDisplayPercentByTimeOfDay(programStartDateMs, programRuntimeMs, (playbackStartTimeTicks! + (bufferedRanges[0].end || 0)) / TICKS_PER_MILLISECOND);
                    nowPlayingPositionSlider.setBufferedRanges([{
                        start: rangeStart,
                        end: rangeEnd
                    }]);
                } else {
                    nowPlayingPositionSlider.setBufferedRanges([]);
                }
            } else {
                nowPlayingPositionSlider.value = 0;
                nowPlayingPositionSlider.setBufferedRanges([]);
            }
        }

        nowPlayingPositionText.innerHTML = '';
        nowPlayingDurationText.innerHTML = '';
    }

    function updatePositionProgress(positionTicks: number | null | undefined, runtimeTicks: number | null | undefined, playbackRate: number | null | undefined) {
        if (nowPlayingPositionSlider && !nowPlayingPositionSlider.dragging) {
            if (runtimeTicks) {
                let pct = positionTicks! / runtimeTicks;
                pct *= 100;
                nowPlayingPositionSlider.value = pct;
            } else {
                nowPlayingPositionSlider.value = 0;
            }

            if (runtimeTicks && positionTicks != null && currentRuntimeTicks && !enableProgressByTimeOfDay && currentItem!.RunTimeTicks && currentItem!.Type !== 'Recording' && playbackRate !== null) {
                endsAtText.innerHTML = '&nbsp;&nbsp;&nbsp;&nbsp;' + mediaInfo.getEndsAtFromPosition(runtimeTicks, positionTicks, playbackRate, true);
            } else {
                endsAtText.innerHTML = '';
            }
        }
    }

    function updatePositionText(positionTicks: number | null | undefined, runtimeTicks: number | null | undefined, bufferedRanges: { start: number; end: number }[]) {
        if (nowPlayingPositionSlider) {
            nowPlayingPositionSlider.setBufferedRanges(bufferedRanges, runtimeTicks, positionTicks);
        }

        if (positionTicks! >= 0) {
            updateTimeText(nowPlayingPositionText, positionTicks);
            nowPlayingPositionText.classList.remove('hide');
        } else {
            nowPlayingPositionText.classList.add('hide');
        }

        if (userSettings.enableVideoRemainingTime()) {
            const leftTicks = runtimeTicks! - positionTicks!;
            if (leftTicks >= 0) {
                updateTimeText(nowPlayingDurationText, leftTicks);
                nowPlayingDurationText.innerHTML = '-' + nowPlayingDurationText.innerHTML;
                nowPlayingDurationText.classList.remove('hide');
            } else {
                nowPlayingPositionText.classList.add('hide');
            }
        } else {
            updateTimeText(nowPlayingDurationText, runtimeTicks);
            nowPlayingDurationText.classList.remove('hide');
        }
    }

    function updatePlayerVolumeState(player: PlaybackPlayer, isMuted?: boolean, volumeLevel?: number) {
        const supportedCommands = currentPlayerSupportedCommands;
        let showMuteButton = true;
        let showVolumeSlider = true;

        if (supportedCommands.indexOf('Mute') === -1) {
            showMuteButton = false;
        }

        if (supportedCommands.indexOf('SetVolume') === -1) {
            showVolumeSlider = false;
        }

        if (player.isLocalPlayer && appHost.supports(AppFeature.PhysicalVolumeControl)) {
            showMuteButton = false;
            showVolumeSlider = false;
        }

        const buttonMute = view.querySelector<HTMLElement>('.buttonMute')!;
        const buttonMuteIcon = buttonMute.querySelector<HTMLElement>('.material-icons')!;

        buttonMuteIcon.classList.remove('volume_off', 'volume_up');

        if (isMuted) {
            buttonMute.setAttribute('title', globalize.translate('Unmute') + ' (M)');
            buttonMuteIcon.classList.add('volume_off');
        } else {
            buttonMute.setAttribute('title', globalize.translate('Mute') + ' (M)');
            buttonMuteIcon.classList.add('volume_up');
        }

        if (showMuteButton) {
            buttonMute.classList.remove('hide');
        } else {
            buttonMute.classList.add('hide');
        }

        if (nowPlayingVolumeSlider) {
            if (showVolumeSlider) {
                nowPlayingVolumeSliderContainer.classList.remove('hide');
            } else {
                nowPlayingVolumeSliderContainer.classList.add('hide');
            }

            if (!nowPlayingVolumeSlider.dragging) {
                nowPlayingVolumeSlider.value = volumeLevel || 0;
            }
        }
    }

    async function updatePlaylist() {
        try {
            const playlist = await playbackManager.getPlaylist();

            if (playlist && playlist.length > 1) {
                const btnPreviousTrack = view.querySelector<HTMLButtonElement>('.btnPreviousTrack')!;
                const btnNextTrack = view.querySelector<HTMLButtonElement>('.btnNextTrack')!;
                btnPreviousTrack.classList.remove('hide');
                btnNextTrack.classList.remove('hide');
                btnPreviousTrack.disabled = false;
                btnNextTrack.disabled = false;
            }
        } catch (err) {
            console.error('[VideoPlayer] failed to get playlist', err);
        }
    }

    function updateTimeText(elem: HTMLElement, ticks: number | null | undefined, divider?: boolean) {
        if (ticks == null) {
            elem.innerHTML = '';
            return;
        }

        let html = datetime.getDisplayRunningTime(ticks);

        if (divider) {
            html = '&nbsp;/&nbsp;' + html;
        }

        elem.innerHTML = html;
    }

    function nowPlayingDurationTextClick() {
        userSettings.enableVideoRemainingTime(!userSettings.enableVideoRemainingTime());
        // immediately update the text, without waiting for the next tick update or if the player is paused
        const state = playbackManager.getPlayerState(currentPlayer);
        const playState = state.PlayState;
        const nowPlayingItem = state.NowPlayingItem;
        updateTimeDisplay(playState.PositionTicks, nowPlayingItem!.RunTimeTicks, playState.PlaybackStartTimeTicks, playState.PlaybackRate, playState.BufferedRanges || []);
    }

    function onSettingsButtonClick(this: HTMLElement) {
        void import('components/playback/playersettingsmenu').then((playerSettingsMenu) => {
            const player = currentPlayer;

            if (player) {
                const state = playbackManager.getPlayerState(player);

                // show subtitle offset feature only if player and media support it
                const showSubOffset = playbackManager.supportSubtitleOffset(player)
                        && playbackManager.canHandleOffsetOnCurrentSubtitle(player);

                setTimeout(resetIdle, 0);
                return playerSettingsMenu.show({
                    mediaType: 'Video',
                    player: player,
                    positionTo: this,
                    quality: state.MediaSource?.SupportsTranscoding,
                    stats: true,
                    suboffset: showSubOffset,
                    onOption: onSettingsOption
                }).finally(() => {
                    resetIdle();
                });
            }
        }).catch((error: unknown) => {
            // Dismissing an action sheet rejects without an error.
            if (error) console.error('Failed to apply playback setting', error);
        });
    }

    function onSettingsOption(selectedOption: string) {
        if (selectedOption === 'stats') {
            toggleStats();
        } else if (selectedOption === 'suboffset') {
            const player = currentPlayer;
            if (player) {
                playbackManager.enableShowingSubtitleOffset(player);
                toggleSubtitleSync();
            }
        }
    }

    function toggleStats() {
        void import('components/playerstats/playerstats').then(({ default: PlayerStats }) => {
            const player = currentPlayer;

            if (player) {
                if (statsOverlay) {
                    statsOverlay.toggle();
                } else {
                    statsOverlay = new PlayerStats({
                        player: player
                    });
                }
            }
        });
    }

    function destroyStats() {
        if (statsOverlay) {
            statsOverlay.destroy();
            statsOverlay = null;
        }
    }

    function showAudioTrackSelection(this: HTMLElement) {
        const player = currentPlayer;
        const audioTracks = playbackManager.audioTracks(player);
        const currentIndex = playbackManager.getAudioStreamIndex(player);
        const menuItems = audioTracks.map(function (stream) {
            const opt: OptionItem = {
                name: stream.DisplayTitle!,
                // The legacy action sheet serializes numeric ids in its markup.
                id: stream.Index as unknown as string
            };

            if (stream.Index === currentIndex) {
                opt.selected = true;
            }

            return opt;
        });

        void import('components/actionSheet/actionSheet').then(({ default: actionsheet }) => {
            void actionsheet.show({
                items: menuItems,
                title: globalize.translate('Audio'),
                positionTo: this
            }).then(function (id) {
                const index = parseInt(id as string, 10);

                if (index !== currentIndex) {
                    playbackManager.setAudioStreamIndex(index, player);
                }
            }).finally(() => {
                resetIdle();
            });

            setTimeout(resetIdle, 0);
        });
    }

    function showSecondarySubtitlesMenu(actionsheet: typeof import('components/actionSheet/actionSheet').default, positionTo: HTMLElement) {
        const player = currentPlayer;
        if (!playbackManager.playerHasSecondarySubtitleSupport(player)) return;
        let currentIndex = playbackManager.getSecondarySubtitleStreamIndex(player);
        const streams = playbackManager.secondarySubtitleTracks(player);

        if (currentIndex == null) {
            currentIndex = -1;
        }

        streams.unshift({
            Index: -1,
            DisplayTitle: globalize.translate('Off')
        });

        const menuItems = streams.map(function (stream) {
            const opt: OptionItem = {
                name: stream.DisplayTitle!,
                // The legacy action sheet serializes numeric ids in its markup.
                id: stream.Index as unknown as string
            };

            if (stream.Index === currentIndex) {
                opt.selected = true;
            }

            return opt;
        });

        void actionsheet.show({
            title: globalize.translate('SecondarySubtitles'),
            items: menuItems,
            positionTo
        }).then(function (id) {
            if (id) {
                const index = parseInt(id as string, 10);
                if (index !== currentIndex) {
                    playbackManager.setSecondarySubtitleStreamIndex(index, player);
                }
            }
        })
            .finally(() => {
                resetIdle();
            });

        setTimeout(resetIdle, 0);
    }

    function showSubtitleTrackSelection(this: HTMLElement) {
        const player = currentPlayer;
        const streams = playbackManager.subtitleTracks(player);
        const secondaryStreams = playbackManager.secondarySubtitleTracks(player);
        let currentIndex = playbackManager.getSubtitleStreamIndex(player);

        if (currentIndex == null) {
            currentIndex = -1;
        }

        streams.unshift({
            Index: -1,
            DisplayTitle: globalize.translate('Off')
        });
        const menuItems = streams.map(function (stream) {
            const opt: OptionItem = {
                name: stream.DisplayTitle!,
                // The legacy action sheet serializes numeric ids in its markup.
                id: stream.Index as unknown as string
            };

            if (stream.Index === currentIndex) {
                opt.selected = true;
            }

            return opt;
        });

        /**
            * Only show option if:
            * - player has support
            * - has more than 1 subtitle track
            * - has valid secondary tracks
            * - primary subtitle is not off
            * - primary subtitle has support
            */
        const currentTrackCanAddSecondarySubtitle = playbackManager.playerHasSecondarySubtitleSupport(player)
                && streams.length > 1
                && secondaryStreams.length > 0
                && currentIndex !== -1
                && playbackManager.trackHasSecondarySubtitleSupport(playbackManager.getSubtitleStream(player, currentIndex), player);

        if (currentTrackCanAddSecondarySubtitle) {
            const secondarySubtitleMenuItem = {
                name: globalize.translate('SecondarySubtitles'),
                id: 'secondarysubtitle'
            };
            menuItems.unshift(secondarySubtitleMenuItem);
        }

        void import('components/actionSheet/actionSheet').then(({ default: actionsheet }) => {
            void actionsheet.show({
                title: globalize.translate('Subtitles'),
                items: menuItems,
                positionTo: this
            }).then((id) => {
                if (id === 'secondarysubtitle') {
                    try {
                        showSecondarySubtitlesMenu(actionsheet, this);
                    } catch (e) {
                        console.error(e);
                    }
                } else {
                    const index = parseInt(id as string, 10);

                    if (index !== currentIndex) {
                        playbackManager.setSubtitleStreamIndex(index, player);
                    }
                }

                toggleSubtitleSync();
            }).finally(() => {
                resetIdle();
            });

            setTimeout(resetIdle, 0);
        });
    }

    function toggleSubtitleSync(action?: string) {
        const player = currentPlayer;
        if (subtitleSyncOverlay) {
            subtitleSyncOverlay.toggle(action);
        } else if (player) {
            subtitleSyncOverlay = new SubtitleSync(player);
        }
    }

    function destroySubtitleSync() {
        if (subtitleSyncOverlay) {
            subtitleSyncOverlay.destroy();
            subtitleSyncOverlay = null;
        }
    }

    /**
         * Clicked element.
         * To skip 'click' handling on Firefox/Edge.
         */
    let clickedElement: EventTarget | null | undefined;

    function onClickCapture(e: MouseEvent) {
        // Firefox/Edge emits `click` even if `preventDefault` was used on `keydown`
        // Ignore 'click' if another element was originally clicked
        if (!(e.target as HTMLElement).contains(clickedElement as Node | null)) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }

    function onKeyDown(e: KeyboardEvent) {
        clickedElement = e.target;

        const isKeyModified = e.ctrlKey || e.altKey || e.metaKey;

        // Skip modified keys
        if (isKeyModified) return;

        const key = keyboardnavigation.getKeyName(e);

        const btnPlayPause = osdBottomElement.querySelector<HTMLElement>('.btnPause')!;

        if (handleSpaceKey(e, btnPlayPause)) return;

        if (handleHiddenNavigation(e, key, btnPlayPause)) return;

        if (layoutManager.tv && keyboardnavigation.isNavigationKey(key)) {
            if (!e.shiftKey) showOsd();
            return;
        }

        if (key.startsWith('Digit') || key.startsWith('Numpad')) {
            const num = parseInt(key.replace('Digit', '').replace('Numpad', ''), 10);
            if (!isNaN(num) && num >= 0 && num <= 9) {
                playbackManager.seekPercent(num * 10, currentPlayer);
                return;
            }
        }

        handlePlaybackKey0(e, key, btnPlayPause);
        handlePlaybackKey1(e, key);
        handlePlaybackKey2(e, key);
        handlePlaybackKey3(e, key);
    }

    function handlePlaybackKey0(e: KeyboardEvent, key: string, btnPlayPause: HTMLElement) {
        switch (key) {
            case 'Enter':
                showOsd();
                break;
            case 'Escape':
            case 'Back':
                // Ignore key when some dialog is opened
                if (currentVisibleMenu === 'osd' && !getOpenedDialog()) {
                    hideOsd();
                    e.stopPropagation();
                }
                break;
            case 'KeyK':
                if (!e.shiftKey) {
                    e.preventDefault();
                    playbackManager.playPause(currentPlayer);
                    showOsd(btnPlayPause);
                }
                break;
            case 'ArrowUp':
            case 'Up':
                if (!e.shiftKey) {
                    e.preventDefault();
                    playbackManager.volumeUp(currentPlayer);
                }
                break;
            case 'ArrowDown':
            case 'Down':
                if (!e.shiftKey) {
                    e.preventDefault();
                    playbackManager.volumeDown(currentPlayer);
                }
                break;
            case 'KeyL':
            case 'ArrowRight':
            case 'Right':
                if (!e.shiftKey) {
                    e.preventDefault();
                    playbackManager.fastForward(currentPlayer);
                    showOsd(btnFastForward);
                }
                break;
        }
    }

    function handlePlaybackKey1(e: KeyboardEvent, key: string) {
        switch (key) {
            case 'Comma':
                e.preventDefault();
                if (!e.shiftKey) {
                    playbackManager.seekFrames(-1, currentPlayer);
                } else {
                    playbackManager.decreasePlaybackRate(currentPlayer);
                }
                break;
            case 'Period':
                e.preventDefault();
                if (!e.shiftKey) {
                    playbackManager.seekFrames(1, currentPlayer);
                } else {
                    playbackManager.increasePlaybackRate(currentPlayer);
                }
                break;
            case 'KeyJ':
            case 'ArrowLeft':
            case 'Left':
                if (!e.shiftKey) {
                    e.preventDefault();
                    playbackManager.rewind(currentPlayer);
                    showOsd(btnRewind);
                }
                break;
        }
    }

    function handlePlaybackKey2(e: KeyboardEvent, key: string) {
        switch (key) {
            case 'KeyF':
                if (!e.shiftKey) {
                    e.preventDefault();
                    playbackManager.toggleFullscreen(currentPlayer);
                }
                break;
            case 'KeyM':
                if (!e.shiftKey) {
                    e.preventDefault();
                    playbackManager.toggleMute(currentPlayer);
                }
                break;
            case 'KeyP':
                if (e.shiftKey) {
                    e.preventDefault();
                    playbackManager.previousTrack(currentPlayer);
                }
                break;
        }
    }

    function handlePlaybackKey3(e: KeyboardEvent, key: string) {
        switch (key) {
            case 'KeyN':
                if (e.shiftKey) {
                    e.preventDefault();
                    playbackManager.nextTrack(currentPlayer);
                }
                break;
            case 'Home':
                if (!e.shiftKey) {
                    e.preventDefault();
                    playbackManager.seekPercent(0, currentPlayer);
                }
                break;
            case 'End':
                if (!e.shiftKey) {
                    e.preventDefault();
                    playbackManager.seekPercent(100, currentPlayer);
                }
                break;
            case 'PageUp':
                if (!e.shiftKey) {
                    e.preventDefault();
                    playbackManager.nextChapter(currentPlayer);
                }
                break;
            case 'PageDown':
                if (!e.shiftKey) {
                    e.preventDefault();
                    playbackManager.previousChapter(currentPlayer);
                }
                break;
            case 'KeyG':
                if (!e.shiftKey) {
                    e.preventDefault();
                    subtitleSyncOverlay?.decrementOffset();
                }
                break;
            case 'KeyH':
                if (!e.shiftKey) {
                    e.preventDefault();
                    subtitleSyncOverlay?.incrementOffset();
                }
                break;
        }
    }

    function handleSpaceKey(e: KeyboardEvent, btnPlayPause: HTMLElement) {
        if (e.keyCode === 32) {
            if ((e.target as HTMLElement).tagName !== 'BUTTON' || !layoutManager.tv) {
                playbackManager.playPause(currentPlayer);
                showOsd(btnPlayPause);
                e.preventDefault();
                e.stopPropagation();
                // Trick Firefox with a null element to skip next click
                clickedElement = null;
            } else {
                showOsd();
            }
            return true;
        }

        return false;
    }

    function handleHiddenNavigation(e: KeyboardEvent, key: string, btnPlayPause: HTMLElement) {
        if (layoutManager.tv && !currentVisibleMenu) {
            // Change the behavior of some keys when the OSD is hidden
            switch (key) {
                case 'ArrowLeft':
                case 'ArrowRight':
                    if (!e.shiftKey) {
                        e.preventDefault();
                        showOsd(nowPlayingPositionSlider);
                        nowPlayingPositionSlider.dispatchEvent(new KeyboardEvent(e.type, e));
                    }
                    return true;
                case 'Enter':
                    if ((e.target as HTMLElement).tagName !== 'BUTTON') {
                        e.preventDefault();
                        playbackManager.playPause(currentPlayer);
                        showOsd(btnPlayPause);
                    }
                    return true;
            }
        }

        return false;
    }

    function onKeyDownCapture() {
        resetIdle();
    }

    function onWheel(e: WheelEvent) {
        if (getOpenedDialog()) return;
        if (e.deltaY < 0) {
            playbackManager.volumeUp(currentPlayer);
        }
        if (e.deltaY > 0) {
            playbackManager.volumeDown(currentPlayer);
        }
    }

    function onWindowMouseDown(e: MouseEvent) {
        clickedElement = e.target;
        mouseIsDown = true;
        resetIdle();
    }

    function onWindowMouseUp() {
        mouseIsDown = false;
        resetIdle();
    }

    function onWindowDragEnd() {
        // mousedown -> dragstart -> dragend !!! no mouseup :(
        mouseIsDown = false;
        resetIdle();
    }

    let playPauseClickTimeout: ReturnType<typeof setTimeout> | 0 | undefined;
    function onViewHideStopPlayback() {
        if (playbackManager.isPlayingVideo()) {
            shell.disableFullscreen();

            clearTimeout(playPauseClickTimeout);
            const player = currentPlayer;
            view.removeEventListener('viewbeforehide', onViewHideStopPlayback);
            releaseCurrentPlayer();
            void playbackManager.stop(player);
        }
    }

    function enableStopOnBack(enabled: boolean) {
        view.removeEventListener('viewbeforehide', onViewHideStopPlayback);

        if (enabled && playbackManager.isPlayingVideo(currentPlayer)) {
            view.addEventListener('viewbeforehide', onViewHideStopPlayback);
        }
    }

    function updatePlaybackRate(player: PlaybackPlayer) {
        // Restore playback speed control, if it exists in the session.
        const playbackRateSpeed = sessionStorage.getItem('playbackRateSpeed');
        if (playbackRateSpeed !== null) {
            player.setPlaybackRate!(playbackRateSpeed as unknown as number);
        }
    }

    shell.enableFullscreen();

    let currentPlayer: VideoPlayer | null | undefined;
    let comingUpNextDisplayed: boolean | undefined;
    let currentUpNextDialog: InstanceType<typeof import('components/upnextdialog/upnextdialog').default> | null | undefined;
    let isEnabled: boolean | undefined;
    let currentItem: PlaybackItem | undefined;
    let enableProgressByTimeOfDay: boolean | undefined;
    let currentVisibleMenu: 'osd' | 'upnext' | null | undefined;
    let statsOverlay: InstanceType<typeof import('components/playerstats/playerstats').default> | null | undefined;
    let osdHideTimeout: ReturnType<typeof setTimeout> | null | undefined;
    let lastPointerMoveData: { x: number; y: number } | undefined;
    let currentPlayerSupportedCommands: string[] = [];
    let currentRuntimeTicks: number | null = 0;
    let lastUpdateTime = 0;
    let programStartDateMs = 0;
    let programEndDateMs = 0;
    let playbackStartTimeTicks: number | null | undefined = 0;
    let subtitleSyncOverlay: InstanceType<typeof SubtitleSync> | null | undefined;
    let trickplayResolution: TrickplayInfoDto | null = null;
    const nowPlayingVolumeSlider = view.querySelector<VideoSlider>('.osdVolumeSlider')!;
    const nowPlayingVolumeSliderContainer = view.querySelector<HTMLElement>('.osdVolumeSliderContainer')!;
    const nowPlayingPositionSlider = view.querySelector<VideoSlider>('.osdPositionSlider')!;
    const nowPlayingPositionText = view.querySelector<HTMLElement>('.osdPositionText')!;
    const nowPlayingDurationText = view.querySelector<HTMLElement>('.osdDurationText')!;
    const startTimeText = view.querySelector<HTMLElement>('.startTimeText')!;
    const endTimeText = view.querySelector<HTMLElement>('.endTimeText')!;
    const endsAtText = view.querySelector<HTMLElement>('.endsAtText')!;
    const btnRewind = view.querySelector<HTMLButtonElement>('.btnRewind')!;
    const btnFastForward = view.querySelector<HTMLButtonElement>('.btnFastForward')!;
    const headerElement = document.querySelector<HTMLElement>('.skinHeader')!;
    const osdBottomElement = view.querySelector<HTMLElement>('.videoOsdBottom-maincontrols')!;
    const osdVisibility = createOsdVisibility(headerElement, osdBottomElement);

    nowPlayingPositionSlider.enableKeyboardDragging();
    nowPlayingVolumeSlider.enableKeyboardDragging();

    if (layoutManager.tv) {
        nowPlayingPositionSlider.classList.add('focusable');
    }

    nowPlayingDurationText.addEventListener('click', nowPlayingDurationTextClick);

    view.addEventListener('viewbeforeshow', function () {
        headerElement.classList.add('osdHeader');
        setBackdropTransparency(TRANSPARENCY_LEVEL.Full);
    });
    view.addEventListener('viewshow', function () {
        try {
            Events.on(playbackManager, 'playerchange', onPlayerChange);
            bindToPlayer(playbackManager.getCurrentPlayer());
            /* eslint-disable-next-line compat/compat */
            dom.addEventListener(document, window.PointerEvent ? 'pointermove' : 'mousemove', onPointerMove, {
                passive: true
            });
            showOsd();
            inputManager.on(window, onInputCommand);
            document.addEventListener('keydown', onKeyDown);
            dom.addEventListener(document, 'keydown', onKeyDownCapture, {
                capture: true,
                passive: true
            });
            document.addEventListener('wheel', onWheel);
            /* eslint-disable-next-line compat/compat */
            dom.addEventListener(window, window.PointerEvent ? 'pointerdown' : 'mousedown', onWindowMouseDown, {
                capture: true,
                passive: true
            });
            /* eslint-disable-next-line compat/compat */
            dom.addEventListener(window, window.PointerEvent ? 'pointerup' : 'mouseup', onWindowMouseUp, {
                capture: true,
                passive: true
            });

            dom.addEventListener(window, 'dragend', onWindowDragEnd, {
                capture: true,
                passive: true
            });
            if (browser.firefox || browser.edge) {
                dom.addEventListener(document, 'click', onClickCapture, { capture: true });
            }
        } catch {
            setBackdropTransparency(TRANSPARENCY_LEVEL.None); // reset state set in viewbeforeshow
            void appRouter.goHome();
        }
    });
    view.addEventListener('viewbeforehide', function () {
        if (statsOverlay) {
            statsOverlay.enabled(false);
        }

        document.removeEventListener('keydown', onKeyDown);
        dom.removeEventListener(document, 'keydown', onKeyDownCapture, {
            capture: true,
            passive: true
        });
        document.removeEventListener('wheel', onWheel);
        /* eslint-disable-next-line compat/compat */
        dom.removeEventListener(window, window.PointerEvent ? 'pointerdown' : 'mousedown', onWindowMouseDown, {
            capture: true,
            passive: true
        });
        /* eslint-disable-next-line compat/compat */
        dom.removeEventListener(window, window.PointerEvent ? 'pointerup' : 'mouseup', onWindowMouseUp, {
            capture: true,
            passive: true
        });

        dom.removeEventListener(window, 'dragend', onWindowDragEnd, {
            capture: true,
            passive: true
        });
        if (browser.firefox || browser.edge) {
            dom.removeEventListener(document, 'click', onClickCapture, { capture: true });
        }
        stopOsdHideTimer();
        headerElement.classList.remove('osdHeader');
        headerElement.classList.remove('osdHeader-hidden');
        /* eslint-disable-next-line compat/compat */
        dom.removeEventListener(document, window.PointerEvent ? 'pointermove' : 'mousemove', onPointerMove, {
            passive: true
        });
        inputManager.off(window, onInputCommand);
        Events.off(playbackManager, 'playerchange', onPlayerChange);
        releaseCurrentPlayer();
    });
    view.querySelector<HTMLElement>('.btnFullscreen')!.addEventListener('click', function () {
        playbackManager.toggleFullscreen(currentPlayer);
    });
    view.querySelector<HTMLElement>('.btnPip')!.addEventListener('click', function () {
        playbackManager.togglePictureInPicture(currentPlayer);
    });
    view.querySelector<HTMLElement>('.btnAirPlay')!.addEventListener('click', function () {
        playbackManager.toggleAirPlay(currentPlayer);
    });
    view.querySelector<HTMLElement>('.btnVideoOsdSettings')!.addEventListener('click', onSettingsButtonClick);
    view.addEventListener('viewhide', function () {
        osdVisibility.restoreHeader();
    });
    view.addEventListener('viewdestroy', function () {
        destroyStats();
        destroySubtitleSync();
    });
    /* eslint-disable-next-line compat/compat */
    dom.addEventListener(view, window.PointerEvent ? 'pointerdown' : 'click', function (e: PointerEvent) {
        if (dom.parentWithClass(e.target as HTMLElement, ['videoOsdBottom', 'upNextContainer'])) {
            showOsd();
            return;
        }

        const pointerType = e.pointerType || 'mouse';

        if (pointerType === 'mouse') {
            if (!e.button) {
                if (playPauseClickTimeout) {
                    clearTimeout(playPauseClickTimeout);
                    playPauseClickTimeout = 0;
                } else {
                    playPauseClickTimeout = setTimeout(function() {
                        playbackManager.playPause(currentPlayer);
                        showOsd();
                        playPauseClickTimeout = 0;
                    }, 300);
                }
            }
        } else {
            playbackManager.playPause(currentPlayer);
            showOsd();
        }
    }, {
        passive: true
    });

    dom.addEventListener(view, 'dblclick', (e: MouseEvent) => {
        if (e.target !== view) return;
        playbackManager.toggleFullscreen(currentPlayer);
    });

    view.querySelector<HTMLElement>('.buttonMute')!.addEventListener('click', function () {
        playbackManager.toggleMute(currentPlayer);
    });

    nowPlayingVolumeSlider.addEventListener('input', (e) => {
        playbackManager.setVolume((e.target as HTMLInputElement).value as unknown as number, currentPlayer);
    });

    nowPlayingPositionSlider.addEventListener('change', function () {
        const player = currentPlayer;

        if (player) {
            const newPercent = parseFloat(this.value as string);

            if (enableProgressByTimeOfDay) {
                let seekAirTimeTicks = newPercent / 100 * (programEndDateMs - programStartDateMs) * TICKS_PER_MILLISECOND;
                seekAirTimeTicks += TICKS_PER_MILLISECOND * programStartDateMs;
                seekAirTimeTicks -= playbackStartTimeTicks!;
                playbackManager.seek(seekAirTimeTicks, player);
            } else {
                playbackManager.seekPercent(newPercent, player);
            }
        }
    });

    nowPlayingPositionSlider.addEventListener('keydown', function (e) {
        if (e.defaultPrevented) return;

        const key = keyboardnavigation.getKeyName(e);
        if (key === 'Enter') {
            playbackManager.playPause(currentPlayer);
        }
    });

    nowPlayingPositionSlider.updateBubbleHtml = function(bubble, value) {
        showOsd();

        const item = currentItem;
        const ticks = currentRuntimeTicks! * value / 100;

        if (trickplayResolution && item?.Trickplay) {
            return updateTrickplayBubbleHtml(
                ServerConnections.getApiClient(item.ServerId!)!,
                trickplayResolution,
                item,
                currentPlayer!.streamInfo!.mediaSource!.Id!,
                bubble,
                ticks);
        }

        return false;
    };

    nowPlayingPositionSlider.getBubbleHtml = function (value) {
        showOsd();
        if (enableProgressByTimeOfDay) {
            if (programStartDateMs && programEndDateMs) {
                let ms = programEndDateMs - programStartDateMs;
                ms /= 100;
                ms *= value;
                ms += programStartDateMs;
                return '<h1 class="sliderBubbleText">' + getDisplayTimeWithoutAmPm(new Date(parseInt(ms as unknown as string, 10)), true) + '</h1>';
            }

            return '--:--';
        }

        if (!currentRuntimeTicks) {
            return '--:--';
        }

        let ticks = currentRuntimeTicks;
        ticks /= 100;
        ticks *= value;
        const item = currentItem;

        if (item?.Chapters?.length) {
            const html = getChapterBubbleHtml(ServerConnections.getApiClient(item.ServerId!)!, item, item.Chapters, ticks, currentPlayer);

            if (html) {
                return html;
            }
        }

        return '<h1 class="sliderBubbleText">' + datetime.getDisplayRunningTime(ticks) + '</h1>';
    };

    let markerChapters: PlaybackItem['Chapters'];
    let markerRuntimeTicks: PlaybackItem['RunTimeTicks'];
    let markerInfo: { name?: string | null; progress: number }[] = [];
    nowPlayingPositionSlider.getMarkerInfo = function () {
        const chapters = currentItem?.Chapters;
        const runtimeTicks = currentItem?.RunTimeTicks;
        if (markerChapters !== chapters || markerRuntimeTicks !== runtimeTicks) {
            markerChapters = chapters;
            markerRuntimeTicks = runtimeTicks;
            markerInfo = chapters?.map(currentChapter => ({
                name: currentChapter.Name,
                progress: currentChapter.StartPositionTicks! / runtimeTicks!
            })) || [];
        }
        return markerInfo;
    };

    view.querySelector<HTMLButtonElement>('.btnPreviousTrack')!.addEventListener('click', function () {
        playbackManager.previousTrack(currentPlayer);
    });
    view.querySelector<HTMLElement>('.btnPreviousChapter')!.addEventListener('click', function () {
        playbackManager.previousChapter(currentPlayer);
    });
    view.querySelector<HTMLElement>('.btnPause')!.addEventListener('click', function () {
        playbackManager.playPause(currentPlayer);
    });
    view.querySelector<HTMLElement>('.btnNextChapter')!.addEventListener('click', function () {
        playbackManager.nextChapter(currentPlayer);
    });
    view.querySelector<HTMLButtonElement>('.btnNextTrack')!.addEventListener('click', function () {
        playbackManager.nextTrack(currentPlayer);
    });
    btnRewind.addEventListener('click', function () {
        playbackManager.rewind(currentPlayer);
    });
    btnFastForward.addEventListener('click', function () {
        playbackManager.fastForward(currentPlayer);
    });
    view.querySelector<HTMLElement>('.btnAudio')!.addEventListener('click', showAudioTrackSelection);
    view.querySelector<HTMLElement>('.btnSubtitles')!.addEventListener('click', showSubtitleTrackSelection);

    // HACK: Remove `emby-button` from the rating button to make it look like the other buttons
    view.querySelector<HTMLElement & { setItem(item: PlaybackItem | null): void }>('.btnUserRating')!.classList.remove('emby-button');
}
