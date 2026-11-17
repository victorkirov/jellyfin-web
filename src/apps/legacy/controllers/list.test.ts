import { beforeEach, describe, expect, it, vi } from 'vitest';
import ItemsView from './list';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import loading from 'components/loading/loading';
import focusManager from 'lib/focusManager';
import LibraryMenu from 'scripts/libraryMenu';

vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('scripts/settings/userSettings', () => ({ libraryPageSize: () => 2, get: vi.fn(), getFilter: vi.fn(), getSortValuesLegacy: () => ({ sortBy: 'SortName', sortOrder: 'Ascending' }) }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApiClient: vi.fn() } }));
vi.mock('lib/focusManager', () => ({ default: { autoFocus: vi.fn() } }));
vi.mock('components/loading/loading', () => ({ default: { show: vi.fn(), hide: vi.fn() } }));
vi.mock('scripts/libraryMenu', () => ({ default: { setTitle: vi.fn() } }));
vi.mock('components/playback/playbackmanager', () => ({ playbackManager: { canQueue: () => true } }));
vi.mock('components/listview/listview', () => ({ default: {} }));
vi.mock('components/cardbuilder/cardBuilder', () => ({ default: {} }));
vi.mock('scripts/alphanumericshortcuts', () => ({ default: class { destroy() { /* No document listeners in this test. */ } } }));
vi.mock('components/alphaPicker/alphaPicker', () => ({ default: class { on() { /* No input handlers in this test. */ } off() { /* No input handlers in this test. */ } destroy() { /* No input handlers in this test. */ } } }));
vi.mock('components/itemscontainer/emby-itemscontainer', () => ({}));
vi.mock('elements/emby-scroller/emby-scroller', () => ({}));

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

const flush = async () => {
    for (let index = 0; index < 8; index++) await Promise.resolve();
};
beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    document.body.innerHTML = '';
});

function setup() {
    const view = document.createElement('div');
    view.innerHTML = '<div class="itemsViewSettingsContainer"><div class="alphaPicker"></div></div><div class="itemsContainer"></div><button class="btnPlay"></button><button class="btnShuffle"></button><button class="btnQueue"></button>';
    document.body.appendChild(view);
    const container = Object.assign(view.querySelector<HTMLElement>('.itemsContainer')!, { resume: vi.fn<(options: { refresh: boolean }) => Promise<void>>(() => Promise.resolve()), pause: vi.fn() });
    const item = { Id: 'folder', Name: 'Folder', Type: 'Folder' };
    const getItem = vi.fn().mockResolvedValue(item);
    vi.mocked(ServerConnections.getApiClient).mockReturnValue({ getItem, getCurrentUserId: () => 'user' } as never);
    const controller = new ItemsView(view, { serverId: 'server', parentId: 'folder' });
    const show = (isRestored = false) => view.dispatchEvent(new CustomEvent('viewshow', { detail: { isRestored } }));
    return { view, container, getItem, item, controller, show };
}

