import type { ApiClient } from 'jellyfin-apiclient';
import type { UserDto } from '@jellyfin/sdk/lib/generated-client/models/user-dto';
import layoutManager from 'lib/layoutManager';
import { DEFAULT_SECTIONS, HomeSectionType } from 'constants/homeSectionType';
import { getUserViewsQuery } from 'hooks/api/useUserViews';
import globalize from 'lib/globalize';
import ServerConnections from 'lib/jellyfin-apiclient/ServerConnections';
import { queryClient } from 'utils/query/queryClient';

import { deferSection } from './deferSection';

import { loadSection } from './sectionComposition';
import type { HomeContainer, HomeRow, ResumeOptions, HomeSettings } from './homeLifecycle';

import 'elements/emby-button/paper-icon-button-light';
import 'components/itemscontainer/emby-itemscontainer';
import 'elements/emby-scroller/emby-scroller';
import 'components/buttons/emby-button';

import './homesections.scss';

const MAX_SECTIONS = 10;
const MAX_SECTIONS_TV = MAX_SECTIONS + 1; // TV layout can have an extra section to ensure a library section is always visible

export function getDefaultSection(index: number) {
    if (index < 0 || index > DEFAULT_SECTIONS.length) return '';
    return DEFAULT_SECTIONS[index];
}

function getAllSectionsToShow(userSettings: HomeSettings) {
    const sections = [];
    for (let i = 0, length = MAX_SECTIONS; i < length; i++) {
        let section = userSettings.get('homesection' + i) || getDefaultSection(i);
        if (section === 'folders') {
            section = HomeSectionType.SmallLibraryTiles;
        }

        sections.push(section);
    }

    // Ensure libraries are visible in TV layout
    if (
        layoutManager.tv
            && !sections.includes(HomeSectionType.SmallLibraryTiles)
            && !sections.includes(HomeSectionType.LibraryButtons)
    ) {
        return [
            HomeSectionType.SmallLibraryTiles,
            ...sections
        ];
    }

    return sections;
}

export function loadSections(elem: HomeContainer, apiClient: ApiClient, user: UserDto, userSettings: HomeSettings, isActive: () => boolean = () => true) {
    const api = ServerConnections.getApi(apiClient.serverId());
    const userId = user.Id || apiClient.getCurrentUserId();
    return queryClient
        .fetchQuery(getUserViewsQuery(api, { userId }))
        .then(result => result.Items || [])
        .then(function (userViews) {
            if (!isActive()) return;
            let html = '';

            if (userViews.length) {
                // TV layout can have an extra section to ensure libraries are visible
                const totalSectionCount = layoutManager.tv ? MAX_SECTIONS_TV : MAX_SECTIONS;
                for (let i = 0; i < totalSectionCount; i++) {
                    html += '<div class="verticalSection section' + i + '"></div>';
                }

                elem.innerHTML = html;
                elem.classList.add('homeSectionsContainer');

                const promises = getAllSectionsToShow(userSettings)
                    .map((section, index) => (
                        loadSection(elem, apiClient, user, userSettings, userViews, section, index)
                    ));

                return Promise.all(promises).then(() => undefined);
            } else {
                const noLibDescription = globalize.translate('AskAdminToCreateLibrary');

                html += '<div class="centerMessage padded-left padded-right">';
                html += '<h2>' + globalize.translate('MessageNothingHere') + '</h2>';
                html += '<p>' + noLibDescription + '</p>';
                html += '</div>';
                elem.innerHTML = html;
            }
        });
}

function clearDeferredSections(elem: HomeContainer) {
    for (const destroy of elem.deferredSections || []) destroy();
    elem.deferredSections = [];
}

export function destroySections(elem: HomeContainer) {
    clearDeferredSections(elem);
    const elems = elem.querySelectorAll<HomeRow>('.itemsContainer');
    for (const e of elems) {
        e.fetchData = null;
        e.parentContainer = null;
        e.getItemsHtml = null;
    }

    elem.innerHTML = '';
}

export function pause(elem: HomeContainer) {
    clearDeferredSections(elem);
    const elems = elem.querySelectorAll<HomeRow>('.itemsContainer');
    for (const e of elems) {
        e.pause();
    }
}

export function resume(elem: HomeContainer, options: ResumeOptions) {
    clearDeferredSections(elem);
    const elems = elem.querySelectorAll<HomeRow>('.itemsContainer');
    const promises: Promise<unknown>[] = [];

    elems.forEach((section, index) => {
        if (!section.resume) return;
        if (layoutManager.tv && section.fetchData && index >= 2 && (options?.refresh || section.needsRefresh)) {
            section.needsRefresh = true;
            section.pause();
            elem.deferredSections!.push(deferSection(
                section.parentContainer || section,
                () => section.resume(options)
            ));
        } else {
            promises.push(section.resume(options));
        }
    });

    return Promise.all(promises);
}

export default {
    getDefaultSection,
    loadSections,
    destroySections,
    pause,
    resume
};
