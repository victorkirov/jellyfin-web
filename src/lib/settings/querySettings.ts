export const allowedSortSettings = ['SortBy', 'SortOrder'];

export const filterSettingsPostfix = '-filter';
export const allowedFilterSettings = [
    'Filters', 'HasSubtitles', 'HasTrailer', 'HasSpecialFeature',
    'HasThemeSong', 'HasThemeVideo', 'Genres', 'OfficialRatings',
    'Tags', 'VideoTypes', 'IsSD', 'IsHD', 'Is4K', 'Is3D',
    'IsFavorite', 'IsMissing', 'IsUnaired', 'ParentIndexNumber',
    'SeriesStatus', 'Years'
];

export function readJsonSetting(value: string | null | undefined, defaults: object = {}): Record<string, unknown> {
    if (!value) return Object.assign({}, defaults) as Record<string, unknown>;
    try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return Object.assign({}, defaults, parsed);
        }
    } catch {
        // Invalid stored settings use the same defaults as missing settings.
    }
    return Object.assign({}, defaults) as Record<string, unknown>;
}

export function filterQuerySettings(query: object, allowedItems: string[]) {
    return Object.keys(query)
        .filter(field => allowedItems.includes(field))
        .reduce((acc, field) => {
            acc[field] = (query as Record<string, unknown>)[field];
            return acc;
        }, {} as Record<string, unknown>);
}

