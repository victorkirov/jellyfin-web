import { focusLibraryRefresh, isLibraryDialogFocused } from './libraryRail';
import type { BaseItemDtoQueryResult } from '@jellyfin/sdk/lib/generated-client';
import loading from 'components/loading/loading';
import type { LibraryQuery, LibraryResult } from './libraryControllerTypes';

type RefreshOptions = {
    view: HTMLElement;
    focus: HTMLElement;
    getQuery(): LibraryQuery;
    load(query: LibraryQuery): Promise<BaseItemDtoQueryResult>;
    render(result: LibraryResult, query: LibraryQuery): void;
    onError?(): void;
};

export function createLibraryRefresh({ view, focus, getQuery, load, render, onError }: RefreshOptions) {
    let requestId = 0;
    let active = true;
    let destroyed = false;
    let isLoading = false;
    let interrupted = false;
    const fetchResult = async (query: LibraryQuery) => load(query);

    const refresh = (): Promise<void> => {
        if (destroyed) return Promise.resolve();
        active = true;
        const request = ++requestId;
        const query = { ...getQuery() };
        isLoading = true;
        loading.show();
        return fetchResult(query).then(response => {
            if (!active || request !== requestId) return;
            // The legacy paging endpoints include these fields for library requests.
            render(response as LibraryResult, query);
            interrupted = false;
            if (focusLibraryRefresh(focus)) return;
            return import('components/autoFocuser').then(({ default: autoFocuser }) => {
                if (active && request === requestId && !isLibraryDialogFocused()) autoFocuser.autoFocus(focus);
            });
        }).catch((error: unknown) => {
            if (!active || request !== requestId) return;
            onError?.();
            throw error;
        }).finally(() => {
            if (request === requestId) {
                isLoading = false;
                loading.hide();
            }
        });
    };
    const refreshSafely = () => {
        if (!active) return;
        void refresh().catch(console.error);
    };
    const pause = () => {
        interrupted = interrupted || isLoading;
        active = false;
        requestId++;
        if (isLoading) loading.hide();
        isLoading = false;
    };
    view.addEventListener('viewbeforehide', pause);
    const destroy = () => {
        pause();
        destroyed = true;
    };
    view.addEventListener('viewdestroy', destroy);
    view.addEventListener('viewshow', () => {
        if (!destroyed) active = true;
    });
    return { refresh, refreshSafely, destroy, isInterrupted: () => interrupted, isLoading: () => isLoading, getRequestId: () => requestId };
}
