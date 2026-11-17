import { type ConnectionClient } from 'lib/jellyfin-apiclient/connectionTypes';
import { type UserDto } from '@jellyfin/sdk/lib/generated-client';
import { type ItemDto } from 'types/base/models/item-dto';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { ItemAction } from 'constants/itemAction';
import { deferSection } from 'components/homesections/deferSection';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { ItemFields } from '@jellyfin/sdk/lib/generated-client/models/item-fields';
import { type DetailCardOptions, type DetailListOptions, type DetailsPage, type DetailPerson, type NextUpCallback, getElement } from './types';
import escapeHtml from 'escape-html';

import cardBuilder from 'components/cardbuilder/cardBuilder';
import imageLoader from 'components/images/imageLoader';
import layoutManager from 'lib/layoutManager';
import listView from 'components/listview/listview';
import loading from 'components/loading/loading';
import globalize from 'lib/globalize';
import browser from 'scripts/browser';
import datetime from 'scripts/datetime';

export function getProgramScheduleHtml(items: ItemDto[], action: ItemAction = ItemAction.None) {
    return listView.getListViewHtml({
        items: items,
        enableUserDataButtons: false,
        image: true,
        imageSource: 'channel',
        showProgramDateTime: true,
        showChannel: false,
        mediaInfo: true,
        runtime: false,
        action,
        moreButton: false,
        recordButton: false
    } as DetailListOptions);
}

export function setPeopleHeader(page: DetailsPage, item: ItemDto) {
    if (item.MediaType == 'Audio' || item.Type == 'MusicAlbum' || item.MediaType == 'Book' || item.MediaType == 'Photo') {
        getElement(page, '#peopleHeader').innerHTML = globalize.translate('People');
    } else {
        getElement(page, '#peopleHeader').innerHTML = globalize.translate('HeaderCastAndCrew');
    }
}

export function renderNextUp(page: DetailsPage, item: ItemDto, user: UserDto, onNextUp?: NextUpCallback, isCurrent: () => boolean = () => true) {
    const section = getElement(page, '.nextUpSection');

    if (item.Type != 'Series') {
        section.classList.add('hide');
        return;
    }

    void ServerConnections.getApiClient(item.ServerId)!.getNextUpEpisodes({
        SeriesId: item.Id!,
        UserId: user.Id,
        Fields: 'MediaSourceCount'
    }).then(function (result) {
        if (!isCurrent()) return;
        onNextUp?.(result.Items?.[0]);
        if (result.Items!.length) {
            section.classList.remove('hide');
        } else {
            section.classList.add('hide');
        }

        const html = cardBuilder.getCardsHtml({
            items: result.Items!,
            shape: 'overflowBackdrop',
            showTitle: true,
            displayAsSpecial: (item.Type as string) == 'Season' && item.IndexNumber,
            overlayText: false,
            centerText: true,
            overlayPlayButton: true
        } as DetailCardOptions);
        const itemsContainer = getElement(section, '.nextUpItems');
        itemsContainer.innerHTML = html;
        imageLoader.lazyChildren(itemsContainer);
    }).catch(error => {
        if (!isCurrent()) return;
        section.classList.add('hide');
        onNextUp?.(undefined);
        console.error('failed to load Next Up', error);
    });
}

export function enableScrollX() {
    return browser.mobile && window.screen.availWidth <= 1000;
}

export function clearDeferredDetails(page: DetailsPage) {
    for (const destroy of page.deferredDetails || []) destroy();
    page.deferredDetails = [];
}

export function renderDeferredDetailSection(page: DetailsPage, section: HTMLElement, render: () => unknown) {
    if (!layoutManager.tv) return render();

    section.classList.add('hide');
    page.deferredDetails = page.deferredDetails || [];
    page.deferredDetails.push(deferSection(section, () => {
        section.classList.remove('hide');
        return render();
    }));
}

