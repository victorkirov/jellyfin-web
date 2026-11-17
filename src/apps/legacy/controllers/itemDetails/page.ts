import { renderChildren, renderItemsByName, renderPlaylistItems } from './children';
import { setPeopleHeader, renderNextUp, clearDeferredDetails, renderSeriesSchedule, renderMusicVideos, renderAdditionalParts, renderScenes, renderSpecials, renderCast, renderGuestCast } from './relatedSections';
import { renderName, renderDetails } from './metadata';
import { renderBackdrop, renderLogo, renderImage } from './artwork';
import { getContextMenuOptions, reloadPlayButtons, setTrailerButtonVisibility } from './actions';
import { renderTrackSelections } from './tracks';
import { autoFocus, unmount, hideAll } from './common';
import { type ConnectionClient } from 'lib/jellyfin-apiclient/connectionTypes';
import { type UserDto } from '@jellyfin/sdk/lib/generated-client';
import { type ItemDto } from 'types/base/models/item-dto';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { AppFeature } from 'constants/appFeature';
import { appHost } from 'components/apphost';
import { intervalToDuration } from 'date-fns';
import { PersonKind } from '@jellyfin/sdk/lib/generated-client/models/person-kind';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { type DetailPerson, type DetailsPage, type DetailsController, type DetailsParams, type NextUpCallback, getElement } from './types';
import escapeHtml from 'escape-html';

import itemContextMenu from 'components/itemContextMenu';
import layoutManager from 'lib/layoutManager';
import loading from 'components/loading/loading';
import globalize from 'lib/globalize';
import datetime from 'scripts/datetime';
import libraryMenu from 'scripts/libraryMenu';

export function reloadFromItem(instance: DetailsController, page: DetailsPage, params: DetailsParams, item: ItemDto, user: UserDto, onNextUp?: NextUpCallback) {
    const apiClient = ServerConnections.getApiClient(item.ServerId)!;

    libraryMenu.setTitle('');
    unmount(instance);
    clearDeferredDetails(page);

    const detailSection = getElement(page, '.detailSection');
    const metadataBefore = item.Type === 'Series' || item.Type === 'Season' ?
        null : getElement(page, '.collectionItems');
    detailSection.insertBefore(getElement(page, '.detailSectionContent'), metadataBefore);
    detailSection.insertBefore(getElement(page, '.itemDetailsGroup'), metadataBefore);

    // Start rendering the artwork first
    renderImage(page, item, apiClient);

    renderLogo(page, item, apiClient);

    renderBackdrop(page, item);

    // Render the main information for the item
    renderName(item, getElement(page, '.nameContainer'), params.context);
    renderDetails(page, instance, item, apiClient, params.context);
    renderTrackSelections(page, instance, item);

    setInitialCollapsibleState(page, item, apiClient, params.context, user, onNextUp);
    const canPlay = reloadPlayButtons(page, item);

    setTrailerButtonVisibility(page, item);

    if (item.Type !== 'Program' || canPlay) {
        hideAll(page, 'mainDetailButtons', true);
    } else {
        hideAll(page, 'mainDetailButtons');
    }

    void itemContextMenu.getCommands(getContextMenuOptions(item, user)).then(commands => {
        if (commands.length) {
            hideAll(page, 'btnMoreCommands', true);
        } else {
            hideAll(page, 'btnMoreCommands');
        }
    });

    renderBirthday(page, item);

    renderDeathDate(page, item);

    renderBirthLocation(page, item);

    setPeopleHeader(page, item);
    loading.hide();

    autoFocus(page);
}

