import focusManager from 'lib/focusManager';
import dom from '../../utils/dom';
import dialogHelper from '../dialogHelper/dialogHelper';
import globalize from '../../lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import Events from '../../utils/events';
import '../../elements/emby-checkbox/emby-checkbox';
import '../collapse/emby-collapse';
import './style.scss';
import template from './filterdialog.template.html';
import { updateFilterControls, setVisibility, enableByClass, disableByClass, enableDynamicFilters } from './filterControls';
import { loadDynamicFilters } from './dynamicFilters';
import type { FilterOptions, FilterQuery } from './filterTypes';
import { getFilterStatus } from 'components/filterdialog/filterIndicator';

function triggerChange(instance: FilterDialog) {
    const hasFilters = getFilterStatus(instance.options.query);
    if (hasFilters) {
        enableByClass(document, 'resetFilters');
    } else {
        disableByClass(document, 'resetFilters');
    }

    Events.trigger(instance, 'filterchange');
}

function applyEpisodeStatusFilters(query: FilterQuery, isMissingChecked: boolean, isUnairedChecked: boolean) {
    query.StartIndex = 0;

    if (isMissingChecked && isUnairedChecked) {
        query.IsMissing = true;
        query.IsUnaired = null;
    } else if (isMissingChecked) {
        query.IsMissing = true;
        query.IsUnaired = false;
    } else if (isUnairedChecked) {
        query.IsMissing = null;
        query.IsUnaired = true;
    } else {
        query.IsMissing = false;
        query.IsUnaired = null;
    }
}

function updateNamedFilter(query: FilterQuery, input: HTMLInputElement, key: 'Genres' | 'Tags' | 'Years' | 'OfficialRatings', delimiter: string) {
    const filterName = input.getAttribute('data-filter')!;
    let filters = (query[key] || '').split(delimiter).filter(value => value !== filterName).join(delimiter);
    if (input.checked) filters = filters ? filters + delimiter + filterName : filterName;
    query.StartIndex = 0;
    query[key] = filters;
}

class FilterDialog {
    options: FilterOptions;
    constructor(options: FilterOptions) {
        /**
             * @private
             */
        this.options = options;
    }

    /**
         * @private
         */
    onFavoriteChange(elem: HTMLInputElement) {
        const query = this.options.query;
        query.StartIndex = 0;
        query.IsFavorite = !!elem.checked || null;
        triggerChange(this);
    }

    /**
         * @private
         */
    onStandardFilterChange(elem: HTMLInputElement) {
        const query = this.options.query;
        const filterName = elem.getAttribute('data-filter')!;
        let filters = query.Filters || '';
        filters = (`,${filters}`).replace(`,${filterName}`, '').substring(1);

        if (elem.checked) {
            filters = filters ? `${filters},${filterName}` : filterName;
        }

        query.StartIndex = 0;
        query.Filters = filters;
        triggerChange(this);
    }

    /**
         * @private
         */
    onVideoTypeFilterChange(elem: HTMLInputElement) {
        const query = this.options.query;
        const filterName = elem.getAttribute('data-filter')!;
        let filters = query.VideoTypes || '';
        filters = (`,${filters}`).replace(`,${filterName}`, '').substring(1);

        if (elem.checked) {
            filters = filters ? `${filters},${filterName}` : filterName;
        }

        query.StartIndex = 0;
        query.VideoTypes = filters;
        triggerChange(this);
    }

    /**
         * @private
         */
    onStatusChange(elem: HTMLInputElement) {
        const query = this.options.query;
        const filterName = elem.getAttribute('data-filter')!;
        let filters = query.SeriesStatus || '';
        filters = (`,${filters}`).replace(`,${filterName}`, '').substring(1);

        if (elem.checked) {
            filters = filters ? `${filters},${filterName}` : filterName;
        }

        query.SeriesStatus = filters;
        query.StartIndex = 0;
        triggerChange(this);
    }

