import { beforeEach, expect, it, vi } from 'vitest';
import * as userSettings from 'scripts/settings/userSettings';
import { getLibraryLayout, libraryLayouts, supportedLibraryLayout } from './libraryPaging';

vi.mock('scripts/libraryBrowser', () => ({ default: {} }));
vi.mock('scripts/settings/userSettings', () => ({ get: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

it.each([null, undefined, '', 'unsupported'])('defaults missing or unsupported layout %s to Poster', value => {
    expect(supportedLibraryLayout(value)).toBe('Poster');
    vi.mocked(userSettings.get).mockReturnValue(value);
    expect(getLibraryLayout('library')).toBe('Poster');
    expect(getLibraryLayout('library', true)).toBe('Poster');
});
it.each(libraryLayouts)('retains supported layout %s from either saved key', layout => {
    expect(supportedLibraryLayout(layout)).toBe(layout);
    for (const suffix of ['-view', '-_view']) {
        vi.mocked(userSettings.get).mockImplementation(key => key === 'library' + suffix ? layout : null);
        expect(getLibraryLayout('library')).toBe(layout);
        expect(getLibraryLayout('library', true)).toBe(layout);
    }
});