export function setInitialCollapsibleState(page: DetailsPage, item: ItemDto, apiClient: ConnectionClient, context: string | null | undefined, user: UserDto, onNextUp?: NextUpCallback) {
    getElement(page, '.collectionItems').innerHTML = '';

    if (item.Type == 'Playlist') {
        getElement(page, '#listChildrenCollapsible').classList.remove('hide');
        getElement(page, '#childrenCollapsible').classList.add('hide');
        renderPlaylistItems(page, item);
    } else if (item.Type == 'Studio' || item.Type == 'Person' || item.Type == 'Genre' || item.Type == 'MusicGenre' || item.Type == 'MusicArtist') {
        getElement(page, '#listChildrenCollapsible').classList.remove('hide');
        getElement(page, '#childrenCollapsible').classList.add('hide');
        renderItemsByName(page, item, user);
    } else if (item.IsFolder) {
        if (item.Type == 'BoxSet') {
            getElement(page, '#listChildrenCollapsible').classList.add('hide');
            getElement(page, '#childrenCollapsible').classList.add('hide');
        }

        renderChildren(page, item);
    } else {
        getElement(page, '#listChildrenCollapsible').classList.add('hide');
        getElement(page, '#childrenCollapsible').classList.add('hide');
    }

    if (item.Type == 'Series') {
        renderSeriesSchedule(page, item);
        renderNextUp(page, item, user, onNextUp);
    } else {
        getElement(page, '.nextUpSection').classList.add('hide');
    }

    renderScenes(page, item);

    if (item.SpecialFeatureCount! > 0) {
        getElement(page, '#specialsCollapsible').classList.remove('hide');
        renderSpecials(page, item, user);
    } else {
        getElement(page, '#specialsCollapsible').classList.add('hide');
    }

    const mergeablePersonTypes = new Set<string | undefined>([
        PersonKind.Writer,
        PersonKind.Director,
        PersonKind.Producer
    ]);

    const cast: DetailPerson[] = [];
    const guestCast: DetailPerson[] = [];
    const crewByPersonId = new Map();
    (item.People || []).forEach(p => {
        if (p.Type === PersonKind.GuestStar) {
            guestCast.push(p);
        } else if (p.Type === PersonKind.Artist || p.Type === PersonKind.AlbumArtist) {
            // TODO remove this exclusion when artists are migrated to the persons endpoint
            return;
        } else {
            const isMergeableCrew = p.Id && mergeablePersonTypes.has(p.Type);
            const existingIndex = isMergeableCrew ? crewByPersonId.get(p.Id) : undefined;

            if (existingIndex !== undefined) {
                cast[existingIndex].RoleList!.push({ Type: p.Type, Role: p.Role });
            } else {
                if (isMergeableCrew) {
                    crewByPersonId.set(p.Id, cast.length);
                }
                cast.push(isMergeableCrew ? { ...p, RoleList: [{ Type: p.Type, Role: p.Role }] } : p);
            }
        }
    });

    renderCast(page, item, cast);
    renderGuestCast(page, item, guestCast);

    if (item.PartCount && item.PartCount > 1) {
        getElement(page, '#additionalPartsCollapsible').classList.remove('hide');
        renderAdditionalParts(page, item, user);
    } else {
        getElement(page, '#additionalPartsCollapsible').classList.add('hide');
    }

    if (item.Type == BaseItemKind.MusicAlbum) {
        renderMusicVideos(page, item, user);
    } else {
        getElement(page, '#musicVideosCollapsible').classList.add('hide');
    }
}

function renderBirthday(page: DetailsPage, item: ItemDto) {
    const itemBirthday = getElement(page, '#itemBirthday');

    if (item.Type == 'Person' && item.PremiereDate) {
        try {
            const birthday = datetime.parseISO8601Date(item.PremiereDate, true);
            const durationSinceBorn = intervalToDuration({ start: birthday, end: Date.now() });
            itemBirthday.classList.remove('hide');
            if (item.EndDate) {
                itemBirthday.innerHTML = globalize.translate('BirthDateValue', birthday.toLocaleDateString());
            } else {
                itemBirthday.innerHTML = `${globalize.translate('BirthDateValue', birthday.toLocaleDateString())} ${globalize.translate('AgeValue', durationSinceBorn.years!)}`;
            }
        } catch (err) {
            console.error(err);
            itemBirthday.classList.add('hide');
        }
    } else {
        itemBirthday.classList.add('hide');
    }
}

function renderDeathDate(page: DetailsPage, item: ItemDto) {
    const itemDeathDate = getElement(page, '#itemDeathDate');

    if (item.Type == 'Person' && item.EndDate) {
        try {
            const deathday = datetime.parseISO8601Date(item.EndDate, true);
            itemDeathDate.classList.remove('hide');
            if (item.PremiereDate) {
                const birthday = datetime.parseISO8601Date(item.PremiereDate, true);
                const durationSinceBorn = intervalToDuration({ start: birthday, end: deathday });

                itemDeathDate.innerHTML = `${globalize.translate('DeathDateValue', deathday.toLocaleDateString())} ${globalize.translate('AgeValue', durationSinceBorn.years!)}`;
            } else {
                itemDeathDate.innerHTML = globalize.translate('DeathDateValue', deathday.toLocaleDateString());
            }
        } catch (err) {
            console.error(err);
            itemDeathDate.classList.add('hide');
        }
    } else {
        itemDeathDate.classList.add('hide');
    }
}

function renderBirthLocation(page: DetailsPage, item: ItemDto) {
    const itemBirthLocation = getElement(page, '#itemBirthLocation');

    if (item.Type == 'Person' && item.ProductionLocations && item.ProductionLocations.length) {
        let location = item.ProductionLocations[0];
        if (!layoutManager.tv && appHost.supports(AppFeature.ExternalLinks)) {
            location = `<a is="emby-linkbutton" class="button-link textlink" target="_blank" href="https://www.openstreetmap.org/search?query=${encodeURIComponent(location)}">${escapeHtml(location)}</a>`;
        } else {
            location = escapeHtml(location);
        }
        itemBirthLocation.classList.remove('hide');
        itemBirthLocation.innerHTML = globalize.translate('BirthPlaceValue', location);
    } else {
        itemBirthLocation.classList.add('hide');
    }
}
