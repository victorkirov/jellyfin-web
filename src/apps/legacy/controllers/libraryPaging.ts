import { rememberLibraryPaging, forgetLibraryPaging, focusLibraryContent } from './libraryRail';
import globalize from 'lib/globalize';
import type { LibraryQuery } from './libraryControllerTypes';
import libraryBrowser from 'scripts/libraryBrowser';
import * as userSettings from 'scripts/settings/userSettings';

const layoutOptions = {
    Banner: { shape: 'banner', preferBanner: true },
    List: null,
    Poster: { shape: 'portrait', showTitle: true, showYear: true, centerText: true },
    PosterCard: { shape: 'portrait', cardLayout: true, showTitle: true, showYear: true, centerText: true },
    Thumb: { shape: 'backdrop', preferThumb: true, showTitle: true, showYear: true, centerText: true },
    ThumbCard: { shape: 'backdrop', preferThumb: true, cardLayout: true, showTitle: true, showYear: true, centerText: true }
};
export const libraryLayouts = Object.keys(layoutOptions);

export function getLibraryLayoutOptions(layout: string) {
    // The validated layout is one of the saved-layout keys above.
    return layoutOptions[supportedLibraryLayout(layout) as keyof typeof layoutOptions];
}

export function getLibraryLayout(key: string, legacyFirst = false) {
    const suffixes = legacyFirst ? ['-view', '-_view'] : ['-_view', '-view'];
    const value = userSettings.get(key + suffixes[0]) || userSettings.get(key + suffixes[1]);
    return supportedLibraryLayout(value);
}

export function supportedLibraryLayout(value: string | null | undefined) {
    return value != null && libraryLayouts.indexOf(value) !== -1 ? value : 'Poster';
}

export function bindLibraryPaging({ view, query, totalRecordCount, isLoading, getRequestId, refresh, focus }: {
    view: HTMLElement; query: LibraryQuery; totalRecordCount?: number; isLoading(): boolean;
    getRequestId(): number; refresh(): unknown; focus?(): void;
}) {
    const pagingHtml = libraryBrowser.getQueryPagingHtml({
        startIndex: query.StartIndex,
        limit: query.Limit,
        totalRecordCount,
        showLimit: false,
        updatePageSizeSetting: false,
        addLayoutButton: false,
        sortButton: false,
        filterButton: false
    });
    for (const element of view.querySelectorAll('.paging')) renderPaging(element, pagingHtml, totalRecordCount);
    function changePage(direction: number, control: Element) {
        if (isLoading() || (!query.Limit || query.Limit <= 0)) return;
        const previousStartIndex = query.StartIndex;
        const startIndex = Math.max(0, previousStartIndex + direction * query.Limit);
        if (startIndex === query.StartIndex || (totalRecordCount != null && startIndex >= totalRecordCount)) return;
        query.StartIndex = startIndex;
        if (view.querySelector('.libraryRail')) rememberLibraryPaging(view, control);
        const refreshResult = refresh();
        const requestId = getRequestId();
        Promise.resolve(refreshResult).then(() => {
            if (getRequestId() !== requestId) return;
            if (view.querySelector('.libraryRail')) focusLibraryContent(view);
            else if (focus) focus();
        }).catch(error => {
            if (getRequestId() === requestId && query.StartIndex === startIndex && view.contains(control)) {
                query.StartIndex = previousStartIndex;
            }
            console.error(error);
        }).finally(() => {
            if (getRequestId() === requestId) forgetLibraryPaging(view);
        });
    }
    for (const element of view.querySelectorAll('.btnNextPage')) {
        element.addEventListener('click', () => changePage(1, element));
    }
    for (const element of view.querySelectorAll('.btnPreviousPage')) {
        element.addEventListener('click', () => changePage(-1, element));
    }
}

function railPagingButtons() {
    return '<div><button is="paper-icon-button-light" class="btnPreviousPage autoSize" disabled><span class="material-icons arrow_back" aria-hidden="true"></span></button>'
        + '<button is="paper-icon-button-light" class="btnNextPage autoSize" disabled><span class="material-icons arrow_forward" aria-hidden="true"></span></button></div>';
}

function renderPaging(element: Element, pagingHtml: string, totalRecordCount?: number) {
    element.innerHTML = pagingHtml;
    const rail = element.closest('.libraryRail');
    if (totalRecordCount === 0) element.querySelector('.listPaging > span')?.classList.add('hide');
    if (rail && !element.querySelector('.btnPreviousPage')) {
        element.querySelector('.listPaging')?.insertAdjacentHTML('beforeend', railPagingButtons());
    }
    for (const button of element.querySelectorAll('.btnPreviousPage,.btnNextPage')) {
        const label = globalize.translate(button.classList.contains('btnNextPage') ? 'Next' : 'Previous');
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        // Keep rail paging focusable at either end so repeated presses never eject focus.
        if (rail) button.insertAdjacentHTML('beforeend', '<span class="libraryRailLabel" aria-hidden="true">' + label + '</span>');
        if (rail && button.hasAttribute('disabled')) {
            button.removeAttribute('disabled');
            button.setAttribute('aria-disabled', 'true');
        }
    }
}
