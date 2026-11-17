import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CollectionType } from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ items: vi.fn(), artists: vi.fn(), people: vi.fn(), studios: vi.fn() }));
vi.mock('hooks/useApi', () => ({ useApi: () => ({ api: { basePath: 'mock' }, user: { Id: 'user' } }) }));
vi.mock('@jellyfin/sdk/lib/utils/api/library-api', () => ({ getLibraryApi: () => ({ getItems: mocks.items }) }));
vi.mock('@jellyfin/sdk/lib/utils/api/artist-api', () => ({ getArtistApi: () => ({ getArtists: mocks.artists }) }));
vi.mock('@jellyfin/sdk/lib/utils/api/person-api', () => ({ getPersonApi: () => ({ getPersons: mocks.people }) }));
vi.mock('@jellyfin/sdk/lib/utils/api/studio-api', () => ({ getStudioApi: () => ({ getStudios: mocks.studios }) }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('components/loading/LoadingComponent', () => ({ default: () => <div>Loading</div> }));
vi.mock('elements/emby-button/Button', () => ({ default: ({ title, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{title}</button> }));
vi.mock('lib/focusManager', () => ({ default: { autoFocus: (el: HTMLElement) => el.querySelector<HTMLElement>('button,a'), focus: (el: HTMLElement) => el.focus() } }));
vi.mock('./SearchResultsRow', () => ({ default: ({ title }: { title: string }) => <a href='#result'>{title}</a> }));

import SearchResults from './SearchResults';

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
const empty = { data: { Items: [] } };
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    Object.values(mocks).forEach(mock => {
        mock.mockReset().mockResolvedValue(empty);
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
async function mount(collectionType?: CollectionType) {
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter>
        <input id='searchTextInput' /><SearchResults query='retained query' collectionType={collectionType} />
    </MemoryRouter></QueryClientProvider>));
    await vi.waitFor(async () => {
        await act(async () => { /* Flush query notifications. */ });
        expect(container.textContent).not.toBe('Loading');
    });
}

describe('search request states with real aggregate queries', () => {
    it('reports successful emptiness separately', async () => {
        await mount();
        expect(container.textContent).toContain('SearchResultsEmpty');
        expect(container.textContent).not.toContain('SearchLoadError');
    });
    it('reports complete failure and retries the same query, restoring focus to results', async () => {
        Object.values(mocks).forEach(mock => {
            mock.mockRejectedValue(new Error('offline'));
        });
        await mount();
        expect(container.textContent).toContain('SearchLoadError');
        expect(container.textContent).not.toContain('SearchResultsEmpty');
        const retry = container.querySelector('button')!;
        retry.focus();
        Object.values(mocks).forEach(mock => {
            mock.mockResolvedValue(empty);
        });
        mocks.items.mockResolvedValue({ data: { Items: [{ Id: 'movie', Type: 'Movie' }] } });
        await act(async () => retry.click());
        await vi.waitFor(async () => {
            await act(async () => { /* Flush query notifications. */ });
            expect(container.textContent).toContain('Movies');
        });
        expect(document.activeElement).toBe(container.querySelector('a'));
        expect(mocks.items.mock.lastCall?.[0].searchTerm).toBe('retained query');
    });
    it('keeps successful sections on subsidiary failure and keeps Retry focused after a failed retry', async () => {
        mocks.people.mockRejectedValue(new Error('people unavailable'));
        mocks.items.mockResolvedValue({ data: { Items: [{ Id: 'movie', Type: 'Movie' }] } });
        await mount();
        expect(container.textContent).toContain('Movies');
        expect(container.textContent).toContain('SearchLoadError');
        const retry = container.querySelector('button')!;
        retry.focus();
        await act(async () => retry.click());
        await vi.waitFor(async () => {
            await act(async () => { /* Flush query notifications. */ });
            expect(retry.disabled).toBe(false);
        });
        expect(document.activeElement).toBe(retry);
    });
    it('keeps subsidiary successes when the main request fails', async () => {
        mocks.items.mockRejectedValue(new Error('items unavailable'));
        mocks.people.mockResolvedValue({ data: { Items: [{ Id: 'person' }] } });
        await mount();
        expect(container.textContent).toContain('People');
        expect(container.textContent).toContain('SearchLoadError');
    });
    it('returns focus to the search field when a retry succeeds with no matches', async () => {
        mocks.people.mockRejectedValue(new Error('offline'));
        await mount();
        const retry = container.querySelector('button')!;
        retry.focus();
        mocks.people.mockResolvedValue(empty);
        await act(async () => retry.click());
        await vi.waitFor(async () => {
            await act(async () => { /* Flush query notifications. */ });
            expect(container.textContent).toContain('SearchResultsEmpty');
        });
        expect(document.activeElement).toBe(container.querySelector('input'));
        expect(container.textContent).not.toContain('SearchLoadError');
    });
    it('keeps Live TV categories when one category fails', async () => {
        mocks.items.mockImplementation(async (params: { isMovie?: boolean }) => {
            if (params.isMovie === true) throw new Error('movies unavailable');
            return { data: { Items: [{ Id: 'channel' }] } };
        });
        await mount(CollectionType.Livetv);
        expect(container.textContent).toContain('Channels');
        expect(container.textContent).toContain('SearchLoadError');
    });
});
