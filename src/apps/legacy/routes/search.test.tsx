import React, { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const searchFields = vi.hoisted(() => vi.fn<(props: { onSearch: (value: string) => void }) => null>(() => null));
vi.mock('apps/legacy/features/search/components/SearchFields', () => ({ default: searchFields }));
vi.mock('apps/legacy/features/search/components/SearchResults', () => ({
    default: ({ query }: { query: string }) => <div>{query}</div>
}));
vi.mock('apps/legacy/features/search/components/SearchSuggestions', () => ({ default: () => <div>Suggestions</div> }));
vi.mock('components/Page', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));

import Search from './search';

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
    searchFields.mockClear();
});

function mount(query = '') {
    act(() => root.render(
        <MemoryRouter initialEntries={['/search?query=' + query]}>
            <Search />
        </MemoryRouter>
    ));
}

function search(query: string) {
    const props = searchFields.mock.lastCall?.[0];
    act(() => props?.onSearch(query));
}

function advance(milliseconds: number) {
    act(() => {
        vi.advanceTimersByTime(milliseconds);
    });
}

describe('Search debounce', () => {
    it('uses the initial URL query immediately and waits 500 ms for changes', () => {
        mount('initial');
        expect(container.textContent).toBe('initial');
        search('next');
        advance(499);
        expect(container.textContent).toBe('initial');
        advance(1);
        expect(container.textContent).toBe('next');
    });

    it('cancels superseded queries and debounces returning to suggestions', () => {
        mount();
        search('first');
        advance(300);
        search('second');
        advance(200);
        expect(container.textContent).toBe('Suggestions');
        advance(300);
        expect(container.textContent).toBe('second');
        search('');
        advance(499);
        expect(container.textContent).toBe('second');
        advance(1);
        expect(container.textContent).toBe('Suggestions');
    });

    it('cancels the pending update when the route unmounts', () => {
        mount();
        search('pending');
        expect(vi.getTimerCount()).toBe(1);
        act(() => root.render(<div>Another route</div>));
        expect(vi.getTimerCount()).toBe(0);
        advance(500);
        expect(container.textContent).toBe('Another route');
    });
});
