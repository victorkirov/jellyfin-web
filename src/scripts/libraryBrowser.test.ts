import { beforeEach, expect, it, vi } from 'vitest';
import libraryBrowser, { getQueryPagingHtml, showLayoutMenu, showSortMenu } from './libraryBrowser';

const mocks = vi.hoisted(() => ({
    createDialog: vi.fn(() => document.createElement('div')),
    open: vi.fn(() => Promise.resolve()),
    show: vi.fn<(options: unknown) => Promise<void>>(() => Promise.resolve())
}));

vi.mock('lib/globalize', () => ({ default: { translate: (key: string, ...args: number[]) => [key, ...args].join(':') } }));
vi.mock('components/dialogHelper/dialogHelper', () => ({ default: { createDialog: mocks.createDialog, open: mocks.open } }));
vi.mock('components/actionSheet/actionSheet', () => ({ default: { show: mocks.show } }));
vi.mock('elements/emby-radio/emby-radio', () => ({}));

beforeEach(() => vi.clearAllMocks());

it('keeps the window facade and paging limits for callers', () => {
    expect(window.LibraryBrowser).toBe(libraryBrowser);
    const parent = document.createElement('div');
    parent.innerHTML = getQueryPagingHtml({ startIndex: 0, limit: 20, totalRecordCount: 50 });
    expect(parent.textContent).toContain('ListPaging:1:20:50');
    expect(parent.querySelector<HTMLButtonElement>('.btnPreviousPage')!.disabled).toBe(true);
    expect(parent.querySelector<HTMLButtonElement>('.btnNextPage')!.disabled).toBe(false);
    parent.innerHTML = getQueryPagingHtml({ startIndex: 40, limit: 20, totalRecordCount: 50 });
    expect(parent.textContent).toContain('ListPaging:41:50:50');
    expect(parent.querySelector<HTMLButtonElement>('.btnNextPage')!.disabled).toBe(true);
});

it('opens layout choices and dispatches the selected layout to the caller', async () => {
    const button = document.createElement('button');
    button.setAttribute('data-layouts', 'List,Poster');
    const changed = vi.fn();
    button.addEventListener('layoutchange', changed);
    showLayoutMenu(button, 'Poster');
    await vi.waitFor(() => expect(mocks.show).toHaveBeenCalled());
    const options = mocks.show.mock.calls[0][0] as unknown as {
        items: { id: string; selected: boolean }[]; callback(id: string): void;
    };
    expect(options.items).toEqual([
        { name: 'List', id: 'List', selected: false },
        { name: 'Poster', id: 'Poster', selected: true }
    ]);
    options.callback('List');
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ detail: { viewStyle: 'List' } }));
});

it('updates sort fields and resets paging through the existing callback', async () => {
    const query = { SortBy: 'SortName', SortOrder: 'Ascending', StartIndex: 40 };
    const callback = vi.fn();
    showSortMenu({ items: [{ id: 'SortName', name: 'Name' }, { id: 'DateCreated,SortName', name: 'Added' }], query, callback });
    await vi.waitFor(() => expect(mocks.open).toHaveBeenCalled());
    expect(mocks.createDialog).toHaveBeenCalledWith({ removeOnClose: true, modal: false });
    const dialog = mocks.createDialog.mock.results[0].value as HTMLDivElement;
    const by = dialog.querySelector<HTMLInputElement>('[value="DateCreated_SortName"]')!;
    by.checked = true;
    by.dispatchEvent(new Event('change'));
    expect(query).toEqual({ SortBy: 'DateCreated,SortName', SortOrder: 'Ascending', StartIndex: 0 });
    const order = dialog.querySelector<HTMLInputElement>('[value="Descending"]')!;
    order.checked = true;
    order.dispatchEvent(new Event('change'));
    expect(query.SortOrder).toBe('Descending');
    expect(callback).toHaveBeenCalledTimes(2);
});
