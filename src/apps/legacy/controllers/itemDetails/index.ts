import { requestActionBarLayout } from './actionBarLayout';
import { bindActionFocus } from './actionFocus';
import focusManager from 'lib/focusManager';
import { appRouter } from 'components/router/appRouter';
import { reloadFromItem, setInitialCollapsibleState } from './page';
import { clearDeferredDetails, pauseDeferredDetails, resumeDeferredDetails, renderCast, renderGuestCast, renderNextUp } from './relatedSections';
import { renderDetails } from './metadata';
import { renderBackdrop } from './artwork';
import { getContextMenuOptions, reloadPlayButtons, reloadUserDataButtons, setTrailerButtonVisibility } from './actions';
import { renderTrackSelections, renderVideoSelections, renderAudioSelections, renderSubtitleSelections } from './tracks';
import { autoFocus, unmount } from './common';
import { type ConnectionClient } from 'lib/jellyfin-apiclient/connectionTypes';
import { OutboundWebSocketMessageType } from '@jellyfin/sdk/lib/websocket';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { queryClient } from 'utils/query/queryClient';
import { getItemQuery } from 'hooks/useItem';
import { ItemAction } from 'constants/itemAction';
import { playbackManager } from 'components/playback/playbackmanager';
import { type PlaybackOptions } from 'lib/playback/types';
import { type MediaSourceInfo, type UserDataChangedMessage, type UserDto } from '@jellyfin/sdk/lib/generated-client';
import { type ItemDto, type DetailsPage, type DetailsController, type DetailsParams, getElement, queryAll } from './types';

import itemContextMenu from 'components/itemContextMenu';
import loading from 'components/loading/loading';
import toast from 'components/toast/toast';
import globalize from 'lib/globalize';
import itemShortcuts from 'components/shortcuts';
import libraryMenu from 'scripts/libraryMenu';
import Events from 'utils/events';

import 'components/itemscontainer/emby-itemscontainer';
import 'elements/emby-checkbox/emby-checkbox';
import 'components/buttons/emby-button';
import 'components/buttons/emby-playstatebutton';
import 'components/buttons/emby-ratingbutton';
import 'elements/emby-scroller/emby-scroller';
import 'components/select/emby-select';

import 'styles/scrollstyles.scss';
import './index.scss';

function getPromise(apiClient: ConnectionClient, params: DetailsParams) {
    const id = params.id;

    if (id) {
        return queryClient.fetchQuery(getItemQuery(
            ServerConnections.getApi(params.serverId), id, apiClient.getCurrentUserId()
        ));
    }

    if (params.genre) {
        return apiClient.getGenre(params.genre, apiClient.getCurrentUserId());
    }

    if (params.musicgenre) {
        return apiClient.getMusicGenre(params.musicgenre, apiClient.getCurrentUserId());
    }

    if (params.musicartist) {
        return apiClient.getArtist(params.musicartist, apiClient.getCurrentUserId());
    }

    throw new Error('Invalid request');
}

class ItemDetailPage {
    setInitialCollapsibleState!: typeof setInitialCollapsibleState;
    renderDetails!: typeof renderDetails;
    renderCast!: typeof renderCast;
    renderGuestCast!: typeof renderGuestCast;
    constructor() {
        this.setInitialCollapsibleState = setInitialCollapsibleState;
        this.renderDetails = renderDetails;
        this.renderCast = renderCast;
        this.renderGuestCast = renderGuestCast;
    }
}

declare global { interface Window { ItemDetailPage: ItemDetailPage } }

function bindAll(view: DetailsPage, selector: string, eventName: string, fn: EventListener) {
    const elems = queryAll(view, selector);

    for (const elem of elems) {
        elem.addEventListener(eventName, fn);
    }
}

function onTrackSelectionsSubmit(e: Event) {
    e.preventDefault();
    return false;
}

window.ItemDetailPage = new ItemDetailPage();

export default class ItemDetails implements DetailsController {
    _unmount: (() => void)[] = [];
    _currentPlaybackMediaSources?: MediaSourceInfo[] | null;
    _unsubscribeUserData?: (() => void) | null;
    constructor(view: DetailsPage, params: DetailsParams) {
        initializeDetails(this, view, params);
    }
}

