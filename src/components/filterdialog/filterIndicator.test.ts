import globalize from 'lib/globalize';
import { afterEach, expect, it, vi } from 'vitest';
import { getFilterStatus, getFilterLabel, setFilterStatus } from './filterIndicator';

vi.mock('lib/globalize', () => ({ default: { translate: (label: string, value?: string | number) => {
    if (label === 'LibraryFilterLabel') return 'Filter: ' + value;
    if (label === 'LibraryFilterCount') return 'Filters: ' + value;
    return label;
} } }));

afterEach(() => {
    document.body.innerHTML = '';
});

it('names Unplayed and updates a combined count without stale badges', () => {
    document.body.innerHTML = '<main><div class="btnFilter-wrapper"><button class="btnFilter"></button></div></main>';
    const page = document.querySelector<HTMLElement>('main')!;
    setFilterStatus(page, { Filters: 'IsUnPlayed' });
    expect(page.querySelector('.filterIndicator')?.textContent).toBe('Filter: Unplayed');
    expect(page.querySelector('.btnFilter')?.getAttribute('aria-label')).toBe('Filter: Unplayed');
    setFilterStatus(page, { Filters: 'IsUnPlayed,IsResumable', Genres: 'Drama' });
    expect(page.querySelector('.filterIndicator')?.textContent).toBe('Filters: 3');
    setFilterStatus(page, {});
    expect(page.querySelector('.filterIndicator')?.classList.contains('hide')).toBe(true);
    expect(page.querySelector('.btnFilter-wrapper')?.classList.contains('btnFilterWithIndicator')).toBe(false);
    expect(page.querySelector('.btnFilter')?.getAttribute('aria-label')).toBe('Filter');
});

it.each([true, false])('counts explicitly selected IsHD=%s as a filter', value => {
    expect(getFilterStatus({ IsHD: value })).toBe(true);
});

it('keeps default false IsMissing and library letter queries out of the filter count', () => {
    expect(getFilterStatus({ IsMissing: false, NameStartsWith: 'D', SortBy: 'SortName' })).toBe(false);
});

it.each(['Genres', 'Tags', 'OfficialRatings'])('counts pipe-separated %s choices', field => {
    expect(getFilterLabel({ [field]: 'Action|Comedy' })).toBe('Filters: 2');
    expect(getFilterLabel({ [field]: 'Action,Comedy|Drama' })).toBe('Filters: 3');
});

it.each(['Science Fiction', 'constructor', 'toString'])('does not translate free-text filter value %s', value => {
    const translate = vi.spyOn(globalize, 'translate');
    expect(getFilterLabel({ Genres: value })).toBe('Filter: ' + value);
    expect(translate).not.toHaveBeenCalledWith(value);
});
