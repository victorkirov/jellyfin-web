import globalize from 'lib/globalize';

type SortMenuOptions = {
    items: { id: string; name: string }[];
    query: { SortBy?: string; SortOrder?: string | number | boolean; StartIndex?: number };
    callback?: () => void; button?: HTMLElement;
};

export function showSortMenu (options: SortMenuOptions) {
    void Promise.all([
        import('../components/dialogHelper/dialogHelper'),
        import('../elements/emby-radio/emby-radio')
    ]).then(([{ default: dialogHelper }]) => {
        function onSortByChange(this: HTMLInputElement) {
            const newValue = this.value;

            if (this.checked) {
                const changed = options.query.SortBy != newValue;
                options.query.SortBy = newValue.replace('_', ',');
                options.query.StartIndex = 0;

                if (options.callback && changed) {
                    options.callback();
                }
            }
        }

        function onSortOrderChange(this: HTMLInputElement) {
            const newValue = this.value;

            if (this.checked) {
                const changed = options.query.SortOrder != newValue;
                options.query.SortOrder = newValue;
                options.query.StartIndex = 0;

                if (options.callback && changed) {
                    options.callback();
                }
            }
        }

        const dialogOptions = {
            removeOnClose: true,
            modal: false
        };
        const dlg = dialogHelper.createDialog(dialogOptions);
        dlg.classList.add('ui-body-a');
        dlg.classList.add('background-theme-a');
        dlg.classList.add('formDialog');
        let html = '';
        html += '<div style="margin:0;padding:1.25em 1.5em 1.5em;">';
        html += '<h2 style="margin:0 0 .5em;">';
        html += globalize.translate('HeaderSortBy');
        html += '</h2>';
        let i;
        let length;
        let isChecked;
        html += '<div>';
        for (i = 0, length = options.items.length; i < length; i++) {
            const option = options.items[i];
            const radioValue = option.id.replace(',', '_');
            isChecked = (options.query.SortBy || '').replace(',', '_') == radioValue ? ' checked' : '';
            html += '<label class="radio-label-block"><input type="radio" is="emby-radio" name="SortBy" data-id="' + option.id + '" value="' + radioValue + '" class="menuSortBy" ' + isChecked + ' /><span>' + option.name + '</span></label>';
        }

        html += '</div>';
        html += '<h2 style="margin: 1em 0 .5em;">';
        html += globalize.translate('HeaderSortOrder');
        html += '</h2>';
        html += '<div>';
        isChecked = options.query.SortOrder == 'Ascending' ? ' checked' : '';
        html += '<label class="radio-label-block"><input type="radio" is="emby-radio" name="SortOrder" value="Ascending" class="menuSortOrder" ' + isChecked + ' /><span>' + globalize.translate('Ascending') + '</span></label>';
        isChecked = options.query.SortOrder == 'Descending' ? ' checked' : '';
        html += '<label class="radio-label-block"><input type="radio" is="emby-radio" name="SortOrder" value="Descending" class="menuSortOrder" ' + isChecked + ' /><span>' + globalize.translate('Descending') + '</span></label>';
        html += '</div>';
        html += '</div>';
        dlg.innerHTML = html;
        void dialogHelper.open(dlg);
        const sortBys = dlg.querySelectorAll('.menuSortBy');

        for (i = 0, length = sortBys.length; i < length; i++) {
            sortBys[i].addEventListener('change', onSortByChange);
        }

        const sortOrders = dlg.querySelectorAll('.menuSortOrder');

        for (i = 0, length = sortOrders.length; i < length; i++) {
            sortOrders[i].addEventListener('change', onSortOrderChange);
        }
    });
}
