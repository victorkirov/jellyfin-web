import { enableScrollX } from './relatedSections';
import { autoFocus, hideAll } from './common';
import { type UserDto } from '@jellyfin/sdk/lib/generated-client';
import { type ItemDto } from 'types/base/models/item-dto';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { playbackManager } from 'components/playback/playbackmanager';
import { getPortraitShape, getSquareShape } from 'components/cardbuilder/utils/shape';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ItemAction } from 'constants/itemAction';
import { type DetailCardOptions, type DetailListOptions, type DetailsPage, type CollectionType, getElement, queryAll } from './types';
import isEqual from 'lodash-es/isEqual';

import cardBuilder from 'components/cardbuilder/cardBuilder';
import imageLoader from 'components/images/imageLoader';
import listView from 'components/listview/listview';
import globalize from 'lib/globalize';

const LIST_VIEW_TYPES: BaseItemKind[] = [BaseItemKind.MusicAlbum, BaseItemKind.Playlist, BaseItemKind.Season, BaseItemKind.Series];

export function renderChildren(page: DetailsPage, item: ItemDto) {
    const renderIsCurrent = page.detailsIsCurrent || (() => true);
    const retry = () => renderChildren(page, item);
    page.retryChildren = retry;
    const isCurrent = () => renderIsCurrent() && page.retryChildren === retry;
    const childrenCollapsible = getElement(page, LIST_VIEW_TYPES.includes(item.Type as BaseItemKind) ? '#listChildrenCollapsible' : '#childrenCollapsible');
    const childrenItemsContainer = getElement(childrenCollapsible, '.itemsContainer');

    const fields = 'ItemCounts,PrimaryImageAspectRatio,CanDelete,MediaSourceCount';
    const query: Record<string, string | boolean | null | undefined> = {
        ParentId: item.Id!,
        Fields: fields
    };

    if (item.Type == 'MusicAlbum') {
        query.SortBy = 'ParentIndexNumber,IndexNumber,SortName';
    } else if (item.Type !== 'BoxSet') {
        query.SortBy = 'SortName';
    }

    let promise;
    const apiClient = ServerConnections.getApiClient(item.ServerId)!;
    const userId = apiClient.getCurrentUserId();

    if (item.Type == 'Series') {
        promise = apiClient.getSeasons(item.Id!, {
            userId: userId,
            Fields: fields
        });
    } else if (item.Type == 'Season') {
        promise = apiClient.getEpisodes(item.SeriesId!, {
            seasonId: item.Id!,
            userId: userId,
            Fields: fields
        });
    } else if (item.Type == 'MusicArtist') {
        query.SortBy = 'PremiereDate,ProductionYear,SortName';
    }

    promise = promise || apiClient.getItems(apiClient.getCurrentUserId(), query);
    void promise.then(function (result) {
        if (!isCurrent()) return;
        let html = '';
        let scrollX: boolean | undefined = false;
        let isList: boolean | undefined = false;

        if (item.Type == 'MusicAlbum') {
            html = getAlbumTracks(item, result.Items!);
            isList = true;
        } else if (item.Type == 'Series') {
            scrollX = enableScrollX();
            html = cardBuilder.getCardsHtml({
                items: result.Items!,
                shape: 'overflowPortrait',
                showTitle: true,
                centerText: true,
                lazy: true,
                overlayPlayButton: true,
                allowBottomPadding: !scrollX
            } as DetailCardOptions);
        } else if (item.Type == 'Season' || item.Type == 'Episode') {
            if (item.Type !== 'Episode') {
                isList = true;
            }
            scrollX = item.Type == 'Episode';
            if (result.Items!.length < 2 && item.Type === 'Episode') {
                return;
            }

            if (item.Type === 'Episode') {
                html = cardBuilder.getCardsHtml({
                    items: result.Items!,
                    shape: 'overflowBackdrop',
                    showTitle: true,
                    displayAsSpecial: (item.Type as string) == 'Season' && item.IndexNumber,
                    playFromHere: true,
                    overlayText: true,
                    lazy: true,
                    showDetailsMenu: true,
                    overlayPlayButton: true,
                    allowBottomPadding: !scrollX,
                    includeParentInfoInTitle: false
                } as DetailCardOptions);
            } else if (item.Type === 'Season') {
                html = listView.getListViewHtml({
                    items: result.Items!,
                    showIndexNumber: false,
                    enableOverview: false,
                    enablePlayedButton: true,
                    infoButton: true,
                    imageSize: 'episode',
                    enableSideMediaInfo: false,
                    highlight: false,
                    action: ItemAction.Link,
                    imagePlayButton: true,
                    includeParentInfoInTitle: false
                } as DetailListOptions);
            }
        }

        fillChildContainer(page, item, result.Items!, childrenCollapsible, childrenItemsContainer, { html, scrollX, isList });
        page.retryChildren = undefined;
    }).catch(error => { if (isCurrent()) console.error('failed to load details children', error); });

    let childrenTitle = globalize.translate('Items');
    if (item.Type == 'Season') {
        childrenTitle = globalize.translate('Episodes');
    } else if (item.Type == 'Series') {
        childrenTitle = globalize.translate('HeaderSeasons');
    } else if (item.Type == 'MusicAlbum') {
        childrenTitle = globalize.translate('HeaderTracks');
    }
    queryAll(childrenCollapsible, '.sectionTitle > span').forEach(el => {
        el.innerText = childrenTitle;
    });

    if (item.Type == 'MusicAlbum' || item.Type == 'Season') {
        getElement(childrenCollapsible, '.sectionTitle').classList.add('hide');
        childrenCollapsible.classList.add('verticalSection-extrabottompadding');
    } else {
        getElement(childrenCollapsible, '.sectionTitle').classList.remove('hide');
    }
}