export function renderLyricsContainer(view: DetailsPage, item: ItemDto, apiClient: ConnectionClient) {
    const lyricContainer = getElement(view, '.lyricsContainer');
    if (lyricContainer && item.HasLyrics) {
        if (item.Type !== 'Audio') {
            lyricContainer.classList.add('hide');
            return;
        }
        renderDeferredDetailSection(view, lyricContainer, () => {
            //get lyrics
            return apiClient.ajax({
                url: apiClient.getUrl('Audio/' + item.Id + '/Lyrics'),
                type: 'GET',
                dataType: 'json'
            }).then((response) => {
                if (!response.Lyrics) {
                    lyricContainer.classList.add('hide');
                    return;
                }
                lyricContainer.classList.remove('hide');
                const itemsContainer = getElement(lyricContainer, '.itemsContainer');
                if (itemsContainer) {
                    const html = response.Lyrics.reduce((htmlAccumulator: string, lyric: { Text: string }) => {
                        htmlAccumulator += escapeHtml(lyric.Text) + '<br/>';
                        return htmlAccumulator;
                    }, '');
                    itemsContainer.innerHTML = html;
                }
            }).catch(() => {
                lyricContainer.classList.add('hide');
            });
        });
    }
}

export function renderMoreFromSeason(view: DetailsPage, item: ItemDto, apiClient: ConnectionClient) {
    const section = getElement(view, '.moreFromSeasonSection');

    if (section) {
        if (item.Type !== 'Episode' || !item.SeasonId || !item.SeriesId) {
            section.classList.add('hide');
            return;
        }

        getElement(section, 'h2').textContent = globalize.translate('MoreFromValue', item.SeasonName!);

        renderDeferredDetailSection(view, section, () => {
            const userId = apiClient.getCurrentUserId();
            return apiClient.getEpisodes(item.SeriesId!, {
                SeasonId: item.SeasonId,
                UserId: userId,
                Fields: 'ItemCounts,PrimaryImageAspectRatio,CanDelete,MediaSourceCount'
            }).then(function (result) {
                if (result.Items!.length < 2) {
                    section.classList.add('hide');
                    return;
                }

                section.classList.remove('hide');
                const itemsContainer = getElement(section, '.itemsContainer');
                cardBuilder.buildCards(result.Items!, {
                    parentContainer: section,
                    itemsContainer: itemsContainer,
                    shape: 'overflowBackdrop',
                    sectionTitleTagName: 'h2',
                    scalable: true,
                    showTitle: true,
                    overlayText: false,
                    centerText: true,
                    includeParentInfoInTitle: false,
                    allowBottomPadding: false
                });
                const card = getElement(itemsContainer, '.card[data-id="' + item.Id + '"]');

                if (card) {
                    setTimeout(function () {
                        getElement(section, '.emby-scroller').toStart(card.previousSibling || card, true);
                    }, 100);
                }
            });
        });
    }
}

export function renderMoreFromArtist(view: DetailsPage, item: ItemDto, apiClient: ConnectionClient) {
    const section = getElement(view, '.moreFromArtistSection');

    if (section) {
        if (item.Type !== 'MusicArtist' && item.Type !== 'Audio' && (item.Type !== 'MusicAlbum' || !item.AlbumArtists || !item.AlbumArtists.length)) {
            section.classList.add('hide');
            return;
        }

        if (item.Type === 'MusicArtist') {
            getElement(section, 'h2').textContent = globalize.translate('HeaderAppearsOn');
        } else {
            getElement(section, 'h2').textContent = globalize.translate('MoreFromValue', item.AlbumArtists![0].Name!);
        }

        renderDeferredDetailSection(view, section, () => {
            const query: Record<string, string | boolean | null | undefined> = {
                IncludeItemTypes: 'MusicAlbum',
                Recursive: true,
                ExcludeItemIds: item.Id!,
                SortBy: 'PremiereDate,ProductionYear,SortName',
                SortOrder: 'Descending'
            };

            if (item.Type === 'MusicArtist') {
                query.ContributingArtistIds = item.Id;
            } else {
                query.AlbumArtistIds = item.AlbumArtists!.map(artist => artist.Id).join(',');
            }

            return apiClient.getItems(apiClient.getCurrentUserId(), query).then(function (result) {
                if (!result.Items!.length) {
                    section.classList.add('hide');
                    return;
                }

                section.classList.remove('hide');

                cardBuilder.buildCards(result.Items!, {
                    parentContainer: section,
                    itemsContainer: getElement(section, '.itemsContainer'),
                    shape: 'autooverflow',
                    sectionTitleTagName: 'h2',
                    scalable: true,
                    coverImage: item.Type === 'MusicArtist' || item.Type === 'MusicAlbum',
                    showTitle: true,
                    showParentTitle: false,
                    centerText: true,
                    overlayText: false,
                    overlayPlayButton: true,
                    showYear: true
                });
            });
        });
    }
}

