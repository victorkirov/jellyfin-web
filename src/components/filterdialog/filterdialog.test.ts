import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
import Events from 'utils/events';
import type { FilterQuery } from './filterTypes';

const state = vi.hoisted(() => ({ attach: undefined as undefined | ((this: HTMLElement) => void), fetch: vi.fn(), closedOnOpen: false }));
vi.mock('webcomponents.js/webcomponents-lite', () => ({}));
vi.mock('components/buttons/emby-button', () => ({}));
vi.mock('elements/emby-checkbox/emby-checkbox', () => ({}));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key, translateHtml: (html: string) => html } }));
vi.mock('./filterdialog.template.html', () => ({ default: readFileSync('src/components/filterdialog/filterdialog.template.html', 'utf8') }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApiClient: () => ({
    getCurrentUserId: () => 'user', getUrl: (_path: string, query: unknown) => query, getJSON: state.fetch
}) } }));
vi.mock('components/dialogHelper/dialogHelper', () => ({ default: {
    createDialog: () => document.createElement('div'),
    open: (dialog: HTMLElement) => {
        document.body.appendChild(dialog);
        dialog.querySelectorAll<HTMLElement>('[is="emby-collapse"]').forEach(element => {
            state.attach!.call(element);
        });
        if (state.closedOnOpen) dialog.dispatchEvent(new Event('close'));
        return Promise.resolve();
    }
} }));

beforeEach(() => {
    document.body.innerHTML = '';
    state.closedOnOpen = false;
    state.fetch.mockResolvedValue({ Genres: ['Drama', 'Comedy'], Tags: ['One'], OfficialRatings: ['PG'], Years: [2024] });
    Object.assign(document, { registerElement: (_name: string, options: { prototype: { attachedCallback: typeof state.attach } }) => {
        state.attach = options.prototype.attachedCallback;
    } });
    vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) {
        return this.closest('.hide') ? null : document.body;
    });
});

async function open(query: FilterQuery = { Genres: 'Drama' }) {
    const { default: FilterDialog } = await import('./filterdialog');
    const dialog = new FilterDialog({ mode: 'movies', serverId: 'server', query, hasFilters: true });
    void dialog.show();
    await Promise.resolve();
    return { instance: dialog, element: document.querySelector<HTMLElement>('.filterDialog')!, query };
}

it('preserves the query, checked dynamic options and delegated changes through reset', async () => {
    const { instance, element, query } = await open();
    const changes = vi.fn();
    Events.on(instance, 'filterchange', changes);
    element.querySelector<HTMLButtonElement>('.genreFilters button')!.click();
    const drama = element.querySelector<HTMLInputElement>('[data-filter="Drama"]')!;
    expect(drama.checked).toBe(true);
    expect(query).toEqual({ Genres: 'Drama' });
    drama.checked = false;
    drama.dispatchEvent(new Event('change', { bubbles: true }));
    expect(query.Genres).toBe('');
    expect(changes).toHaveBeenCalledTimes(1);
    drama.checked = true;
    drama.dispatchEvent(new Event('change', { bubbles: true }));
    element.querySelector<HTMLButtonElement>('.resetFilters')!.click();
    expect(query.Genres).toBe('');
    expect(query.Tags).toBeNull();
    expect(drama.checked).toBe(false);
});

it('focuses the first visible disclosure after the controls attach', async () => {
    const { element } = await open();
    await new Promise(resolve => requestAnimationFrame(resolve));
    expect(document.activeElement).toBe(element.querySelector('button'));
});

it('does not focus a dialog that closed during open', async () => {
    state.closedOnOpen = true;
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    await open();
    await new Promise(resolve => requestAnimationFrame(resolve));
    expect(focus).not.toHaveBeenCalled();
});

it('builds only an expanded dynamic section, once, using current query state', async () => {
    const { element, query } = await open({ Genres: 'Drama', Tags: 'One', Years: '2024', OfficialRatings: 'PG' });
    expect(element.querySelectorAll('.filterOptions input')).toHaveLength(0);
    element.querySelector<HTMLButtonElement>('.genreFilters button')!.click();
    expect(element.querySelector<HTMLInputElement>('[data-filter="Drama"]')!.checked).toBe(true);
    expect(element.querySelectorAll('.genreFilters input')).toHaveLength(2);
    expect(element.querySelectorAll('.tagFilters input, .yearFilters input')).toHaveLength(0);
    element.querySelector<HTMLButtonElement>('.resetFilters')!.click();
    element.querySelector<HTMLButtonElement>('.tagFilters button')!.click();
    expect(element.querySelector<HTMLInputElement>('[data-filter="One"]')!.checked).toBe(false);
    element.querySelector<HTMLButtonElement>('.genreFilters button')!.click();
    element.querySelector<HTMLButtonElement>('.genreFilters button')!.click();
    expect(element.querySelectorAll('.genreFilters input')).toHaveLength(2);
    expect(query.Genres).toBe('');
});

it('renders a section already expanded while the filter request was pending', async () => {
    let resolve!: (value: unknown) => void;
    state.fetch.mockReturnValueOnce(new Promise(done => {
        resolve = done;
    }));
    const { element } = await open();
    element.querySelector<HTMLButtonElement>('.genreFilters button')!.click();
    expect(element.querySelectorAll('.genreFilters input')).toHaveLength(0);
    resolve({ Genres: ['Drama'], Tags: [], Years: [], OfficialRatings: [] });
    await Promise.resolve();
    expect(element.querySelector<HTMLInputElement>('[data-filter="Drama"]')!.checked).toBe(true);
});

it('keeps every selected dynamic value when collapsed sections are first expanded', async () => {
    const selected = { Genres: 'Drama|Unknown', Tags: 'One', Years: '2024', OfficialRatings: 'PG', ParentId: 'library', IncludeItemTypes: 'Movie' };
    const { element, query } = await open({ ...selected });
    for (const selector of ['genreFilters', 'tagFilters', 'yearFilters', 'officialRatingFilters']) {
        element.querySelector<HTMLButtonElement>(`.${selector} button`)!.click();
    }
    for (const value of ['Drama', 'Unknown', 'One', '2024', 'PG']) {
        expect(element.querySelector<HTMLInputElement>(`[data-filter="${value}"]`)!.checked).toBe(true);
    }
    expect(query).toEqual(selected);
    expect(state.fetch).toHaveBeenCalledWith({ UserId: 'user', ParentId: 'library', IncludeItemTypes: 'Movie' });
});
