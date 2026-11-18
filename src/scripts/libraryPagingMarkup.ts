import globalize from 'lib/globalize';

type PagingOptions = {
    stackCount?: boolean; startIndex: number; limit?: number; totalRecordCount?: number;
    viewButton?: boolean; filterButton?: boolean; sortButton?: boolean; addLayoutButton?: boolean;
    layouts?: string; currentLayout?: string; showLimit?: boolean; updatePageSizeSetting?: boolean;
};

export function getQueryPagingHtml (options: PagingOptions) {
    const startIndex = options.startIndex;
    const limit = options.limit!;
    const totalRecordCount = options.totalRecordCount!;
    let html = '';
    const recordsStart = totalRecordCount ? startIndex + 1 : 0;
    const recordsEnd = limit ? Math.min(startIndex + limit, totalRecordCount) : totalRecordCount;
    const showControls = limit > 0 && limit < totalRecordCount;

    html += '<div class="listPaging">';

    html += '<span style="vertical-align:middle;">';
    const count = globalize.translate('ListPaging', recordsStart, recordsEnd, totalRecordCount);
    html += options.stackCount ? stackPagingCount(count, [recordsStart, recordsEnd, totalRecordCount]) : count;
    html += '</span>';

    if (showControls || options.viewButton || options.filterButton || options.sortButton || options.addLayoutButton) {
        html += '<div style="display:inline-block;">';

        if (showControls) {
            html += '<button is="paper-icon-button-light" class="btnPreviousPage autoSize" ' + (startIndex ? '' : 'disabled') + '><span class="material-icons arrow_back" aria-hidden="true"></span></button>';
            html += '<button is="paper-icon-button-light" class="btnNextPage autoSize" ' + (startIndex + limit >= totalRecordCount ? 'disabled' : '') + '><span class="material-icons arrow_forward" aria-hidden="true"></span></button>';
        }

        html += getOptionButtonsHtml(options);

        html += '</div>';
    }

    html += '</div>';
    return html;
}

function stackPagingCount(text: string, values: [number, number, number]) {
    const template = globalize.translate('ListPaging');
    const start = template.indexOf('{0}');
    const end = template.indexOf('{1}');
    if (start < 0 || end < start) return text;
    const range = template.slice(start, end + 3).replace(/\{([0-2])\}/g, (_placeholder, index: string) =>
        values[Number(index)].toLocaleString(globalize.getCurrentLocale()));
    return text.replace(range, '<span class="libraryRailRange">' + range + '</span><br>');
}

function getOptionButtonsHtml(options: PagingOptions) {
    let html = '';
    if (options.addLayoutButton) {
        html += '<button is="paper-icon-button-light" title="' + globalize.translate('ButtonSelectView') + '" class="btnChangeLayout autoSize" data-layouts="' + (options.layouts || '') + '" onclick="LibraryBrowser.showLayoutMenu(this, \'' + (options.currentLayout || '') + '\');"><span class="material-icons view_comfy" aria-hidden="true"></span></button>';
    }

    if (options.sortButton) {
        html += '<button is="paper-icon-button-light" class="btnSort autoSize" title="' + globalize.translate('Sort') + '"><span class="material-icons sort_by_alpha" aria-hidden="true"></span></button>';
    }

    if (options.filterButton) {
        html += '<button is="paper-icon-button-light" class="btnFilter autoSize" title="' + globalize.translate('Filter') + '"><span class="material-icons filter_alt" aria-hidden="true"></span></button>';
    }

    return html;
}
