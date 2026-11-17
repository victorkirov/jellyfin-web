import { bindActionFocus } from './actionFocus';
import focusManager from 'lib/focusManager';
import { appRouter } from 'components/router/appRouter';
import { reloadFromItem, setInitialCollapsibleState } from './page';
import { clearDeferredDetails, renderCast, renderGuestCast } from './relatedSections';
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

    function renderItem(item: ItemDto, user: UserDto) {
        currentItem = item;
        nextUpEpisode = undefined;
        reloadFromItem(self, view, params, item, user, episode => {
            if (currentItem !== item) return;
            // Only advertise an episode identity verified by the existing Next Up response.
            nextUpEpisode = episode?.Type === 'Episode' && episode.SeriesId === item.Id
                && episode.Id && episode.ParentIndexNumber != null && episode.IndexNumber != null ? episode : undefined;
            reloadPlayButtons(view, currentItem, nextUpEpisode);
        });
    }

    function reload() {
        loading.show();
        getElement(view, '.detailLoadError').classList.add('hide');
        getElement(view, '.detailPageWrapperContainer').classList.add('hide');
        getElement(view, '.detailLogo').classList.add('hide');
        currentItem = null;
        nextUpEpisode = undefined;
        unmount(self);
        clearDeferredDetails(view);

        const apiClient = getApiClient();

        Promise.all([getPromise(apiClient, params), apiClient.getCurrentUser()]).then(([item, user]) => {
            getElement(view, '.detailPageWrapperContainer').classList.remove('hide');
            renderItem(item, user);
        }).catch((error) => {
            currentItem = null;
            getElement(view, '.detailPageWrapperContainer').classList.add('hide');
            getElement(view, '.detailLoadError').classList.remove('hide');
            loading.hide();
            focusManager.focus(getElement(view, '.btnRetry'));
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
        void playbackManager.play(options as unknown as PlaybackOptions);
    }

    function playTrailer() {
        void playbackManager.playTrailers(currentItem!);
    }

    function playCurrentItem(button: HTMLElement, mode: string | null) {
        const item = currentItem;
        if (!item) return;

        if (item.Type === 'Program') {
            const apiClient = ServerConnections.getApiClient(item.ServerId)!;
            void apiClient.getLiveTvChannel(item.ChannelId!, apiClient.getCurrentUserId()).then(function (channel) {
                void playbackManager.play({
                    items: [channel]
                });
            });
            return;
        }

        const target = item.Type === 'Series' && nextUpEpisode ? nextUpEpisode : item;
        playItem(target, mode === ItemAction.Resume ? (target.UserData?.PlaybackPositionTicks || 0) : 0);
    }

    function onPlayClick(event: Event) {
        let actionElem = event.currentTarget as HTMLElement;
        let action = actionElem.getAttribute('data-action');

        if (!action) {
            actionElem = getElement(actionElem, '[data-action]') || actionElem;
            action = actionElem.getAttribute('data-action');
        }

        playCurrentItem(actionElem, action);
    }

    function onInstantMixClick() {
        playbackManager.instantMix(currentItem!);
    }

    function onShuffleClick() {
        void playbackManager.shuffle(currentItem!);
    }

    function onPlayTrailerClick() {
        playTrailer();
    }

    function onMoreCommandsClick(event: Event) {
        const button = event.currentTarget as HTMLElement;
        const selectedItem = getElement(view, '.selectSource').value || currentItem!.Id;

        const apiClient = getApiClient();

        void apiClient.getItem(apiClient.getCurrentUserId(), selectedItem!).then(function (item) {
            void apiClient.getCurrentUser().then(function (user) {
                itemContextMenu.show(getContextMenuOptions(item, user, button))
                    .catch(() => { /* no-op */ });
            });
        });
    }

    function onPlayerChange() {
        if (!currentItem) return;
        renderTrackSelections(view, self, currentItem!);
        setTrailerButtonVisibility(view, currentItem!);
    }

    function onUserDataChanged({ Data }: UserDataChangedMessage) {
        const apiClient = getApiClient();

        if (!currentItem || Data?.UserId != apiClient.getCurrentUserId()) return;

        // Match by item id: alternate versions share the same user data key, so a key match
        // would apply another version's progress to the displayed item.
        const changes = Data.UserDataList ?? [];
        const userData = changes.find(update => update.ItemId === currentItem!.Id);
        const nextUpChanged = nextUpEpisode && changes.some(update => update.ItemId === nextUpEpisode!.Id);

        if (userData || nextUpChanged) {
            if (userData) currentItem = { ...currentItem, UserData: userData };
            // Generic series playback resolves the live Next Up instead of using stale data.
            nextUpEpisode = undefined;
            reloadPlayButtons(view, currentItem);
            reloadUserDataButtons(view, currentItem);
            autoFocus(view);
        }
    }

    let currentItem: ItemDto | null | undefined;
    let nextUpEpisode: ItemDto | undefined;

    function init() {
        const apiClient = getApiClient();

        self._unmount = [];
        const unbindActionFocus = bindActionFocus(view);
        bindAll(view, '.btnRetry', 'click', reload);
        bindAll(view, '.btnDetailsBack', 'click', () => {
            void appRouter.back();
        });

        bindAll(view, '.btnPlay', 'click', onPlayClick);
        bindAll(view, '.btnReplay', 'click', onPlayClick);
        bindAll(view, '.btnInstantMix', 'click', onInstantMixClick);
        bindAll(view, '.btnShuffle', 'click', onShuffleClick);
        bindAll(view, '.btnPlayTrailer', 'click', onPlayTrailerClick);
        getElement(view, '.trackSelections').addEventListener('submit', onTrackSelectionsSubmit);
        bindAll(view, '.btnMoreCommands', 'click', onMoreCommandsClick);
        getElement(view, '.selectSource').addEventListener('change', function () {
            renderVideoSelections(view, self._currentPlaybackMediaSources!);
            renderAudioSelections(view, self._currentPlaybackMediaSources!);
            renderSubtitleSelections(view, self._currentPlaybackMediaSources!);
            refreshSelectedVersion();
        });
        view.addEventListener('viewshow', function (e) {
            const page = view;

            libraryMenu.setTransparentMenu(true);

            if ((e as CustomEvent<{ isRestored?: boolean }>).detail.isRestored) {
                if (currentItem) {
                    libraryMenu.setTitle('');
                    nextUpEpisode = undefined;
                    reloadPlayButtons(view, currentItem);
                    renderTrackSelections(page, self, currentItem, true);
                    renderBackdrop(page, currentItem);
                    refreshSelectedVersion();
                }
            } else {
                reload();
            }

            self._unsubscribeUserData = apiClient.subscribe!(
                [OutboundWebSocketMessageType.UserDataChanged],
                onUserDataChanged
            );
            Events.on(playbackManager, 'playerchange', onPlayerChange);

            itemShortcuts.on(getElement(view, '.nameContainer'));
        });
        view.addEventListener('viewbeforehide', function () {
            itemShortcuts.off(getElement(view, '.nameContainer'));
            self._unsubscribeUserData?.();
            self._unsubscribeUserData = null;
            Events.off(playbackManager, 'playerchange', onPlayerChange);
            libraryMenu.setTransparentMenu(false);
        });
        view.addEventListener('viewdestroy', function () {
            unbindActionFocus();
            unmount(self);
            clearDeferredDetails(view);

            currentItem = null;
            self._currentPlaybackMediaSources = null;
        });
    }

    function refreshSelectedVersion() {
        if (!currentItem) return;
        const selectedId = getElement(view, '.selectSource').value || currentItem!.Id;

        const apiClient = ServerConnections.getApiClient(currentItem.ServerId)!;
        const api = ServerConnections.getApi(currentItem.ServerId);
        if (!api) {
            console.error('[ItemDetails] no Api instance available for server', currentItem.ServerId);
            return;
        }

        Promise.all([
            queryClient.fetchQuery({
                ...getItemQuery(api, selectedId!, apiClient.getCurrentUserId()),
                // Restored views must reflect playback and mutations while hidden.
                staleTime: 0
            }),
            apiClient.getCurrentUser()
        ]).then(function ([versionItem, user]) {
            if ((getElement(view, '.selectSource').value || currentItem?.Id) !== selectedId) {
                return;
            }

            const sameItem = versionItem.Id === currentItem!.Id;
            currentItem = versionItem;
            if (sameItem) {
                reloadPlayButtons(view, currentItem, nextUpEpisode);
                reloadUserDataButtons(view, currentItem);
                return;
            }
            renderItem(versionItem, user);
            renderVideoSelections(view, self._currentPlaybackMediaSources!);
            renderAudioSelections(view, self._currentPlaybackMediaSources!);
            renderSubtitleSelections(view, self._currentPlaybackMediaSources!);
        }).catch(function (err) {
            console.error('failed to load alternate version item', err);
        });
    }

    init();
}
