import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { lazyChildren, focus, autoFocus, registerElement, sortable, subscribe, onUserDataChanged, onTimerCreated, onTimerCancelled, onSeriesTimerCancelled, eventOn } = vi.hoisted(() => ({
    lazyChildren: vi.fn(),
    focus: vi.fn(),
    autoFocus: vi.fn(),
    registerElement: vi.fn(),
    sortable: vi.fn(),
    subscribe: vi.fn<(types: string[], handler: (message: object) => void) => () => void>().mockReturnValue(vi.fn()),
    onUserDataChanged: vi.fn(),
    onTimerCreated: vi.fn(),
    onTimerCancelled: vi.fn(),
    onSeriesTimerCancelled: vi.fn(),
    eventOn: vi.fn()
}));

vi.mock('webcomponents.js/webcomponents-lite', () => ({}));
vi.mock('sortablejs', () => ({ default: sortable }));
vi.mock('../../components/shortcuts', () => ({ default: { on: vi.fn(), off: vi.fn() } }));
vi.mock('../../scripts/inputManager', () => ({ default: {} }));
vi.mock('../../components/playback/playbackmanager', () => ({ playbackManager: {} }));
vi.mock('../../components/images/imageLoader', () => ({ default: { lazyChildren } }));
vi.mock('../../components/layoutManager', () => ({ default: { tv: true } }));
vi.mock('../../scripts/browser', () => ({ default: {} }));
vi.mock('../../utils/dom', () => ({ default: {} }));
vi.mock('../../components/focusManager', () => ({ default: { focus, autoFocus } }));
vi.mock('lib/jellyfin-apiclient', () => ({
    ServerConnections: {
        currentApiClient: () => ({ subscribe })
    }
}));

vi.mock('../../components/cardbuilder/cardBuilder', () => ({
    onUserDataChanged, onTimerCreated, onTimerCancelled, onSeriesTimerCancelled
}));

beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('Events', { on: eventOn, off: vi.fn() });
    Object.defineProperty(document, 'registerElement', { configurable: true, value: registerElement });
    await import('./emby-itemscontainer');
});

afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
});

function createContainer() {
    const container = Object.assign(document.createElement('div'), {
        fetchData: vi.fn().mockResolvedValue({ Items: [{}] }),
        getItemsHtml: vi.fn(() => '<button data-id="one">One</button>'),
        afterRefresh: vi.fn()
    });
    const prototype = registerElement.mock.calls[0][1].prototype;
    Object.setPrototypeOf(container, prototype);
    document.body.appendChild(container);
    return { container, prototype };
}

