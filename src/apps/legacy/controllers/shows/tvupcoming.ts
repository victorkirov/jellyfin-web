import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { createLibraryInitialFocus } from '../libraryRail';
import type { RecommendedParams } from '../recommendedTypes';
import loading from 'components/loading/loading';
import { renderUpcoming } from './upcomingRows';
import 'components/itemscontainer/emby-itemscontainer';
import 'styles/scrollstyles.scss';

type UpcomingResult = { Items: BaseItemDto[] };

function getUpcomingPromise(_context: HTMLElement, params: RecommendedParams) {
    loading.show();
    const query = {
        ParentId: params.topParentId,
        Limit: 48,
        Fields: 'AirTime',
        UserId: window.ApiClient.getCurrentUserId(),
        ImageTypeLimit: 1,
        EnableImageTypes: 'Primary,Backdrop,Banner,Thumb',
        EnableTotalRecordCount: false
    };

    return window.ApiClient.getJSON(window.ApiClient.getUrl('Shows/Upcoming', query)) as Promise<UpcomingResult>;
}

function loadUpcoming(context: HTMLElement, promise: Promise<UpcomingResult>, focus: () => void) {
    void promise.then(function (result) {
        const items = result.Items;

        if (items.length) {
            context.querySelector<HTMLElement>('.noItemsMessage')!.style.display = 'none';
        } else {
            context.querySelector<HTMLElement>('.noItemsMessage')!.style.display = 'block';
        }

        renderUpcoming(context.querySelector<HTMLElement>('#upcomingItems')!, items);
        loading.hide();
        focus();
    }).catch(error => {
        loading.hide();
        focus();
        console.error(error);
    });
}

export default class UpcomingTab {
    preRender: () => void;
    renderTab: () => void;

    constructor(view: HTMLElement, params: RecommendedParams, tabContent: HTMLElement) {
        let upcomingPromise: Promise<UpcomingResult>;
        this.preRender = function () {
            upcomingPromise = getUpcomingPromise(view, params);
        };
        this.renderTab = function () {
            loadUpcoming(tabContent, upcomingPromise, createLibraryInitialFocus(view, tabContent));
        };
    }
}