export function renderItemCollections(page: DetailsPage, item: ItemDto, apiClient: ConnectionClient, context: string | null | undefined) {
    const section = getElement(page, '#collectionsCollapsible');

    if (!section) {
        return;
    }

    const api = ServerConnections.getApi(item.ServerId);
    const userId = apiClient.getCurrentUserId();

    if (!api) {
        console.error('[renderItemCollections] No Api instance available for server', item.ServerId);
        section.classList.add('hide');
        return;
    }

    renderDeferredDetailSection(page, section, () => {
        return getLibraryApi(api)
            .getItemCollections({
                itemId: item.Id!,
                userId,
                fields: [ItemFields.PrimaryImageAspectRatio]
            })
            .then(response => response.data?.Items || [])
            .then(collectionItems => {
                if (!collectionItems.length) {
                    section.classList.add('hide');
                    return;
                }

                section.classList.remove('hide');
                cardBuilder.buildCards(collectionItems, {
                    parentContainer: section,
                    itemsContainer: getElement(section, '.collectionsContent'),
                    shape: 'overflowPortrait',
                    sectionTitleTagName: 'h2',
                    scalable: true,
                    centerText: true,
                    showTitle: true,
                    showParentTitle: false,
                    overlayText: false,
                    overlayPlayButton: false,
                    coverImage: true,
                    // Similar to "More Like This"
                    showYear: item.Type === 'Movie' || item.Type === 'Trailer' || item.Type === 'Series',
                    context: context!
                });
            }).catch(() => {
                section.classList.add('hide');
            });
    });
}

export function renderSimilarItems(page: DetailsPage, item: ItemDto, context: string | null | undefined) {
    const similarCollapsible = getElement(page, '#similarCollapsible');

    if (similarCollapsible) {
        if (item.Type != 'Movie' && item.Type != 'Trailer' && item.Type != 'Series' && item.Type != 'Program' && item.Type != 'Recording' && item.Type != 'MusicAlbum' && item.Type != 'MusicArtist' && item.Type != 'Playlist' && item.Type != 'Audio') {
            similarCollapsible.classList.add('hide');
            return;
        }

        renderDeferredDetailSection(page, similarCollapsible, () => {
            similarCollapsible.classList.remove('hide');
            const apiClient = ServerConnections.getApiClient(item.ServerId)!;
            const options: { userId: string; limit: number; fields: string; ExcludeArtistIds?: string | null } = {
                userId: apiClient.getCurrentUserId(),
                limit: 12,
                fields: 'PrimaryImageAspectRatio,CanDelete'
            };

            if (item.Type == 'MusicAlbum' && item.AlbumArtists && item.AlbumArtists.length) {
                options.ExcludeArtistIds = item.AlbumArtists[0].Id;
            }

            return apiClient.getSimilarItems(item.Id!, options).then(function (result) {
                if (!result.Items!.length) {
                    similarCollapsible.classList.add('hide');
                    return;
                }

                similarCollapsible.classList.remove('hide');
                let html = '';
                html += cardBuilder.getCardsHtml({
                    items: result.Items!,
                    shape: 'autooverflow',
                    showParentTitle: item.Type == 'MusicAlbum',
                    centerText: true,
                    showTitle: true,
                    context: context!,
                    lazy: true,
                    showDetailsMenu: true,
                    coverImage: item.Type == 'MusicAlbum' || item.Type == 'MusicArtist',
                    overlayPlayButton: true,
                    overlayText: false,
                    showYear: item.Type === 'Movie' || item.Type === 'Trailer' || item.Type === 'Series'
                } as DetailCardOptions);
                const similarContent = getElement(similarCollapsible, '.similarContent');
                similarContent.innerHTML = html;
                imageLoader.lazyChildren(similarContent);
            });
        });
    }
}