export function renderItemsByName(page: DetailsPage, item: ItemDto, user: UserDto) {
    const isCurrent = page.detailsIsCurrent || (() => true);
    void import('scripts/itemsByName').then(({ default: ItemsByName }) => {
        if (!isCurrent()) return;
        ItemsByName.renderItems(page, item, user);
    }).catch(error => { if (isCurrent()) console.error('failed to load details children', error); });
}

export function renderPlaylistItems(page: DetailsPage, item: ItemDto) {
    const isCurrent = page.detailsIsCurrent || (() => true);
    void import('scripts/playlistViewer').then(({ default: PlaylistViewer }) => {
        if (!isCurrent()) return;
        PlaylistViewer.render(page, item);
    }).catch(error => { if (isCurrent()) console.error('failed to load details children', error); });
}

export function filterItemsByCollectionItemType(items: ItemDto[], typeInfo: CollectionType) {
    const filteredItems: ItemDto[] = [];
    const leftoverItems: ItemDto[] = [];
    items.forEach(function(item) {
        if ((typeInfo.mediaType && item.MediaType == typeInfo.mediaType) || (item.Type == typeInfo.type)) {
            filteredItems.push(item);
        } else {
            leftoverItems.push(item);
        }
    });
    return [filteredItems, leftoverItems];
}

export function canPlaySomeItemInCollection(items: ItemDto[]) {
    let i = 0;

    for (let length = items.length; i < length; i++) {
        if (playbackManager.canPlay(items[i])) {
            return true;
        }
    }

    return false;
}

export function renderCollectionItems(page: DetailsPage, parentItem: ItemDto, types: CollectionType[], items: ItemDto[]) {
    getElement(page, '.collectionItems').classList.remove('hide');
    getElement(page, '.collectionItems').innerHTML = '';

    if (!items.length) {
        renderCollectionItemType(page, {
            name: globalize.translate('Items')
        }, items);
    } else {
        let typeItems = [];
        let otherTypeItems = items;

        for (const type of types) {
            [typeItems, otherTypeItems] = filterItemsByCollectionItemType(otherTypeItems, type);

            if (typeItems.length) {
                renderCollectionItemType(page, type, typeItems);
            }
        }

        if (otherTypeItems.length) {
            const otherType = {
                name: globalize.translate('HeaderOtherItems')
            };
            renderCollectionItemType(page, otherType, otherTypeItems);
        }
    }

    const containers = page.querySelectorAll<HTMLElement & { notifyRefreshNeeded: () => void }>('.collectionItemsContainer');

    const notifyRefreshNeeded = function () {
        renderChildren(page, parentItem);
    };

    for (const container of containers) {
        container.notifyRefreshNeeded = notifyRefreshNeeded;
    }

    // if nothing in the collection can be played hide play and shuffle buttons
    if (!canPlaySomeItemInCollection(items)) {
        hideAll(page, 'btnPlay', false);
        hideAll(page, 'btnShuffle', false);
    }

    // HACK: Call autoFocuser again because btnPlay may be hidden, but focused by reloadFromItem
    // FIXME: Sometimes focus does not move until all (?) sections are loaded
    autoFocus(page, page.detailsIsCurrent);
}