describe('List outer-load ownership', () => {
    it('loads the context item before resuming and preserves Back restoration', async () => {
        const { show, container, controller, item } = setup();
        show();
        await flush();
        expect(controller.currentItem).toEqual(item);
        expect(container.resume).toHaveBeenCalledWith({ refresh: true });
        expect(focusManager.autoFocus).toHaveBeenCalledWith(container);
        show(true);
        await flush();
        expect(container.resume).toHaveBeenLastCalledWith({ refresh: false });
        expect(focusManager.autoFocus).toHaveBeenCalledTimes(1);
    });

    it('refreshes on Back after the first context lookup was interrupted and ignores its stale result', async () => {
        const { show, view, getItem, item, controller, container } = setup();
        const first = deferred<typeof item>();
        getItem.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ ...item, Name: 'Restored' });
        show();
        view.dispatchEvent(new Event('viewhide'));
        show(true);
        await flush();
        expect(getItem).toHaveBeenCalledTimes(2);
        expect(container.resume).toHaveBeenCalledWith({ refresh: true });
        expect(controller.currentItem?.Name).toBe('Restored');
        vi.mocked(LibraryMenu.setTitle).mockClear();
        vi.mocked(loading.hide).mockClear();
        vi.mocked(focusManager.autoFocus).mockClear();
        first.resolve(item);
        await flush();
        expect(controller.currentItem?.Name).toBe('Restored');
        expect(container.resume).toHaveBeenCalledOnce();
        expect(LibraryMenu.setTitle).not.toHaveBeenCalled();
        expect(loading.hide).not.toHaveBeenCalled();
        expect(focusManager.autoFocus).not.toHaveBeenCalled();
    });

    it('refreshes on Back when the first container resume did not complete while visible', async () => {
        const { show, view, container } = setup();
        const first = deferred<void>();
        container.resume.mockReturnValueOnce(first.promise);
        show();
        await flush();
        view.dispatchEvent(new Event('viewhide'));
        show(true);
        await flush();
        expect(container.resume.mock.calls.map(([options]) => options.refresh)).toEqual([true, true]);
        vi.mocked(loading.hide).mockClear();
        vi.mocked(focusManager.autoFocus).mockClear();
        first.resolve();
        await flush();
        expect(loading.hide).not.toHaveBeenCalled();
        expect(focusManager.autoFocus).not.toHaveBeenCalled();
    });

    it.each(['context', 'items'])('refreshes after a failed %s load showed Retry and Back restores the view', async stage => {
        const { show, view, getItem, container } = setup();
        if (stage === 'context') getItem.mockRejectedValueOnce(new Error('lookup failed'));
        else container.resume.mockRejectedValueOnce(new Error('items failed'));
        show();
        await flush();
        expect(view.querySelector('.listLoadStatus button')).not.toBeNull();
        view.dispatchEvent(new Event('viewhide'));
        show(true);
        await flush();
        expect(getItem).toHaveBeenCalledTimes(2);
        expect(container.resume).toHaveBeenLastCalledWith({ refresh: true });
        expect(view.querySelector('.listLoadStatus')).toBeNull();
        view.dispatchEvent(new Event('viewhide'));
        show(true);
        await flush();
        expect(container.resume).toHaveBeenLastCalledWith({ refresh: false });
    });

    it('keeps completed content and selected-row focus on Back', async () => {
        const { show, view, container } = setup();
        container.resume.mockImplementation(async ({ refresh }) => {
            if (refresh) container.innerHTML = '<button>Selected episode</button>';
        });
        show();
        await flush();
        const selectedRow = container.querySelector<HTMLButtonElement>('button')!;
        selectedRow.focus();
        view.dispatchEvent(new Event('viewhide'));
        vi.mocked(focusManager.autoFocus).mockClear();
        show(true);
        await flush();
        expect(container.resume).toHaveBeenLastCalledWith({ refresh: false });
        expect(container.querySelector('button')).toBe(selectedRow);
        expect(document.activeElement).toBe(selectedRow);
        expect(focusManager.autoFocus).not.toHaveBeenCalled();
    });

    it.each(['viewhide', 'viewdestroy'])('ignores a context item arriving after %s', async event => {
        const { show, view, getItem, item, container } = setup();
        const request = deferred<typeof item>();
        getItem.mockReturnValue(request.promise);
        show();
        view.dispatchEvent(new Event(event));
        vi.mocked(loading.hide).mockClear();
        vi.mocked(LibraryMenu.setTitle).mockClear();
        request.resolve(item);
        await flush();
        expect(container.resume).not.toHaveBeenCalled();
        expect(LibraryMenu.setTitle).not.toHaveBeenCalled();
        expect(loading.hide).not.toHaveBeenCalled();
        expect(focusManager.autoFocus).not.toHaveBeenCalled();
    });

    it('does not focus or hide another page loading after its resume completes', async () => {
        const { show, view, container } = setup();
        const request = deferred<void>();
        container.resume.mockReturnValue(request.promise);
        show();
        await flush();
        view.dispatchEvent(new Event('viewhide'));
        vi.mocked(loading.hide).mockClear();
        request.resolve();
        await flush();
        expect(focusManager.autoFocus).not.toHaveBeenCalled();
        expect(loading.hide).not.toHaveBeenCalled();
    });

    it('keeps the newest context item when an earlier view load completes later', async () => {
        const { show, getItem, item, controller, container } = setup();
        const first = deferred<typeof item>();
        const second = deferred<typeof item>();
        getItem.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        show();
        show(true);
        second.resolve({ ...item, Name: 'Newest' });
        await flush();
        first.resolve(item);
        await flush();
        expect(controller.currentItem?.Name).toBe('Newest');
        expect(container.resume).toHaveBeenCalledOnce();
        expect(container.resume).toHaveBeenCalledWith({ refresh: true });
    });

    it('retries when the items container rejects after context lookup succeeds', async () => {
        const { show, view, container } = setup();
        container.resume.mockRejectedValueOnce(new Error('items failed'));
        show();
        await flush();
        expect(view.querySelector('.listLoadStatus')).not.toBeNull();
        view.querySelector<HTMLButtonElement>('.listLoadStatus button')!.click();
        await flush();
        expect(container.resume).toHaveBeenCalledTimes(2);
        expect(view.querySelector('.listLoadStatus')).toBeNull();
    });

    it('offers one explicit retry after context lookup fails and resumes successfully', async () => {
        const { show, view, getItem, container } = setup();
        getItem.mockRejectedValueOnce(new Error('offline'));
        show();
        await flush();
        expect(loading.hide).toHaveBeenCalled();
        expect(container.resume).not.toHaveBeenCalled();
        const retry = view.querySelector<HTMLButtonElement>('.listLoadStatus button');
        expect(retry).not.toBeNull();
        retry!.click();
        await flush();
        expect(getItem).toHaveBeenCalledTimes(2);
        expect(container.resume).toHaveBeenCalledOnce();
        expect(view.querySelector('.listLoadStatus')).toBeNull();
    });
});