export function renderProgramsForChannel(page: DetailsPage, result: { Items?: ItemDto[] }) {
    let html = '';
    let currentItems = [];
    let currentStartDate = null;

    for (let i = 0, length = result.Items!.length; i < length; i++) {
        const item = result.Items![i];
        const itemStartDate = datetime.parseISO8601Date(item.StartDate);

        if (!(currentStartDate && currentStartDate.toDateString() === itemStartDate.toDateString())) {
            if (currentItems.length) {
                html += '<div class="verticalSection verticalDetailSection">';
                html += '<h2 class="sectionTitle padded-left">' + datetime.toLocaleDateString(currentStartDate, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric'
                }) + '</h2>';
                html += '<div is="emby-itemscontainer" class="vertical-list padded-left padded-right">' + listView.getListViewHtml({
                    items: currentItems,
                    enableUserDataButtons: false,
                    showParentTitle: true,
                    image: false,
                    showProgramTime: true,
                    mediaInfo: false,
                    parentTitleWithTitle: true
                } as DetailListOptions) + '</div></div>';
            }

            currentStartDate = itemStartDate;
            currentItems = [];
        }

        currentItems.push(item);
    }

    if (currentItems.length) {
        html += '<div class="verticalSection verticalDetailSection">';
        html += '<h2 class="sectionTitle padded-left">' + datetime.toLocaleDateString(currentStartDate, {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        }) + '</h2>';
        html += '<div is="emby-itemscontainer" class="vertical-list padded-left padded-right">' + listView.getListViewHtml({
            items: currentItems,
            enableUserDataButtons: false,
            showParentTitle: true,
            image: false,
            showProgramTime: true,
            mediaInfo: false,
            parentTitleWithTitle: true
        } as DetailListOptions) + '</div></div>';
    }

    getElement(page, '.programGuide').innerHTML = html;
}

export function renderChannelGuide(page: DetailsPage, apiClient: ConnectionClient, item: ItemDto) {
    if (item.Type === 'TvChannel') {
        getElement(page, '.programGuideSection').classList.remove('hide');
        void apiClient.getLiveTvPrograms({
            ChannelIds: item.Id!,
            UserId: apiClient.getCurrentUserId(),
            HasAired: false,
            SortBy: 'StartDate',
            EnableTotalRecordCount: false,
            EnableImages: false,
            ImageTypeLimit: 0,
            EnableUserData: false
        }).then(function (result) {
            renderProgramsForChannel(page, result);
        });
    }
}

export function renderSeriesSchedule(page: DetailsPage, item: ItemDto) {
    const apiClient = ServerConnections.getApiClient(item.ServerId)!;
    void apiClient.getLiveTvPrograms({
        UserId: apiClient.getCurrentUserId(),
        ImageTypeLimit: 1,
        HasAired: false,
        SortBy: 'StartDate',
        EnableTotalRecordCount: false,
        Limit: 50,
        EnableUserData: false,
        Fields: 'ChannelInfo,ChannelImage',
        LibrarySeriesId: item.Id
    }).then(function (result) {
        if (result.Items!.length) {
            getElement(page, '#seriesScheduleSection').classList.remove('hide');
        } else {
            getElement(page, '#seriesScheduleSection').classList.add('hide');
        }

        const html = getProgramScheduleHtml(result.Items!, ItemAction.Link);
        const scheduleTab = getElement(page, '#seriesScheduleList');
        scheduleTab.innerHTML = html;
        imageLoader.lazyChildren(scheduleTab);

        loading.hide();
    });
}

export function renderMusicVideos(page: DetailsPage, item: ItemDto, user: UserDto) {
    renderDeferredDetailSection(page, getElement(page, '#musicVideosCollapsible'), () => {
        const request = {
            SortBy: 'SortName',
            SortOrder: 'Ascending',
            IncludeItemTypes: 'MusicVideo',
            Recursive: true,
            Fields: 'PrimaryImageAspectRatio,CanDelete,MediaSourceCount',
            AlbumIds: item.Id
        };

        return ServerConnections.getApiClient(item.ServerId)!.getItems(user.Id!, request).then(function (result) {
            if (result.Items!.length) {
                getElement(page, '#musicVideosCollapsible').classList.remove('hide');
                const musicVideosContent = getElement(page, '#musicVideosContent');
                musicVideosContent.innerHTML = getVideosHtml(result.Items!);
                imageLoader.lazyChildren(musicVideosContent);
            } else {
                getElement(page, '#musicVideosCollapsible').classList.add('hide');
            }
        });
    });
}