export function renderCollectionItemType(page: DetailsPage, type: CollectionType, items: ItemDto[]) {
    let html = '';
    html += '<div class="verticalSection">';
    html += '<div class="sectionTitleContainer sectionTitleContainer-cards padded-left">';
    html += '<h2 class="sectionTitle sectionTitle-cards">';
    html += '<span>' + type.name + '</span>';
    html += '</h2>';
    html += '</div>';
    html += '<div is="emby-itemscontainer" class="itemsContainer collectionItemsContainer vertical-wrap padded-left padded-right">';
    const shape = type.type == 'MusicAlbum' ? getSquareShape(false) : getPortraitShape(false);
    html += cardBuilder.getCardsHtml({
        items: items,
        shape: shape,
        showTitle: true,
        showYear: type.mediaType === 'Video' || type.type === 'Series' || type.type === 'Movie',
        centerText: true,
        lazy: true,
        showDetailsMenu: true,
        overlayMoreButton: true
    } as DetailCardOptions);
    html += '</div>';
    html += '</div>';
    const collectionItems = getElement(page, '.collectionItems');
    collectionItems.insertAdjacentHTML('beforeend', html);
    imageLoader.lazyChildren(collectionItems.lastChild as HTMLElement);
}

function getAlbumTracks(item: ItemDto, items: ItemDto[]) {
    let showArtist: boolean | undefined = false;
    for (const track of items) {
        if (!isEqual(track.ArtistItems!.map(x => x.Id).sort(), track.AlbumArtists!.map(x => x.Id).sort())) {
            showArtist = true;
            break;
        }
    }
    const discNumbers = items.map(x => x.ParentIndexNumber);
    return listView.getListViewHtml({
        items: items,
        smallIcon: true,
        showIndex: new Set(discNumbers).size > 1 || (discNumbers.length >= 1 && discNumbers[0]! > 1),
        index: 'disc',
        showIndexNumberLeft: true,
        playFromHere: true,
        action: ItemAction.PlayAllFromHere,
        image: false,
        artist: showArtist,
        containerAlbumArtists: item.AlbumArtists
    } as DetailListOptions);
}

function fillChildContainer(page: DetailsPage, item: ItemDto, items: ItemDto[], childrenCollapsible: HTMLElement, childrenItemsContainer: HTMLElement, { html, scrollX, isList }: { html: string; scrollX?: boolean; isList?: boolean }) {
    if (item.Type !== 'BoxSet') {
        childrenCollapsible.classList.remove('hide');
    }
    if (scrollX) {
        childrenItemsContainer.classList.add('scrollX');
        childrenItemsContainer.classList.add('hiddenScrollX');
        childrenItemsContainer.classList.remove('vertical-wrap');
        childrenItemsContainer.classList.remove('vertical-list');
    } else {
        childrenItemsContainer.classList.remove('scrollX');
        childrenItemsContainer.classList.remove('hiddenScrollX');
        childrenItemsContainer.classList.remove('smoothScrollX');
        if (isList) {
            childrenItemsContainer.classList.add('vertical-list');
            childrenItemsContainer.classList.remove('vertical-wrap');
        } else {
            childrenItemsContainer.classList.add('vertical-wrap');
            childrenItemsContainer.classList.remove('vertical-list');
        }
    }

    childrenItemsContainer.innerHTML = html;
    imageLoader.lazyChildren(childrenItemsContainer);
    if (item.Type == 'BoxSet') {
        const collectionItemTypes = [{
            name: globalize.translate('Movies'),
            type: 'Movie'
        }, {
            name: globalize.translate('Series'),
            type: 'Series'
        }, {
            name: globalize.translate('Episodes'),
            type: 'Episode'
        }, {
            name: globalize.translate('HeaderVideos'),
            mediaType: 'Video'
        }, {
            name: globalize.translate('Albums'),
            type: 'MusicAlbum'
        }, {
            name: globalize.translate('Books'),
            type: 'Book'
        }, {
            name: globalize.translate('Collections'),
            type: 'BoxSet'
        }];
        renderCollectionItems(page, item, collectionItemTypes, items);
    }
}