    /**
         * @param context {HTMLDivElement} The dialog
         */
    bindEvents(context: HTMLElement) {
        const query = this.options.query;

        if (this.options.mode === 'livetvchannels') {
            for (const elem of context.querySelectorAll<HTMLInputElement>('.chkFavorite')) {
                elem.addEventListener('change', () => this.onFavoriteChange(elem));
            }
        } else {
            for (const elem of context.querySelectorAll<HTMLInputElement>('.chkStandardFilter')) {
                elem.addEventListener('change', () => this.onStandardFilterChange(elem));
            }
        }

        for (const elem of context.querySelectorAll<HTMLInputElement>('.chkVideoTypeFilter')) {
            elem.addEventListener('change', () => this.onVideoTypeFilterChange(elem));
        }

        const resetFilters = context.querySelector<HTMLInputElement>('.resetFilters')!;
        resetFilters.addEventListener('click', () => {
            for (const elem of context.querySelectorAll<HTMLInputElement>('.filterDialogContent input[type="checkbox"]:checked')) {
                elem.checked = false;
            }
            this.resetQuery(query);
            triggerChange(this);
        });

        const chk3DFilter = context.querySelector<HTMLInputElement>('.chk3DFilter')!;
        chk3DFilter.addEventListener('change', () => {
            query.StartIndex = 0;
            query.Is3D = chk3DFilter.checked ? true : null;
            triggerChange(this);
        });
        const chk4KFilter = context.querySelector<HTMLInputElement>('.chk4KFilter')!;
        chk4KFilter.addEventListener('change', () => {
            query.StartIndex = 0;
            query.Is4K = chk4KFilter.checked ? true : null;
            triggerChange(this);
        });
        const chkHDFilter = context.querySelector<HTMLInputElement>('.chkHDFilter')!;
        const chkSDFilter = context.querySelector<HTMLInputElement>('.chkSDFilter')!;
        chkHDFilter.addEventListener('change', () => {
            query.StartIndex = 0;
            if (chkHDFilter.checked) {
                chkSDFilter.checked = false;
                query.IsHD = true;
            } else {
                query.IsHD = null;
            }
            triggerChange(this);
        });
        chkSDFilter.addEventListener('change', () => {
            query.StartIndex = 0;
            if (chkSDFilter.checked) {
                chkHDFilter.checked = false;
                query.IsHD = false;
            } else {
                query.IsHD = null;
            }
            triggerChange(this);
        });
        for (const elem of context.querySelectorAll<HTMLInputElement>('.chkStatus')) {
            elem.addEventListener('change', () => this.onStatusChange(elem));
        }
        const chkTrailer = context.querySelector<HTMLInputElement>('#chkTrailer')!;
        chkTrailer.addEventListener('change', () => {
            query.StartIndex = 0;
            query.HasTrailer = chkTrailer.checked ? true : null;
            triggerChange(this);
        });
        const chkThemeSong = context.querySelector<HTMLInputElement>('#chkThemeSong')!;
        chkThemeSong.addEventListener('change', () => {
            query.StartIndex = 0;
            query.HasThemeSong = chkThemeSong.checked ? true : null;
            triggerChange(this);
        });
        const chkSpecialFeature = context.querySelector<HTMLInputElement>('#chkSpecialFeature')!;
        chkSpecialFeature.addEventListener('change', () => {
            query.StartIndex = 0;
            query.HasSpecialFeature = chkSpecialFeature.checked ? true : null;
            triggerChange(this);
        });
        const chkThemeVideo = context.querySelector<HTMLInputElement>('#chkThemeVideo')!;
        chkThemeVideo.addEventListener('change', () => {
            query.StartIndex = 0;
            query.HasThemeVideo = chkThemeVideo.checked ? true : null;
            triggerChange(this);
        });
        const chkMissingEpisode = context.querySelector<HTMLInputElement>('#chkMissingEpisode')!;
        const chkFutureEpisode = context.querySelector<HTMLInputElement>('#chkFutureEpisode')!;
        chkMissingEpisode.addEventListener('change', () => {
            applyEpisodeStatusFilters(query, chkMissingEpisode.checked, chkFutureEpisode.checked);
            triggerChange(this);
        });
        const chkSpecialEpisode = context.querySelector<HTMLInputElement>('#chkSpecialEpisode')!;
        chkSpecialEpisode.addEventListener('change', () => {
            query.StartIndex = 0;
            query.ParentIndexNumber = chkSpecialEpisode.checked ? 0 : null;
            triggerChange(this);
        });
        chkFutureEpisode.addEventListener('change', () => {
            applyEpisodeStatusFilters(query, chkMissingEpisode.checked, chkFutureEpisode.checked);
            triggerChange(this);
        });
        const chkSubtitle = context.querySelector<HTMLInputElement>('#chkSubtitle')!;
        chkSubtitle.addEventListener('change', () => {
            query.StartIndex = 0;
            query.HasSubtitles = chkSubtitle.checked ? true : null;
            triggerChange(this);
        });
        context.addEventListener('change', (event) => {
            const sections = [
                ['chkGenreFilter', 'Genres', '|'], ['chkTagFilter', 'Tags', '|'],
                ['chkYearFilter', 'Years', ','], ['chkOfficialRatingFilter', 'OfficialRatings', '|']
            ] as const;
            for (const [className, key, delimiter] of sections) {
                const input = dom.parentWithClass(event.target as HTMLElement, className) as HTMLInputElement | null;
                if (input) {
                    updateNamedFilter(query, input, key, delimiter);
                    triggerChange(this);
                    return;
                }
            }
        });
    }

    resetQuery(query: FilterQuery) {
        query.IsFavorite = null;
        query.IsHD = null;
        query.Is3D = null;
        query.Is4K = null;
        query.Filters = '';
        query.SeriesStatus = '';
        query.OfficialRatings = '';
        query.Genres = '';
        query.VideoTypes = '';
        query.StartIndex = 0;
        query.HasSpecialFeature = null;
        query.HasSubtitles = null;
        query.HasThemeSong = null;
        query.HasThemeVideo = null;
        query.HasTrailer = null;
        query.Tags = null;
        query.Years = '';
    }

    show() {
        return new Promise<Event>((resolve) => {
            const dlg = dialogHelper.createDialog({
                removeOnClose: true,
                modal: false
            });
            dlg.classList.add('ui-body-a');
            dlg.classList.add('background-theme-a');
            dlg.classList.add('formDialog');
            dlg.classList.add('filterDialog');
            dlg.innerHTML = globalize.translateHtml(template);
            setVisibility(dlg, this.options);
            let closed = false;
            const markClosed = () => {
                closed = true;
            };
            dlg.addEventListener('_close', markClosed);
            dlg.addEventListener('close', event => {
                markClosed();
                resolve(event);
            });
            updateFilterControls(dlg, this.options);
            this.bindEvents(dlg);
            void dialogHelper.open(dlg);
            requestAnimationFrame(() => {
                if (!closed && document.body.contains(dlg)) {
                    const first = Array.from(dlg.querySelectorAll<HTMLElement>('.emby-collapsible-button'))
                        .find(button => focusManager.isCurrentlyFocusable(button));
                    if (first) focusManager.focus(first);
                }
            });
            if (enableDynamicFilters(this.options.mode)) {
                dlg.classList.add('dynamicFilterDialog');
                const apiClient = ServerConnections.getApiClient(this.options.serverId)!;
                void loadDynamicFilters(dlg, apiClient, apiClient.getCurrentUserId(), this.options.query).catch(console.error);
            }
        });
    }
}

export default FilterDialog;