export function renderAdditionalParts(page: DetailsPage, item: ItemDto, user: UserDto) {
    renderDeferredDetailSection(page, getElement(page, '#additionalPartsCollapsible'), () => {
        return ServerConnections.getApiClient(item.ServerId)!.getAdditionalVideoParts(user.Id!, item.Id!).then(function (result) {
            if (result.Items!.length) {
                getElement(page, '#additionalPartsCollapsible').classList.remove('hide');
                const additionalPartsContent = getElement(page, '#additionalPartsContent');
                additionalPartsContent.innerHTML = getVideosHtml(result.Items!);
                imageLoader.lazyChildren(additionalPartsContent);
            } else {
                getElement(page, '#additionalPartsCollapsible').classList.add('hide');
            }
        });
    });
}

export function renderScenes(page: DetailsPage, item: ItemDto) {
    let chapters = item.Chapters || [];

    if (chapters.length && !chapters[0].ImageTag) {
        chapters = [];
    }

    if (chapters.length) {
        renderDeferredDetailSection(page, getElement(page, '#scenesCollapsible'), () => {
            getElement(page, '#scenesCollapsible').classList.remove('hide');
            const scenesContent = getElement(page, '#scenesContent');

            return import('components/cardbuilder/chaptercardbuilder').then(({ default: chaptercardbuilder }) => {
                chaptercardbuilder.buildChapterCards(item, chapters, {
                    itemsContainer: scenesContent,
                    backdropShape: 'overflowBackdrop',
                    squareShape: 'overflowSquare',
                    imageBlurhashes: item.ImageBlurHashes
                });
            });
        });
    } else {
        getElement(page, '#scenesCollapsible').classList.add('hide');
    }
}

export function getVideosHtml(items: ItemDto[]) {
    return cardBuilder.getCardsHtml({
        items: items,
        shape: 'autooverflow',
        showTitle: true,
        action: 'play',
        overlayText: false,
        centerText: true,
        showRuntime: true,
        overlayMoreButton: true
    } as DetailCardOptions);
}

export function renderSpecials(page: DetailsPage, item: ItemDto, user: UserDto) {
    renderDeferredDetailSection(page, getElement(page, '#specialsCollapsible'), () => {
        return ServerConnections.getApiClient(item.ServerId)!.getSpecialFeatures(user.Id!, item.Id!).then(function (specials) {
            const specialsContent = getElement(page, '#specialsContent');
            specialsContent.innerHTML = getVideosHtml(specials);
            imageLoader.lazyChildren(specialsContent);
        });
    });
}

export function renderCast(page: DetailsPage, item: ItemDto, people: DetailPerson[]) {
    if (!people.length) {
        getElement(page, '#castCollapsible').classList.add('hide');
        return;
    }

    renderDeferredDetailSection(page, getElement(page, '#castCollapsible'), () => {
        getElement(page, '#castCollapsible').classList.remove('hide');
        const castContent = getElement(page, '#castContent');

        return import('components/cardbuilder/peoplecardbuilder').then(({ default: peoplecardbuilder }) => {
            peoplecardbuilder.buildPeopleCards(people, {
                itemsContainer: castContent,
                coverImage: true,
                serverId: item.ServerId,
                shape: 'overflowPortrait',
                imageBlurhashes: item.ImageBlurHashes
            });
        });
    });
}

export function renderGuestCast(page: DetailsPage, item: ItemDto, people: DetailPerson[]) {
    if (!people.length) {
        getElement(page, '#guestCastCollapsible').classList.add('hide');
        return;
    }

    renderDeferredDetailSection(page, getElement(page, '#guestCastCollapsible'), () => {
        getElement(page, '#guestCastCollapsible').classList.remove('hide');
        const guestCastContent = getElement(page, '#guestCastContent');

        return import('components/cardbuilder/peoplecardbuilder').then(({ default: peoplecardbuilder }) => {
            peoplecardbuilder.buildPeopleCards(people, {
                itemsContainer: guestCastContent,
                coverImage: true,
                serverId: item.ServerId,
                shape: 'overflowPortrait',
                imageBlurhashes: item.ImageBlurHashes
            });
        });
    });
}
