import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { lazyChildren, focus, autoFocus, registerElement, sortable, apiAjax } = vi.hoisted(() => ({
    lazyChildren: vi.fn(),
    focus: vi.fn(),
    autoFocus: vi.fn(),
    registerElement: vi.fn(),
    sortable: vi.fn(),
    apiAjax: vi.fn()
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
vi.mock('../../components/loading/loading', () => ({ default: { show: vi.fn(), hide: vi.fn() } }));
vi.mock('../../components/focusManager', () => ({ default: { focus, autoFocus } }));
vi.mock('lib/jellyfin-apiclient', () => ({
    ServerConnections: { getApiClient: () => ({ ajax: apiAjax, getUrl: (path: string) => path }) }
}));

beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
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

    it('restores the server order after a rejected playlist move', async () => {
        const { container, prototype } = createContainer();
        container.getItemsHtml.mockReturnValue('<button data-playlistid="playlist" data-playlistitemid="one">One</button><button>Two</button>');
        await prototype.refreshItems.call(container);
        prototype.enableDragReordering.call(container, true);
        const firstItem = container.firstElementChild!;
        container.appendChild(firstItem);
        expect(container.textContent).toBe('TwoOne');
        apiAjax.mockRejectedValueOnce(new Error('Move rejected'));
        sortable.mock.calls[0][1].onEnd({ item: firstItem, oldIndex: 0, newIndex: 1 });
        await vi.dynamicImportSettled();
        expect(container.textContent).toBe('OneTwo');
        expect(container.fetchData).toHaveBeenCalledTimes(2);
        expect(lazyChildren).toHaveBeenCalledTimes(2);
    });

    it('clears items when the result becomes empty', async () => {
        const { container, prototype } = createContainer();
        await prototype.refreshItems.call(container);
        container.getItemsHtml.mockReturnValue('');
        await prototype.refreshItems.call(container);
        expect(container.innerHTML).toBe('');
    });
});
