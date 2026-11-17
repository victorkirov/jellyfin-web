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

export function getLibraryLayoutOptions(layout) {
    return layoutOptions[supportedLibraryLayout(layout)];
}

export function getLibraryLayout(key, legacyFirst = false) {
    const suffixes = legacyFirst ? ['-view', '-_view'] : ['-_view', '-view'];
    const value = userSettings.get(key + suffixes[0]) || userSettings.get(key + suffixes[1]);
    return supportedLibraryLayout(value);
}

export function supportedLibraryLayout(value) {
    return libraryLayouts.indexOf(value) === -1 ? 'Poster' : value;
}

export function bindLibraryPaging({ view, query, totalRecordCount, isLoading, getRequestId, refresh, focus }) {
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
    for (const element of view.querySelectorAll('.paging')) {
        element.innerHTML = pagingHtml;
    }
    function changePage(direction, control) {
        if (isLoading() || (!query.Limit || query.Limit <= 0)) return;
        const previousStartIndex = query.StartIndex;
        const startIndex = Math.max(0, previousStartIndex + direction * query.Limit);
        if (startIndex === query.StartIndex || startIndex >= totalRecordCount) return;
        query.StartIndex = startIndex;
        const refreshResult = refresh();
        const requestId = getRequestId();
        Promise.resolve(refreshResult).then(() => {
            if (focus) focus();
        }).catch(error => {
            if (getRequestId() === requestId && query.StartIndex === startIndex && view.contains(control)) {
                query.StartIndex = previousStartIndex;
            }
            console.error(error);
        });
    }
    for (const element of view.querySelectorAll('.btnNextPage')) {
        element.addEventListener('click', () => changePage(1, element));
    }
    for (const element of view.querySelectorAll('.btnPreviousPage')) {
        element.addEventListener('click', () => changePage(-1, element));
    }
}
