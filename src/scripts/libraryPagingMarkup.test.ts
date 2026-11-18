import { beforeAll, expect, it, vi } from 'vitest';
import globalize, { configureLocalization } from 'lib/globalize';
import { loadStringsForLocale } from 'lib/globalize/dictionaries';
import { getQueryPagingHtml } from './libraryPagingMarkup';

beforeAll(async () => {
    globalize.defaultModule('paging-markup-test');
    globalize.register({ name: 'paging-markup-test', translations: [
        { lang: 'en-US', path: 'en-us.json' },
        { lang: 'fr-FR', path: 'fr.json' },
        { lang: 'ja', path: 'ja.json' }
    ] });
    for (const culture of ['en-us', 'fr-fr', 'ja']) await loadStringsForLocale('paging-markup-test', culture);
});

it.each([
    ['en-US', 1000, 100, 1234],
    ['fr-FR', 1000, 100, 1234],
    ['ja', 1000, 100, 1234],
    ['en-US', 1233, 100, 1234],
    ['en-US', 0, 100, 0]
] as const)('formats stacked paging numbers consistently for %s, start %s', (culture, startIndex, limit, totalRecordCount) => {
    configureLocalization({ language: () => culture, dateTimeLocale: () => culture });
    const translate = vi.spyOn(globalize, 'translate');
    const start = totalRecordCount ? startIndex + 1 : 0;
    const end = Math.min(startIndex + limit, totalRecordCount);
    const parent = document.createElement('div');
    parent.innerHTML = getQueryPagingHtml({ startIndex, limit, totalRecordCount, stackCount: true });
    expect(translate).toHaveBeenCalledWith('ListPaging', start, end, totalRecordCount);
    const count = parent.querySelector('.listPaging > span')!;
    const range = count.querySelector('.libraryRailRange')!;
    expect(range.textContent).toContain(start.toLocaleString(culture));
    expect(range.textContent).toContain(end.toLocaleString(culture));
    expect(count.textContent).toBe(globalize.translate('ListPaging', start, end, totalRecordCount));
    expect(count.querySelector('br')).not.toBeNull();
    parent.innerHTML = getQueryPagingHtml({ startIndex, limit, totalRecordCount });
    expect(parent.querySelector('.listPaging > span')?.textContent).toBe(count.textContent);
    expect(parent.querySelector('.libraryRailRange')).toBeNull();
});
