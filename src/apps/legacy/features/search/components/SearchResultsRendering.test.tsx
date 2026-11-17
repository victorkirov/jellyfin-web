import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ items: vi.fn(), artists: vi.fn(), people: vi.fn(), studios: vi.fn(), build: vi.fn() }));
vi.mock('hooks/useApi', () => ({ useApi: () => ({ api: { basePath: 'mock' }, user: { Id: 'user' } }) }));
vi.mock('@jellyfin/sdk/lib/utils/api/library-api', () => ({ getLibraryApi: () => ({ getItems: mocks.items }) }));
vi.mock('@jellyfin/sdk/lib/utils/api/artist-api', () => ({ getArtistApi: () => ({ getArtists: mocks.artists }) }));
vi.mock('@jellyfin/sdk/lib/utils/api/person-api', () => ({ getPersonApi: () => ({ getPersons: mocks.people }) }));
vi.mock('@jellyfin/sdk/lib/utils/api/studio-api', () => ({ getStudioApi: () => ({ getStudios: mocks.studios }) }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('components/loading/LoadingComponent', () => ({ default: () => <div>Loading</div> }));
vi.mock('components/cardbuilder/cardBuilder', () => ({ default: { buildCards: mocks.build } }));
vi.mock('elements/emby-scroller/emby-scroller', () => ({}));
vi.mock('components/itemscontainer/emby-itemscontainer', () => ({}));
vi.mock('elements/emby-button/Button', () => ({ default: () => null }));
vi.mock('lib/focusManager', () => ({ default: {} }));

import SearchResults from './SearchResults';

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
const result = (id: string, type = 'Movie') => ({ data: { Items: [{ Id: id, Type: type }] } });
function deferred() {
    let resolve!: (value: ReturnType<typeof result>) => void;
    const promise = new Promise<ReturnType<typeof result>>(complete => {
        resolve = complete;
    });
    return { promise, resolve };
}
function render() {
    root.render(<QueryClientProvider client={client}><MemoryRouter><SearchResults query='query' /></MemoryRouter></QueryClientProvider>);
}
async function waitForRequests(count: number) {
    await vi.waitFor(async () => {
        await act(async () => { /* Flush source notifications. */ });
        expect(client.isFetching()).toBe(count);
    });
}
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    Object.values(mocks).forEach(mock => {
        mock.mockReset();
    });
    mocks.build.mockImplementation((items: { Id: string }[], { itemsContainer }: { itemsContainer: HTMLElement }) => {
        itemsContainer.textContent = '';
        for (const item of items) {
            const button = document.createElement('button');
            button.textContent = item.Id;
            itemsContainer.appendChild(button);
        }
    });
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => {
    act(() => root.unmount());
    client.clear();
    container.remove();
    vi.unstubAllGlobals();
});

describe('search row rendering with real source hooks and rows', () => {
    it('builds each row once after staggered sources settle and preserves a focused card on rerender', async () => {
        const sources = [deferred(), deferred(), deferred(), deferred(), deferred()];
        mocks.artists.mockReturnValue(sources[0].promise);
        mocks.people.mockReturnValue(sources[1].promise);
        mocks.studios.mockReturnValue(sources[2].promise);
        mocks.items.mockImplementation((params: { mediaTypes?: string[]; limit?: number }) => {
            if (params.limit === 800) return Promise.resolve(result('movie'));
            return params.mediaTypes ? sources[3].promise : sources[4].promise;
        });
        await act(async () => render());
        await waitForRequests(5);
        expect(container.textContent).toBe('Loading');
        expect(mocks.build).not.toHaveBeenCalled();
        for (let index = 0; index < sources.length; index++) {
            await act(async () => sources[index].resolve(result('source-' + index)));
            await waitForRequests(sources.length - index - 1);
            if (index < sources.length - 1) {
                expect(container.textContent).toBe('Loading');
                expect(mocks.build).not.toHaveBeenCalled();
            }
        }
        await vi.waitFor(() => expect(mocks.build).toHaveBeenCalledTimes(6));
        const card = container.querySelector<HTMLElement>('.itemsContainer button')!;
        card.focus();
        await act(async () => render());
        expect(mocks.build).toHaveBeenCalledTimes(6);
        expect(document.activeElement).toBe(card);
        expect(card.isConnected).toBe(true);
    });

    it('keeps existing cards and focus when a new section sorts above them', async () => {
        mocks.artists.mockResolvedValue({ data: { Items: [] } });
        mocks.people.mockResolvedValue(result('person'));
        mocks.studios.mockResolvedValue({ data: { Items: [] } });
        mocks.items.mockResolvedValue({ data: { Items: [] } });
        await act(async () => render());
        await waitForRequests(0);
        await vi.waitFor(() => expect(mocks.build).toHaveBeenCalledTimes(1));
        const card = container.querySelector<HTMLElement>('.itemsContainer button')!;
        card.focus();
        await act(async () => client.setQueryData(['Server', 'mock', 'User', 'user', 'Search', 'PrimaryItems', undefined, undefined, 'query'], [
            { title: 'Movies', items: [{ Id: 'movie', Type: 'Movie' }] }
        ]));
        await vi.waitFor(() => expect(container.querySelectorAll('.verticalSection')).toHaveLength(2));
        expect(mocks.build).toHaveBeenCalledTimes(2);
        expect(document.activeElement).toBe(card);
        expect(card.isConnected).toBe(true);
    });
});
