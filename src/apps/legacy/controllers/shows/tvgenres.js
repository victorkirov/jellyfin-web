import GenreTab from 'components/genreTab/genreTab';

export default function (view, params, tabContent) {
    GenreTab.call(this, view, params, tabContent, {
        itemType: 'Series',
        queryKey: 'seriesgenres',
        context: 'tvshows',
        restoreSavedView: false,
        posterBottomPadding: false
    });
}
