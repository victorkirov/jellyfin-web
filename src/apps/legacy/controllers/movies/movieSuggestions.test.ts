import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadSuggestionsTab } from './movieSuggestions';

const mocks = vi.hoisted(() => ({ latest: vi.fn(), resume: vi.fn(), suggestions: vi.fn(), focus: vi.fn() }));
vi.mock('scripts/inputManager', () => ({ default: { on: vi.fn(), off: vi.fn() } }));
vi.mock('scripts/settings/userSettings', () => ({}));
vi.mock('lib/jellyfin-apiclient/ServerConnections', () => ({ default: { getApi: () => ({}) } }));
vi.mock('lib/queries/latestMedia', () => ({ getLatestMediaQuery: () => ({}) }));
vi.mock('utils/query/queryClient', () => ({ queryClient: { fetchQuery: mocks.latest } }));
vi.mock('components/images/imageLoader', () => ({ default: { lazyChildren: vi.fn() } }));
vi.mock('lib/layoutManager', () => ({ default: { tv: true } }));
vi.mock('utils/dom', () => ({ default: { getWindowSize: () => ({ innerWidth: 1920 }) } }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('components/cardbuilder/cardBuilder', () => ({ default: {
    buildCards: (items: { Name: string }[], options: { itemsContainer: HTMLElement }) => {
        options.itemsContainer.innerHTML = items.map(item => '<a href="#" class="card">' + item.Name + '</a>').join('');
    },
    getCardsHtml: () => '<a href="#" class="card">Recommendation</a>'
} }));
vi.mock('lib/focusManager', () => ({ default: { focus: mocks.focus } }));
vi.mock('components/autoFocuser.js', () => ({ default: { autoFocus: (page: HTMLElement) => mocks.focus(page.querySelector('.card')) } }));

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(resolvePromise => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}
let view: HTMLElement;
beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) {
        return this.parentElement;
    });
    mocks.focus.mockImplementation((target: HTMLElement) => target?.focus());
    vi.stubGlobal('ApiClient', { getCurrentUserId: () => 'user', serverId: () => 'server', getItems: mocks.resume, getJSON: mocks.suggestions, getUrl: () => '/recommendations' });
    document.body.innerHTML = '<button class="emby-tab-button-active">Suggestions</button><main><section><div id="resumableSection" class="hide"><div class="itemsContainer" id="resumableItems"></div></div><div class="itemsContainer" id="recentlyAddedItems"></div><div class="recommendations"></div><div class="noItemsMessage hide"></div></section></main>';
    view = document.querySelector('main')!;
});
afterEach(() => {
    view.dispatchEvent(new Event('viewbeforehide'));
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
});

it('9: waits for Continue Watching when later rows resolve first and focuses once', async () => {
    const resume = deferred<{ Items: { Name: string }[] }>();
    const recommendations = deferred<never[]>();
    mocks.resume.mockReturnValue(resume.promise);
    mocks.latest.mockResolvedValue([{ Name: 'Latest' }]);
    mocks.suggestions.mockReturnValue(recommendations.promise);
    const pending = loadSuggestionsTab(view, {}, view.querySelector('section')!);
    await vi.waitFor(() => expect(view.querySelector('#recentlyAddedItems .card')).not.toBeNull());
    expect(mocks.focus).not.toHaveBeenCalled();
    resume.resolve({ Items: [{ Name: 'Resume' }] });
    await pending;
    await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Resume'));
    recommendations.resolve([]);
    await Promise.resolve();
    expect(mocks.focus).toHaveBeenCalledTimes(1);
});

it.each(['move', 'hide'])('9: %s while loading cancels the pending focus decision', async action => {
    const resume = deferred<{ Items: { Name: string }[] }>();
    mocks.resume.mockReturnValue(resume.promise);
    mocks.latest.mockResolvedValue([]);
    mocks.suggestions.mockResolvedValue([]);
    const pending = loadSuggestionsTab(view, {}, view.querySelector('section')!);
    if (action === 'move') document.querySelector<HTMLButtonElement>('button')!.focus();
    else view.dispatchEvent(new Event('viewbeforehide'));
    resume.resolve({ Items: [{ Name: 'Resume' }] });
    await pending;
    await vi.dynamicImportSettled();
    expect(mocks.focus).not.toHaveBeenCalled();
});

it('9: an empty first section falls through to Latest, and all-empty focuses the active tab', async () => {
    mocks.resume.mockResolvedValue({ Items: [] });
    mocks.latest.mockResolvedValue([{ Name: 'Latest' }]);
    mocks.suggestions.mockResolvedValue([]);
    await loadSuggestionsTab(view, {}, view.querySelector('section')!);
    expect(document.activeElement?.textContent).toBe('Latest');
    mocks.latest.mockResolvedValue([]);
    await loadSuggestionsTab(view, {}, view.querySelector('section')!);
    expect(document.activeElement).toBe(document.querySelector('button'));
});
