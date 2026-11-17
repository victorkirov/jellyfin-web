import globalize from 'lib/globalize';
type FilterQuery = Record<string, unknown>;
import './filterIndicator.scss';

const filterKeys = ['Filters', 'IsFavorite', 'VideoTypes', 'SeriesStatus', 'Is4K', 'IsSD', 'Is3D', 'HasSubtitles', 'HasTrailer', 'HasSpecialFeature', 'HasThemeSong', 'HasThemeVideo', 'IsMissing', 'ParentIndexNumber', 'Genres', 'Tags', 'Years', 'OfficialRatings', 'IsUnaired'];

function activeFilters(query: FilterQuery) {
    const filters: string[] = [];
    for (const key of filterKeys) {
        const value = query[key];
        if (value) {
            if (typeof value === 'string') filters.push(...value.split(/[,|]/).filter(Boolean));
            else filters.push(key);
        }
    }
    if (query.IsHD !== undefined && query.IsHD !== null) filters.push(query.IsHD ? 'HD' : 'SD');
    return filters;
}

export function getFilterStatus(query: FilterQuery) {
    return activeFilters(query).length > 0;
}

export function getFilterLabel(query: FilterQuery, compact = false) {
    const filters = activeFilters(query);
    if (!filters.length) return '';
    if (filters.length > 1) return globalize.translate('LibraryFilterCount', filters.length);
    const labels: Record<string, string> = { IsUnplayed: 'Unplayed', IsUnPlayed: 'Unplayed', IsPlayed: 'Played', IsResumable: 'HeaderContinueWatching', IsFavorite: 'Favorites' };
    const labelKey = Object.prototype.hasOwnProperty.call(labels, filters[0]) ? labels[filters[0]] : undefined;
    const value = labelKey ? globalize.translate(labelKey) : filters[0];
    return compact ? value : globalize.translate('LibraryFilterLabel', value);
}

export function setFilterStatus(page: HTMLElement, query: FilterQuery) {
    const hasFilters = getFilterStatus(query);

    const btnFilterWrapper = page.querySelector('.btnFilter-wrapper');

    if (btnFilterWrapper) {
        btnFilterWrapper.classList.toggle('btnFilterWithIndicator', hasFilters);
        let indicatorElem = btnFilterWrapper.querySelector('.filterIndicator');

        if (!indicatorElem && hasFilters) {
            (btnFilterWrapper.querySelector('.btnFilter') || btnFilterWrapper).insertAdjacentHTML(
                'beforeend',
                '<span class="filterIndicator"></span>'
            );
            indicatorElem = btnFilterWrapper.querySelector('.filterIndicator');
        }

        if (indicatorElem) {
            indicatorElem.textContent = getFilterLabel(query, Boolean(btnFilterWrapper.closest('.libraryRail')));
            const label = getFilterLabel(query) || globalize.translate('Filter');
            const button = btnFilterWrapper.querySelector('.btnFilter');
            button?.setAttribute('aria-label', label);
            button?.setAttribute('title', label);
            indicatorElem.classList.toggle('hide', !hasFilters);
        }
    }
}
