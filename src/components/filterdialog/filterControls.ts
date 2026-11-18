import type { FilterOptions } from './filterTypes';
export function updateFilterControls(context: HTMLElement, options: FilterOptions) {
    const query = options.query;

    if (options.mode === 'livetvchannels') {
        context.querySelector<HTMLInputElement>('.chkFavorite')!.checked = query.IsFavorite === true;
    } else {
        for (const elem of context.querySelectorAll<HTMLInputElement>('.chkStandardFilter')) {
            const filters = `,${query.Filters || ''}`;
            const filterName = elem.getAttribute('data-filter')!;
            elem.checked = filters.includes(`,${filterName}`);
        }
    }

    for (const elem of context.querySelectorAll<HTMLInputElement>('.chkVideoTypeFilter')) {
        const filters = `,${query.VideoTypes || ''}`;
        const filterName = elem.getAttribute('data-filter')!;
        elem.checked = filters.includes(`,${filterName}`);
    }
    context.querySelector<HTMLInputElement>('.chk3DFilter')!.checked = query.Is3D === true;
    context.querySelector<HTMLInputElement>('.chkHDFilter')!.checked = query.IsHD === true;
    context.querySelector<HTMLInputElement>('.chk4KFilter')!.checked = query.Is4K === true;
    context.querySelector<HTMLInputElement>('.chkSDFilter')!.checked = query.IsHD === false;
    context.querySelector<HTMLInputElement>('#chkSubtitle')!.checked = query.HasSubtitles === true;
    context.querySelector<HTMLInputElement>('#chkTrailer')!.checked = query.HasTrailer === true;
    context.querySelector<HTMLInputElement>('#chkThemeSong')!.checked = query.HasThemeSong === true;
    context.querySelector<HTMLInputElement>('#chkThemeVideo')!.checked = query.HasThemeVideo === true;
    context.querySelector<HTMLInputElement>('#chkSpecialFeature')!.checked = query.HasSpecialFeature === true;
    context.querySelector<HTMLInputElement>('#chkSpecialEpisode')!.checked = query.ParentIndexNumber === 0;
    const isMissingChecked = query.IsMissing === true;
    context.querySelector<HTMLInputElement>('#chkMissingEpisode')!.checked = isMissingChecked;
    context.querySelector<HTMLInputElement>('#chkFutureEpisode')!.checked = query.IsUnaired === true || (isMissingChecked && query.IsUnaired === null);
    for (const elem of context.querySelectorAll<HTMLInputElement>('.chkStatus')) {
        const filters = `,${query.SeriesStatus || ''}`;
        const filterName = elem.getAttribute('data-filter')!;
        elem.checked = filters.includes(`,${filterName}`);
    }
}

export function setVisibility(context: HTMLElement, options: FilterOptions) {
    if (options.mode === 'livetvchannels' || options.mode === 'albums' || options.mode === 'artists' || options.mode === 'albumartists' || options.mode === 'songs') {
        hideByClass(context, 'videoStandard');
    }

    if (enableDynamicFilters(options.mode)) {
        context.querySelector<HTMLElement>('.genreFilters')!.classList.remove('hide');
        context.querySelector<HTMLElement>('.officialRatingFilters')!.classList.remove('hide');
        context.querySelector<HTMLElement>('.tagFilters')!.classList.remove('hide');
        context.querySelector<HTMLElement>('.yearFilters')!.classList.remove('hide');
    }

    if (options.mode === 'movies' || options.mode === 'series' || options.mode === 'episodes') {
        context.querySelector<HTMLElement>('.videoTypeFilters')!.classList.remove('hide');
    }

    if (options.mode === 'movies' || options.mode === 'series' || options.mode === 'episodes') {
        context.querySelector<HTMLElement>('.features')!.classList.remove('hide');
    }

    if (options.mode === 'series') {
        context.querySelector<HTMLInputElement>('.seriesStatus')!.classList.remove('hide');
    }

    if (options.mode === 'episodes') {
        showByClass(context, 'episodeFilter');
    }

    if (!options.hasFilters) {
        disableByClass(context, 'resetFilters');
    }
}

export function enableByClass(context: ParentNode, className: string) {
    for (const elem of context.querySelectorAll<HTMLInputElement>(`.${className}`)) {
        elem.disabled = false;
    }
}

export function disableByClass(context: ParentNode, className: string) {
    for (const elem of context.querySelectorAll<HTMLInputElement>(`.${className}`)) {
        elem.disabled = true;
    }
}

function showByClass(context: ParentNode, className: string) {
    for (const elem of context.querySelectorAll<HTMLInputElement>(`.${className}`)) {
        elem.classList.remove('hide');
    }
}

function hideByClass(context: ParentNode, className: string) {
    for (const elem of context.querySelectorAll<HTMLInputElement>(`.${className}`)) {
        elem.classList.add('hide');
    }
}

export function enableDynamicFilters(mode: string) {
    return mode === 'movies' || mode === 'series' || mode === 'albums' || mode === 'albumartists' || mode === 'artists' || mode === 'songs' || mode === 'episodes';
}

