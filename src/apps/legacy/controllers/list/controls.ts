import globalize from 'lib/globalize';
import { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models/item-sort-by';
import type { ListSettings } from './settings';

function setSortButtonIcon(btnSortIcon: HTMLElement, icon: string) {
    btnSortIcon.classList.remove('arrow_downward');
    btnSortIcon.classList.remove('arrow_upward');
    btnSortIcon.classList.add(icon);
}

export function updateSortText(instance: ListSettings) {
    const btnSortText = instance.btnSortText;

    if (btnSortText) {
        const options = instance.getSortMenuOptions();
        const values = instance.getSortValues();
        const sortBy = values.sortBy;

        for (const option of options) {
            if (sortBy === option.value) {
                btnSortText.innerHTML = globalize.translate('SortByValue', option.name);
                break;
            }
        }

        const btnSortIcon = instance.btnSortIcon;

        if (btnSortIcon) {
            setSortButtonIcon(btnSortIcon, values.sortOrder === 'Descending' ? 'arrow_downward' : 'arrow_upward');
        }
    }
}

export function updateItemsContainerForViewType(instance: ListSettings) {
    if (instance.getViewSettings().imageType === 'list') {
        instance.itemsContainer.classList.remove('vertical-wrap');
        instance.itemsContainer.classList.add('vertical-list');
    } else {
        instance.itemsContainer.classList.add('vertical-wrap');
        instance.itemsContainer.classList.remove('vertical-list');
    }
}

export function updateAlphaPickerState(instance: ListSettings) {
    if (instance.alphaPicker) {
        const alphaPicker = instance.alphaPickerElement;

        if (alphaPicker) {
            const values = instance.getSortValues();

            if (values.sortBy.indexOf(ItemSortBy.SortName) !== -1) {
                alphaPicker.classList.remove('hide');
            } else {
                alphaPicker.classList.add('hide');
            }
        }
    }
}

export function showViewSettingsMenu(this: ListSettings) {
    void import('components/viewSettings/viewSettings').then(({ default: ViewSettings }) => {
        return new ViewSettings().show({
            settingsKey: this.getSettingsKey(),
            settings: this.getViewSettings(),
            visibleSettings: this.getVisibleViewSettings()
        }).then(() => {
            updateItemsContainerForViewType(this);
            return this.itemsContainer.refreshItems();
        });
    });
}

export function showFilterMenu(this: ListSettings) {
    void import('components/filtermenu/filtermenu').then(({ default: FilterMenu }) => {
        return new FilterMenu().show({
            settingsKey: this.getSettingsKey(),
            settings: this.getFilters(),
            visibleSettings: this.getVisibleFilters(),
            onChange: this.itemsContainer.refreshItems.bind(this.itemsContainer),
            parentId: this.params.parentId,
            itemTypes: this.getItemTypes(),
            serverId: this.params.serverId,
            filterMenuOptions: this.getFilterMenuOptions()
        }).then(() => {
            return this.itemsContainer.refreshItems();
        });
    });
}

export function showSortMenu(this: ListSettings) {
    void import('components/sortmenu/sortmenu').then(({ default: SortMenu }) => {
        return new SortMenu().show({
            settingsKey: this.getSettingsKey(),
            settings: this.getSortValues(),
            onChange: this.itemsContainer.refreshItems.bind(this.itemsContainer),
            serverId: this.params.serverId,
            sortOptions: this.getSortMenuOptions()
        }).then(() => {
            updateSortText(this);
            updateAlphaPickerState(this);
            return this.itemsContainer.refreshItems();
        });
    });
}

export function hideOrShowAll(elems: NodeListOf<HTMLElement>, hide: boolean) {
    for (const elem of elems) {
        if (hide) {
            elem.classList.add('hide');
        } else {
            elem.classList.remove('hide');
        }
    }
}

export function bindAll(elems: NodeListOf<HTMLElement>, eventName: string, fn: EventListener) {
    for (const elem of elems) {
        elem.addEventListener(eventName, fn);
    }
}

