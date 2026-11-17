import { getQueryPagingHtml } from './libraryPagingMarkup';
export { getQueryPagingHtml } from './libraryPagingMarkup';
import { showSortMenu } from './librarySortMenu';
export { showSortMenu } from './librarySortMenu';

import globalize from 'lib/globalize';

export function showLayoutMenu (target: EventTarget | null, currentLayout?: string, views?: string[]) {
    // Layout menus are opened by click targets or the inline paging button.
    const button = target as HTMLElement;
    if (!views) {
        const layouts = button.getAttribute('data-layouts');
        views = layouts ? layouts.split(',') : ['List', 'Poster', 'PosterCard', 'Thumb', 'ThumbCard'];
    }

    const menuItems = views.map(function (view) {
        return {
            name: globalize.translate(view),
            id: view,
            selected: currentLayout == view
        };
    });

    void import('../components/actionSheet/actionSheet').then(({ default: actionsheet }) => {
        actionsheet.show({
            items: menuItems,
            positionTo: button,
            callback: function (id) {
                button.dispatchEvent(new CustomEvent('layoutchange', {
                    detail: {
                        viewStyle: id
                    },
                    bubbles: true,
                    cancelable: false
                }));
            }
        }).catch(() => { /* no-op */ });
    });
}

const libraryBrowser = {
    showLayoutMenu,
    getQueryPagingHtml,
    showSortMenu
};

declare global {
    interface Window {
        LibraryBrowser: typeof libraryBrowser;
    }
}

window.LibraryBrowser = libraryBrowser;

export default libraryBrowser;
