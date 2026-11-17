import globalize from 'lib/globalize';
import * as userSettings from 'scripts/settings/userSettings';
import { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models/item-sort-by';
import type { ItemDto } from 'types/base/models/item-dto';
import type { ListParams, ListItemsContainer } from './types';
import type AlphaPicker from 'components/alphaPicker/alphaPicker';
import type AlphaNumericShortcuts from 'scripts/alphanumericshortcuts';

export class ListSettings {
    params: ListParams;
    currentItem: ItemDto | null = null;
    queryRecursive = false;
    hasFilters: boolean | undefined;
    totalItemCount?: number;
    itemsContainer!: ListItemsContainer;
    filterButtons!: NodeListOf<HTMLElement>;
    sortButtons!: NodeListOf<HTMLElement>;
    btnSortText: HTMLElement | null = null;
    btnSortIcon: HTMLElement | null = null;
    alphaPickerElement: HTMLElement | null = null;
    alphaPicker: AlphaPicker | null = null;
    alphaNumericShortcuts: AlphaNumericShortcuts | null = null;
    scroller: HTMLElement | null = null;
    listController?: { destroy: () => void };

    constructor(params: ListParams) {
        this.params = params;
    }

    getFilters() {
        const basekey = this.getSettingsKey();
        return {
            IsPlayed: userSettings.getFilter(basekey + '-filter-IsPlayed') === 'true',
            IsUnplayed: userSettings.getFilter(basekey + '-filter-IsUnplayed') === 'true',
            IsFavorite: userSettings.getFilter(basekey + '-filter-IsFavorite') === 'true',
            IsResumable: userSettings.getFilter(basekey + '-filter-IsResumable') === 'true',
            Is4K: userSettings.getFilter(basekey + '-filter-Is4K') === 'true',
            IsHD: userSettings.getFilter(basekey + '-filter-IsHD') === 'true',
            IsSD: userSettings.getFilter(basekey + '-filter-IsSD') === 'true',
            Is3D: userSettings.getFilter(basekey + '-filter-Is3D') === 'true',
            VideoTypes: userSettings.getFilter(basekey + '-filter-VideoTypes'),
            SeriesStatus: userSettings.getFilter(basekey + '-filter-SeriesStatus'),
            HasSubtitles: userSettings.getFilter(basekey + '-filter-HasSubtitles'),
            HasTrailer: userSettings.getFilter(basekey + '-filter-HasTrailer'),
            HasSpecialFeature: userSettings.getFilter(basekey + '-filter-HasSpecialFeature'),
            HasThemeSong: userSettings.getFilter(basekey + '-filter-HasThemeSong'),
            HasThemeVideo: userSettings.getFilter(basekey + '-filter-HasThemeVideo'),
            GenreIds: userSettings.getFilter(basekey + '-filter-GenreIds')
        };
    }

    getSortValues() {
        const basekey = this.getSettingsKey();
        return userSettings.getSortValuesLegacy(basekey, this.getDefaultSortBy());
    }

    getDefaultSortBy() {
        const sortNameOption = this.getNameSortOption(this.params);

        if (this.params.type) {
            return sortNameOption.value;
        }

        return `${ItemSortBy.IsFolder},${sortNameOption.value}`;
    }

    getSortMenuOptions() {
        const sortBy = [];

        if (this.params.type === 'Programs') {
            sortBy.push({
                name: globalize.translate('AirDate'),
                value: [ItemSortBy.StartDate, ItemSortBy.SortName].join(',')
            });
        }

        let option: { name: string; value: string } | null = this.getNameSortOption(this.params);

        if (option) {
            sortBy.push(option);
        }

        option = this.getCommunityRatingSortOption();

        if (option) {
            sortBy.push(option);
        }

        option = this.getCriticRatingSortOption();

        if (option) {
            sortBy.push(option);
        }

        if (this.params.type !== 'Programs') {
            sortBy.push({
                name: globalize.translate('DateAdded'),
                value: [ItemSortBy.DateCreated, ItemSortBy.SortName].join(',')
            });
        }

        option = this.getDatePlayedSortOption();

        if (option) {
            sortBy.push(option);
        }

        if (!this.params.type) {
            option = this.getNameSortOption(this.params);
            sortBy.push({
                name: globalize.translate('Folders'),
                value: `${ItemSortBy.IsFolder},${option.value}`
            });
        }

        sortBy.push({
            name: globalize.translate('ParentalRating'),
            value: [ItemSortBy.OfficialRating, ItemSortBy.SortName].join(',')
        });
        option = this.getPlayCountSortOption();

        if (option) {
            sortBy.push(option);
        }

        sortBy.push({
            name: globalize.translate('ReleaseDate'),
            value: [ItemSortBy.ProductionYear, ItemSortBy.PremiereDate, ItemSortBy.SortName].join(',')
        });
        sortBy.push({
            name: globalize.translate('Runtime'),
            value: [ItemSortBy.Runtime, ItemSortBy.SortName].join(',')
        });
        return sortBy;
    }

    getNameSortOption(params: ListParams) {
        if (params.type === 'Episode') {
            return {
                name: globalize.translate('Name'),
                value: [ItemSortBy.SeriesSortName, ItemSortBy.SortName].join(',')
            };
        }

        return {
            name: globalize.translate('Name'),
            value: ItemSortBy.SortName
        };
    }

    getPlayCountSortOption() {
        if (this.params.type === 'Programs') {
            return null;
        }

        return {
            name: globalize.translate('PlayCount'),
            value: [ItemSortBy.PlayCount, ItemSortBy.SortName].join(',')
        };
    }

    getDatePlayedSortOption() {
        if (this.params.type === 'Programs') {
            return null;
        }

        return {
            name: globalize.translate('DatePlayed'),
            value: [ItemSortBy.DatePlayed, ItemSortBy.SortName].join(',')
        };
    }

    getCriticRatingSortOption() {
        if (this.params.type === 'Programs') {
            return null;
        }

        return {
            name: globalize.translate('CriticRating'),
            value: [ItemSortBy.CriticRating, ItemSortBy.SortName].join(',')
        };
    }

    getCommunityRatingSortOption() {
        return {
            name: globalize.translate('CommunityRating'),
            value: [ItemSortBy.CommunityRating, ItemSortBy.SortName].join(',')
        };
    }

    getVisibleFilters() {
        const filters = [];
        const params = this.params;

        if (params.type !== 'nextup') {
            if (params.type === 'Programs') {
                filters.push('Genres');
            } else {
                filters.push('IsUnplayed');
                filters.push('IsPlayed');

                if (!params.IsFavorite) {
                    filters.push('IsFavorite');
                }

                filters.push('IsResumable');
                filters.push('VideoType');
                filters.push('HasSubtitles');
                filters.push('HasTrailer');
                filters.push('HasSpecialFeature');
                filters.push('HasThemeSong');
                filters.push('HasThemeVideo');
            }
        }

        return filters;
    }

    setFilterStatus(hasFilters: boolean | undefined) {
        this.hasFilters = hasFilters;
        const filterButtons = this.filterButtons;

        if (filterButtons?.length) {
            for (const btnFilter of filterButtons) {
                let bubble = btnFilter.querySelector('.filterButtonBubble');

                if (!bubble) {
                    if (!hasFilters) {
                        continue;
                    }

                    btnFilter.insertAdjacentHTML('afterbegin', '<div class="filterButtonBubble">!</div>');
                    btnFilter.classList.add('btnFilterWithBubble');
                    bubble = btnFilter.querySelector('.filterButtonBubble');
                }

                if (hasFilters) {
                    bubble!.classList.remove('hide');
                } else {
                    bubble!.classList.add('hide');
                }
            }
        }
    }

    getFilterMenuOptions() {
        const params = this.params;
        return {
            IsAiring: params.IsAiring,
            IsMovie: params.IsMovie,
            IsSports: params.IsSports,
            IsKids: params.IsKids,
            IsNews: params.IsNews,
            IsSeries: params.IsSeries,
            Recursive: this.queryRecursive
        };
    }

    getVisibleViewSettings() {
        const item = this.currentItem;
        const fields = ['showTitle'];

        if (!item || item.Type !== 'PhotoAlbum' && item.Type !== 'ChannelFolderItem') {
            fields.push('imageType');
        }

        fields.push('viewType');
        return fields;
    }

    getViewSettings() {
        const basekey = this.getSettingsKey();
        const params = this.params;
        const item = this.currentItem;
        let showTitle: boolean | string | null | undefined = userSettings.get(basekey + '-showTitle');

        if (showTitle === 'true') {
            showTitle = true;
        } else if (showTitle === 'false') {
            showTitle = false;
        } else if ([ 'Audio', 'MusicAlbum', 'MusicArtist', 'Person', 'Programs', 'Recordings', 'nextup', 'tag' ].includes(params.type!)) {
            showTitle = true;
        } else if (item && item.Type !== 'PhotoAlbum') {
            showTitle = true;
        }

        let imageType = userSettings.get(basekey + '-imageType');

        if (!imageType && params.type === 'nextup') {
            if (userSettings.useEpisodeImagesInNextUpAndResume()) {
                imageType = 'primary';
            } else {
                imageType = 'thumb';
            }
        }

        return {
            showTitle,
            showYear: userSettings.get(basekey + '-showYear') !== 'false',
            imageType: imageType || 'primary',
            viewType: userSettings.get(basekey + '-viewType') || 'images'
        };
    }

    getItemTypes() {
        const params = this.params;

        if (params.type === 'nextup') {
            return ['Episode'];
        }

        if (params.type === 'Programs') {
            return ['Program'];
        }

        return [];
    }

    getSettingsKey() {
        const values = [];
        values.push('items');
        const params = this.params;

        if (params.type) {
            values.push(params.type);
        } else if (params.parentId) {
            values.push(params.parentId);
        }

        if (params.IsAiring) {
            values.push('IsAiring');
        }

        if (params.IsMovie) {
            values.push('IsMovie');
        }

        if (params.IsKids) {
            values.push('IsKids');
        }

        if (params.IsSports) {
            values.push('IsSports');
        }

        if (params.IsNews) {
            values.push('IsNews');
        }

        if (params.IsSeries) {
            values.push('IsSeries');
        }

        if (params.IsFavorite) {
            values.push('IsFavorite');
        }

        if (params.genreId) {
            values.push('Genre');
        }

        if (params.musicGenreId) {
            values.push('MusicGenre');
        }

        if (params.studioId) {
            values.push('Studio');
        }

        if (params.personId) {
            values.push('Person');
        }

        if (params.parentId) {
            values.push('Folder');
        }

        return values.join('-');
    }
}