function initializeDetails(self: DetailsController, view: DetailsPage, params: DetailsParams) {
    function getApiClient() {
        return (params.serverId ? ServerConnections.getApiClient(params.serverId)! : ServerConnections.currentApiClient())!;
    }

    function refreshNextUp() {
        const item = currentItem;
        if (item?.Type !== 'Series') return;
        const request = ++nextUpRequest;
        nextUpEpisode = undefined;
        reloadPlayButtons(view, item);
        requestActionBarLayout(view);
        renderNextUp(view, item, { Id: getApiClient().getCurrentUserId() }, episode => {
            // Only advertise an episode identity verified by the latest Next Up response.
            nextUpEpisode = episode?.Type === 'Episode' && episode.SeriesId === item.Id
                && episode.Id && episode.ParentIndexNumber != null && episode.IndexNumber != null ? episode : undefined;
            nextUpItemId = nextUpEpisode?.Id || undefined;
            reloadPlayButtons(view, currentItem!, nextUpEpisode);
            requestActionBarLayout(view);
        }, () => active && !destroyed && request === nextUpRequest && currentItem?.Id === item.Id);
    }

    function renderItem(item: ItemDto, user: UserDto) {
        const generation = ++renderGeneration;
        const isCurrent = () => active && !destroyed && generation === renderGeneration;
        view.detailsIsCurrent = isCurrent;
        view.retryChildren = undefined;
        if (currentItem?.Id !== item.Id) {
            nextUpEpisode = undefined;
            nextUpItemId = undefined;
        }
        currentItem = item;
        reloadFromItem(self, view, params, item, user, refreshNextUp, isCurrent);
    }

    function reload() {
        if (!active || destroyed) return Promise.resolve();
        const request = ++initialRequest;
        versionRequest++;
        renderGeneration++;
        loadingVisible = true;
        loading.show();
        getElement(view, '.detailLoadError').classList.add('hide');
        getElement(view, '.detailPageWrapperContainer').classList.add('hide');
        getElement(view, '.detailLogo').classList.add('hide');
        currentItem = null;
        nextUpEpisode = undefined;
        nextUpItemId = undefined;
        nextUpRequest++;
        unmount(self);
        clearDeferredDetails(view);

        const apiClient = getApiClient();

        return Promise.resolve().then(() => Promise.all([getPromise(apiClient, params), apiClient.getCurrentUser()])).then(([item, user]) => {
            if (!active || destroyed || request !== initialRequest) return;
            if (params.id && item.Id?.replace(/-/g, '').toLowerCase() !== params.id.replace(/-/g, '').toLowerCase()) {
                throw new Error('Requested title was not returned');
            }
            getElement(view, '.detailPageWrapperContainer').classList.remove('hide');
            renderItem(item, user);
            loadingVisible = false;
        }).catch((error) => {
            if (!active || destroyed || request !== initialRequest) return;
            currentItem = null;
            getElement(view, '.detailPageWrapperContainer').classList.add('hide');
            getElement(view, '.detailLoadError').classList.remove('hide');
            hideLoading();
            focusManager.focus(getElement(view, '.btnDetailsBack'));
            console.error('failed to get item or current user: ', error);
        });
    }

    function getPlayOptions(startPosition: number) {
        const audioStreamIndex = getElement(view, '.selectAudio').value || null;
        return {
            startPositionTicks: startPosition,
            mediaSourceId: getElement(view, '.selectSource').value,
            audioStreamIndex: audioStreamIndex,
            subtitleStreamIndex: getElement(view, '.selectSubtitles').value
        };
    }

    function playItem(item: ItemDto, startPosition: number) {
        const playOptions = getPlayOptions(startPosition);
        const options = { ...playOptions, items: [item] };
        // Legacy selects intentionally pass string stream indexes; playback normalizes them.
        return playbackManager.play(options as unknown as PlaybackOptions);
    }

    function playTrailer() {
        if (currentItem) return playbackManager.playTrailers(currentItem);
    }

    function playCurrentItem(mode: string | null) {
        const item = currentItem;
        if (!item) return;

        if (item.Type === 'Program') {
            const apiClient = ServerConnections.getApiClient(item.ServerId)!;
            return apiClient.getLiveTvChannel(item.ChannelId!, apiClient.getCurrentUserId()).then(function (channel) {
                return playbackManager.play({
                    items: [channel]
                });
            });
            return;
        }

        const target = item.Type === 'Series' && nextUpEpisode ? nextUpEpisode : item;
        return playItem(target, mode === ItemAction.Resume ? (target.UserData?.PlaybackPositionTicks || 0) : 0);
    }

    function onPlayClick(event: Event) {
        let actionElem = event.currentTarget as HTMLElement;
        let action = actionElem.getAttribute('data-action');

        if (!action) {
            actionElem = getElement(actionElem, '[data-action]') || actionElem;
            action = actionElem.getAttribute('data-action');
        }

        return playCurrentItem(action);
    }

    function onInstantMixClick() {
        if (currentItem) return playbackManager.instantMix(currentItem);
    }

    function onShuffleClick() {
        if (currentItem) return playbackManager.shuffle(currentItem);
    }

    function onPlayTrailerClick() {
        return playTrailer();
    }

    function onMoreCommandsClick(event: Event) {
        const button = event.currentTarget as HTMLElement;
        const selectedItem = getElement(view, '.selectSource').value || currentItem!.Id;

        const apiClient = getApiClient();

        const isCurrent = view.detailsIsCurrent || (() => false);
        return Promise.all([
            apiClient.getItem(apiClient.getCurrentUserId(), selectedItem!),
            apiClient.getCurrentUser()
        ]).then(([item, user]) => {
            if (isCurrent()) return itemContextMenu.show(getContextMenuOptions(item, user, button));
        });
    }

    function onActionError(error: unknown) {
        // Action sheets reject without an error when dismissed.
        if (!error) return;
        console.error('Failed to perform details action', error);
        toast(globalize.translate('ErrorDefault'));
    }

    function bindAction(selector: string, action: (event: Event) => unknown) {
        bindAll(view, selector, 'click', event => {
            try {
                void Promise.resolve(action(event)).catch(onActionError);
            } catch (error) {
                onActionError(error);
            }
        });
    }

    function onPlayerChange() {
        if (!currentItem) return;
        renderTrackSelections(view, self, currentItem!);
        setTrailerButtonVisibility(view, currentItem!);
        requestActionBarLayout(view);
    }

    function onUserDataChanged({ Data }: UserDataChangedMessage) {
        const apiClient = getApiClient();

        if (!currentItem || Data?.UserId != apiClient.getCurrentUserId()) return;

        // Match by item id: alternate versions share the same user data key, so a key match
        // would apply another version's progress to the displayed item.
        const changes = Data.UserDataList ?? [];
        const userData = changes.find(update => update.ItemId === currentItem!.Id);
        const nextUpChanged = nextUpItemId && changes.some(update => update.ItemId === nextUpItemId);

        if (userData || nextUpChanged) {
            const previous = currentItem.UserData;
            const playbackChanged = userData && (
                (userData.Played !== undefined && !!userData.Played !== !!previous?.Played)
                || (userData.PlaybackPositionTicks !== undefined && (userData.PlaybackPositionTicks || 0) !== (previous?.PlaybackPositionTicks || 0))
                || (userData.UnplayedItemCount !== undefined && userData.UnplayedItemCount !== previous?.UnplayedItemCount)
            );
            if (userData) currentItem = { ...currentItem, UserData: { ...previous, ...userData } };
            if (currentItem.Type === 'Series' && (playbackChanged || nextUpChanged)) refreshNextUp();
            else reloadPlayButtons(view, currentItem, nextUpEpisode);
            reloadUserDataButtons(view, currentItem);
            requestActionBarLayout(view);
            autoFocus(view, view.detailsIsCurrent);
        }
    }

    let currentItem: ItemDto | null | undefined;
    let nextUpEpisode: ItemDto | undefined;
    let nextUpItemId: string | undefined;
    let nextUpRequest = 0;
    let initialRequest = 0;
    let versionRequest = 0;
    let renderGeneration = 0;
    let active = false;
    let destroyed = false;
    let loadingVisible = false;

    function hideLoading() {
        if (!loadingVisible) return;
        loadingVisible = false;
        loading.hide();
    }

    function invalidateLoads() {
        active = false;
        initialRequest++;
        versionRequest++;
        nextUpRequest++;
        hideLoading();
        pauseDeferredDetails(view);
    }

    function init() {
        const apiClient = getApiClient();

        self._unmount = [];
        const unbindActionFocus = bindActionFocus(view);
        const onActionLabelChange = () => requestActionBarLayout(view);
        view.addEventListener('detailactionlabelchange', onActionLabelChange);
        bindAll(view, '.btnRetry', 'click', () => {
            void reload();
        });
        bindAll(view, '.btnDetailsBack', 'click', () => {
            void appRouter.back();
        });

        bindAction('.btnPlay', onPlayClick);
        bindAction('.btnReplay', onPlayClick);
        bindAction('.btnInstantMix', onInstantMixClick);
        bindAction('.btnShuffle', onShuffleClick);
        bindAction('.btnPlayTrailer', onPlayTrailerClick);
        getElement(view, '.trackSelections').addEventListener('submit', onTrackSelectionsSubmit);
        bindAction('.btnMoreCommands', onMoreCommandsClick);
        getElement(view, '.selectSource').addEventListener('change', function () {
            renderVideoSelections(view, self._currentPlaybackMediaSources!);
            renderAudioSelections(view, self._currentPlaybackMediaSources!);
            renderSubtitleSelections(view, self._currentPlaybackMediaSources!);
            void refreshSelectedVersion();
        });
        view.addEventListener('viewshow', function (e) {
            if (destroyed) return;
            active = true;
            const generation = renderGeneration;
            view.detailsIsCurrent = () => active && !destroyed && generation === renderGeneration;
            const page = view;

            libraryMenu.setTransparentMenu(true);

            if ((e as CustomEvent<{ isRestored?: boolean }>).detail.isRestored) {
                if (currentItem) {
                    libraryMenu.setTitle('');
                    if (currentItem.Type === 'Series') {
                        refreshNextUp();
                    } else {
                        reloadPlayButtons(view, currentItem);
                        requestActionBarLayout(view);
                    }
                    renderTrackSelections(page, self, currentItem, true);
                    renderBackdrop(page, currentItem);
                    resumeDeferredDetails(view);
                    view.retryChildren?.();
                    void refreshSelectedVersion();
                } else {
                    void reload();
                }
            } else {
                void reload();
            }

            self._unsubscribeUserData = apiClient.subscribe!(
                [OutboundWebSocketMessageType.UserDataChanged],
                onUserDataChanged
            );
            Events.on(playbackManager, 'playerchange', onPlayerChange);

            itemShortcuts.on(getElement(view, '.nameContainer'));
        });
        view.addEventListener('viewbeforehide', function () {
            invalidateLoads();
            itemShortcuts.off(getElement(view, '.nameContainer'));
            self._unsubscribeUserData?.();
            self._unsubscribeUserData = null;
            Events.off(playbackManager, 'playerchange', onPlayerChange);
            libraryMenu.setTransparentMenu(false);
        });
        view.addEventListener('viewdestroy', function () {
            destroyed = true;
            invalidateLoads();
            renderGeneration++;
            clearDeferredDetails(view);
            view.retryChildren = undefined;
            unbindActionFocus();
            view.removeEventListener('detailactionlabelchange', onActionLabelChange);
            unmount(self);

            currentItem = null;
            self._currentPlaybackMediaSources = null;
        });
    }

    function refreshSelectedVersion() {
        if (!currentItem || !active || destroyed) return Promise.resolve();
        const request = ++versionRequest;
        const selectedId = getElement(view, '.selectSource').value || currentItem!.Id;

        const apiClient = ServerConnections.getApiClient(currentItem.ServerId)!;
        const api = ServerConnections.getApi(currentItem.ServerId);
        if (!api) {
            console.error('[ItemDetails] no Api instance available for server', currentItem.ServerId);
            return;
        }

        return Promise.all([
            queryClient.fetchQuery({
                ...getItemQuery(api, selectedId!, apiClient.getCurrentUserId()),
                // Restored views must reflect playback and mutations while hidden.
                staleTime: 0
            }),
            apiClient.getCurrentUser()
        ]).then(function ([versionItem, user]) {
            if (!active || destroyed || request !== versionRequest || !currentItem || (getElement(view, '.selectSource').value || currentItem.Id) !== selectedId) {
                return;
            }

            const sameItem = versionItem.Id === currentItem!.Id;
            if (sameItem) {
                currentItem = versionItem;
                reloadPlayButtons(view, currentItem, nextUpEpisode);
                reloadUserDataButtons(view, currentItem);
                requestActionBarLayout(view);
                return;
            }
            renderItem(versionItem, user);
            if (self._currentPlaybackMediaSources?.length) {
                renderVideoSelections(view, self._currentPlaybackMediaSources);
                renderAudioSelections(view, self._currentPlaybackMediaSources);
                renderSubtitleSelections(view, self._currentPlaybackMediaSources);
            }
        }).catch(function (err) {
            if (!active || destroyed || request !== versionRequest) return;
            console.error('failed to load alternate version item', err);
        });
    }

    init();
}
