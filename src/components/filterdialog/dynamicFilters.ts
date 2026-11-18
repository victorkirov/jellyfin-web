import escapeHtml from 'escape-html';
import union from 'lodash-es/union';
import type { ConnectionClient } from 'lib/jellyfin-apiclient/connectionTypes';
import type { FilterQuery } from './filterTypes';
type Filters = { Genres: string[]; OfficialRatings: string[]; Tags: string[]; Years: number[] };
function merge(resultItems: string[], queryItems: string | null | undefined, delimiter: string) {
    if (!queryItems) {
        return resultItems;
    }
    // eslint-disable-next-line sonarjs/no-alphabetical-sort
    return union(resultItems, queryItems.split(delimiter)).sort();
}

function renderOptions(context: HTMLElement, selector: string, cssClass: string, items: string[], isCheckedFn: (item: string) => boolean) {
    const elem = context.querySelector<HTMLElement>(selector)!;
    if (items.length) {
        elem.classList.remove('hide');
    } else {
        elem.classList.add('hide');
    }
    const render = () => {
        elem.removeEventListener('click', onExpand, true);
        let html = '';
        html += '<div class="checkboxList">';
        html += items.map(function (filter) {
            let itemHtml = '';
            const checkedHtml = isCheckedFn(filter) ? 'checked' : '';
            itemHtml += '<label>';
            itemHtml += `<input is="emby-checkbox" type="checkbox" ${checkedHtml} data-filter="${escapeHtml(filter)}" class="${cssClass}"/>`;
            itemHtml += `<span>${escapeHtml(filter)}</span>`;
            itemHtml += '</label>';
            return itemHtml;
        }).join('');
        html += '</div>';
        elem.querySelector<HTMLElement>('.filterOptions')!.innerHTML = html;
    };
    const onExpand = (event: Event) => {
        if ((event.target as HTMLElement).closest('.emby-collapsible-button')) render();
    };
    if (elem.querySelector('.collapseContent.expanded')) render();
    else elem.addEventListener('click', onExpand, true);
}

function renderFilters(context: HTMLElement, result: Filters, query: FilterQuery) {
    renderOptions(context, '.genreFilters', 'chkGenreFilter', merge(result.Genres, query.Genres, '|'), function (i) {
        const delimeter = '|';
        return (delimeter + (query.Genres || '') + delimeter).includes(delimeter + i + delimeter);
    });
    renderOptions(context, '.officialRatingFilters', 'chkOfficialRatingFilter', merge(result.OfficialRatings, query.OfficialRatings, '|'), function (i) {
        const delimeter = '|';
        return (delimeter + (query.OfficialRatings || '') + delimeter).includes(delimeter + i + delimeter);
    });
    renderOptions(context, '.tagFilters', 'chkTagFilter', merge(result.Tags, query.Tags, '|'), function (i) {
        const delimeter = '|';
        return (delimeter + (query.Tags || '') + delimeter).includes(delimeter + i + delimeter);
    });
    renderOptions(context, '.yearFilters', 'chkYearFilter', merge(result.Years.map(String), query.Years, ','), function (i) {
        const delimeter = ',';
        return (delimeter + (query.Years || '') + delimeter).includes(delimeter + i + delimeter);
    });
}

export function loadDynamicFilters(context: HTMLElement, apiClient: ConnectionClient, userId: string, itemQuery: FilterQuery) {
    return apiClient.getJSON(apiClient.getUrl('Items/Filters', {
        UserId: userId,
        ParentId: itemQuery.ParentId,
        IncludeItemTypes: itemQuery.IncludeItemTypes
    })).then(function (result: Filters) {
        renderFilters(context, result, itemQuery);
    });
}