describe('item container refreshes', () => {
    it('keeps only the latest response and its focus restoration', async () => {
        const { container, prototype } = createContainer();
        let resolveFirst!: (result: object) => void;
        container.fetchData.mockReturnValueOnce(new Promise(resolve => {
            resolveFirst = resolve;
        }));
        const first = prototype.refreshItems.call(container);
        await prototype.refreshItems.call(container);
        const button = container.querySelector('button')!;
        button.focus();
        resolveFirst({ Items: [{ Id: 'stale' }] });
        await first;
        expect(container.getItemsHtml).toHaveBeenCalledTimes(1);
        expect(container.afterRefresh).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(button);
    });

    it('retries a failed request on resume', async () => {
        const { container, prototype } = createContainer();
        container.fetchData.mockRejectedValueOnce(new Error('offline'));
        await expect(prototype.refreshItems.call(container)).rejects.toThrow('offline');
        await prototype.resume.call(container);
        expect(container.fetchData).toHaveBeenCalledTimes(2);
        expect(container.textContent).toBe('One');
    });

    it('invalidates a request even when resumed before it completes', async () => {
        const { container, prototype } = createContainer();
        let resolveFirst!: (result: object) => void;
        container.fetchData.mockReturnValueOnce(new Promise(resolve => {
            resolveFirst = resolve;
        }));
        const first = prototype.refreshItems.call(container);
        prototype.pause.call(container);
        await prototype.resume.call(container);
        resolveFirst({ Items: [{ Id: 'stale' }] });
        await first;
        expect(container.fetchData).toHaveBeenCalledTimes(2);
        expect(container.getItemsHtml).toHaveBeenCalledTimes(1);
    });

    it('clears delayed refreshes and invalidates pending work on detach', async () => {
        vi.useFakeTimers();
        try {
            const { container, prototype } = createContainer();
            prototype.notifyRefreshNeeded.call(container);
            expect(vi.getTimerCount()).toBe(1);
            prototype.detachedCallback.call(container);
            expect(vi.getTimerCount()).toBe(0);
            await vi.advanceTimersByTimeAsync(10000);
            expect(container.innerHTML).toBe('');
        } finally {
            vi.useRealTimers();
        }
    });

    it('coalesces a delayed refresh into resume after pause', async () => {
        vi.useFakeTimers();
        try {
            const { container, prototype } = createContainer();
            prototype.notifyRefreshNeeded.call(container);
            prototype.pause.call(container);
            expect(vi.getTimerCount()).toBe(0);
            await prototype.resume.call(container);
            expect(container.fetchData).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(10000);
            expect(container.fetchData).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('preserves existing nodes and focus when generated markup is unchanged', async () => {
        const { container, prototype } = createContainer();
        await prototype.refreshItems.call(container);
        const button = container.querySelector('button')!;
        button.focus();
        await prototype.refreshItems.call(container);
        expect(container.querySelector('button')).toBe(button);
        expect(document.activeElement).toBe(button);
        expect(lazyChildren).toHaveBeenCalledTimes(1);
        expect(container.afterRefresh).toHaveBeenCalledTimes(2);
        expect(focus).not.toHaveBeenCalled();
        expect(autoFocus).not.toHaveBeenCalled();
    });

    it('replaces changed markup and restores focus by item id', async () => {
        const { container, prototype } = createContainer();
        await prototype.refreshItems.call(container);
        const button = container.querySelector('button')!;
        button.focus();
        container.getItemsHtml.mockReturnValue('<button data-id="one">Updated</button>');
        await prototype.refreshItems.call(container);
        expect(container.querySelector('button')).not.toBe(button);
        expect(focus).toHaveBeenCalledWith(container.querySelector('button'));
        expect(lazyChildren).toHaveBeenCalledTimes(2);
    });

    it('forwards queue reorder events without refetching', async () => {
        const { container, prototype } = createContainer();
        container.getItemsHtml.mockReturnValue('<button data-playlistitemid="one">One</button><button>Two</button>');
        await prototype.refreshItems.call(container);
        prototype.enableDragReordering.call(container, true);
        const onReorder = vi.fn();
        container.addEventListener('itemdrop', onReorder);
        const firstItem = container.firstElementChild!;
        container.appendChild(firstItem);
        sortable.mock.calls[0][1].onEnd({ item: firstItem, oldIndex: 0, newIndex: 1 });
        expect(onReorder).toHaveBeenCalledOnce();
        expect(onReorder.mock.calls[0][0].detail).toEqual({
            oldIndex: 0,
            newIndex: 1,
            playlistItemId: 'one'
        });
        expect(container.textContent).toBe('TwoOne');
        expect(container.fetchData).toHaveBeenCalledTimes(1);
    });

    it('clears items when the result becomes empty', async () => {
        const { container, prototype } = createContainer();
        await prototype.refreshItems.call(container);
        container.getItemsHtml.mockReturnValue('');
        await prototype.refreshItems.call(container);
        expect(container.innerHTML).toBe('');
    });
});

describe('paused item container notifications', () => {
    it('queues in-place updates and applies them on resume without refetching', async () => {
        const { container, prototype } = createContainer();
        prototype.attachedCallback.call(container);
        prototype.pause.call(container);
        const querySelectorAll = vi.spyOn(container, 'querySelectorAll');
        for (const index of [0, 1, 3, 4]) {
            subscribe.mock.calls[index][1]({ Data: { UserDataList: [{ ItemId: 'one' }], Id: 'timer', ProgramId: 'one' } });
        }
        await vi.dynamicImportSettled();
        expect(querySelectorAll).not.toHaveBeenCalled();
        expect(onUserDataChanged).not.toHaveBeenCalled();
        expect(onTimerCreated).not.toHaveBeenCalled();
        expect(onTimerCancelled).not.toHaveBeenCalled();
        expect(onSeriesTimerCancelled).not.toHaveBeenCalled();
        await prototype.resume.call(container);
        expect(container.fetchData).not.toHaveBeenCalled();
        expect(onUserDataChanged).toHaveBeenCalledWith({ ItemId: 'one' }, container);
        expect(onTimerCreated).toHaveBeenCalledWith('one', 'timer', container);
        expect(onTimerCancelled).toHaveBeenCalledWith('timer', container);
        expect(onSeriesTimerCancelled).toHaveBeenCalledWith('timer', container);
        await prototype.resume.call(container);
        expect(onUserDataChanged).toHaveBeenCalledTimes(1);
    });

    it('ignores notifications excluded by monitor and library-parent filters', async () => {
        const { container, prototype } = createContainer();
        container.setAttribute('data-parentid', 'library-one');
        container.setAttribute('data-monitor', 'audioplayback');
        prototype.attachedCallback.call(container);
        prototype.pause.call(container);
        subscribe.mock.calls[2][1]({ Data: {} });
        subscribe.mock.calls[5][1]({ Data: { ItemsAdded: ['item'], FoldersAddedTo: ['library-two'] } });
        eventOn.mock.calls[0][2](null, { state: { NowPlayingItem: { MediaType: 'Video' } } });
        await prototype.resume.call(container);
        expect(container.fetchData).not.toHaveBeenCalled();
    });

    it.each([
        ['videoplayback', 'Video'],
        ['audioplayback', 'Audio']
    ])('refreshes only monitored %s playback', async (monitor, mediaType) => {
        const { container, prototype } = createContainer();
        container.setAttribute('data-monitor', monitor);
        prototype.attachedCallback.call(container);
        prototype.pause.call(container);
        eventOn.mock.calls[0][2](null, { state: { NowPlayingItem: { MediaType: mediaType } } });
        expect(container.fetchData).not.toHaveBeenCalled();
        await prototype.resume.call(container);
        expect(container.fetchData).toHaveBeenCalledTimes(1);
    });

    it('refreshes a matching library parent on resume', async () => {
        const { container, prototype } = createContainer();
        container.setAttribute('data-parentid', 'library-one');
        prototype.attachedCallback.call(container);
        prototype.pause.call(container);
        subscribe.mock.calls[5][1]({ Data: { ItemsAdded: ['item'], FoldersAddedTo: ['library-one'] } });
        await prototype.resume.call(container);
        expect(container.fetchData).toHaveBeenCalledTimes(1);
    });

    it('drops queued card updates when a monitored notification requires a refresh', async () => {
        const { container, prototype } = createContainer();
        container.setAttribute('data-monitor', 'markfavorite');
        prototype.attachedCallback.call(container);
        prototype.pause.call(container);
        subscribe.mock.calls[0][1]({ Data: { UserDataList: [{ ItemId: 'one' }] } });
        await prototype.resume.call(container);
        await prototype.resume.call(container);
        expect(container.fetchData).toHaveBeenCalledTimes(1);
        expect(onUserDataChanged).not.toHaveBeenCalled();
    });

    it('applies queued changes to containers without a data fetcher', async () => {
        const { container, prototype } = createContainer();
        Object.defineProperty(container, 'fetchData', { value: null });
        prototype.attachedCallback.call(container);
        prototype.pause.call(container);
        subscribe.mock.calls[0][1]({ Data: { UserDataList: [{ ItemId: 'one' }] } });
        await prototype.resume.call(container);
        expect(onUserDataChanged).toHaveBeenCalledTimes(1);
    });

    it('drops queued changes when the container is detached', async () => {
        const { container, prototype } = createContainer();
        prototype.attachedCallback.call(container);
        prototype.pause.call(container);
        subscribe.mock.calls[0][1]({ Data: { UserDataList: [{ ItemId: 'one' }] } });
        prototype.detachedCallback.call(container);
        await prototype.resume.call(container);
        expect(onUserDataChanged).not.toHaveBeenCalled();
    });

    it('updates active containers and queues an import that completes after pause', async () => {
        const { container, prototype } = createContainer();
        prototype.attachedCallback.call(container);
        const handler = subscribe.mock.calls[0][1];
        handler({ Data: { UserDataList: [{ ItemId: 'one' }] } });
        await vi.dynamicImportSettled();
        expect(onUserDataChanged).toHaveBeenCalledTimes(1);
        handler({ Data: { UserDataList: [{ ItemId: 'two' }] } });
        prototype.pause.call(container);
        handler({ Data: { UserDataList: [{ ItemId: 'three' }] } });
        await vi.dynamicImportSettled();
        expect(onUserDataChanged).toHaveBeenCalledTimes(1);
        await prototype.resume.call(container);
        expect(container.fetchData).not.toHaveBeenCalled();
        expect(onUserDataChanged.mock.calls.map(([data]) => data.ItemId)).toEqual(['one', 'two', 'three']);
    });

    it('does no render work when an in-flight fetch completes after pause', async () => {
        const { container, prototype } = createContainer();
        const refresh = prototype.refreshItems.call(container);
        prototype.pause.call(container);
        await refresh;
        expect(container.getItemsHtml).not.toHaveBeenCalled();
        expect(lazyChildren).not.toHaveBeenCalled();
        await prototype.resume.call(container);
        expect(container.getItemsHtml).toHaveBeenCalledTimes(1);
    });
});
