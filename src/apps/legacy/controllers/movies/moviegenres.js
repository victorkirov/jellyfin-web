import GenreTab from 'components/genreTab/genreTab';

export default function (view, params, tabContent) {
    GenreTab.call(this, view, params, tabContent, {
        itemType: 'Movie',
        queryKey: 'moviegenres',
        context: 'movies',
        restoreSavedView: true,
        posterBottomPadding: true
    });
}
