
import { EventType } from 'constants/eventType';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import Events from 'utils/events';

import browser from '../../scripts/browser';
import globalize from '../../lib/globalize';
import dom from '../../utils/dom';
import './multiSelect.scss';
import datetime from '../../scripts/datetime';

let selectedItems = [];
let selectedElements = [];
let currentSelectionCommandsPanel;

function hideSelections() {
    const selectionCommandsPanel = currentSelectionCommandsPanel;
    if (selectionCommandsPanel) {
        selectionCommandsPanel.parentNode.removeChild(selectionCommandsPanel);
        currentSelectionCommandsPanel = null;

        selectedItems = [];
        selectedElements = [];
        const elems = document.querySelectorAll('.itemSelectionPanel');
        for (let i = 0, length = elems.length; i < length; i++) {
            const parent = elems[i].parentNode;
            parent.removeChild(elems[i]);
            parent.classList.remove('withMultiSelect');
        }
    }
}

function onItemSelectionPanelClick(e, itemSelectionPanel) {
    // toggle the checkbox, if it wasn't clicked on
    if (!dom.parentWithClass(e.target, 'chkItemSelect')) {
        const chkItemSelect = itemSelectionPanel.querySelector('.chkItemSelect');

        if (chkItemSelect) {
            if (chkItemSelect.classList.contains('checkedInitial')) {
                chkItemSelect.classList.remove('checkedInitial');
            } else {
                const newValue = !chkItemSelect.checked;
                chkItemSelect.checked = newValue;
                updateItemSelection(chkItemSelect, newValue);
            }
        }
    }

    e.preventDefault();
    e.stopPropagation();
    return false;
}

function updateItemSelection(chkItemSelect, selected) {
    const parentWithId = dom.parentWithAttribute(chkItemSelect, 'data-id');

    // If the element doesn't have a parent with data-id, it's not a valid item
    if (!parentWithId) {
        return;
    }

    const id = parentWithId.getAttribute('data-id');

    if (selected) {
        const current = selectedItems.filter(i => {
            return i === id;
        });

        if (!current.length) {
            selectedItems.push(id);
            selectedElements.push(chkItemSelect);
        }
    } else {
        selectedItems = selectedItems.filter(i => {
            return i !== id;
        });
        selectedElements = selectedElements.filter(i => {
            return i !== chkItemSelect;
        });
    }

    if (selectedItems.length) {
        const itemSelectionCount = document.querySelector('.itemSelectionCount');
        if (itemSelectionCount) {
            itemSelectionCount.innerHTML = datetime.toLocaleString(selectedItems.length);
        }
    } else {
        hideSelections();
    }
}

function onSelectionChange() {
    updateItemSelection(this, this.checked);
}

function showSelection(item, isChecked, addInitialCheck) {
    // Only add selection checkbox if the item has a data-id attribute
    if (!dom.parentWithAttribute(item, 'data-id')) {
        return;
    }

    let itemSelectionPanel = item.querySelector('.itemSelectionPanel');

    if (!itemSelectionPanel) {
        itemSelectionPanel = document.createElement('div');
        itemSelectionPanel.classList.add('itemSelectionPanel');

        const parent = item.querySelector('.cardBox') || item.querySelector('.cardContent');
        parent.classList.add('withMultiSelect');
        parent.appendChild(itemSelectionPanel);

        let cssClass = 'chkItemSelect';
        if (isChecked && addInitialCheck) {
            cssClass += ' checkedInitial';
        }
        const checkedAttribute = isChecked ? ' checked' : '';
        itemSelectionPanel.innerHTML = `<label class="checkboxContainer"><input type="checkbox" is="emby-checkbox" data-outlineclass="multiSelectCheckboxOutline" class="${cssClass}"${checkedAttribute}/><span></span></label>`;
        const chkItemSelect = itemSelectionPanel.querySelector('.chkItemSelect');
        chkItemSelect.addEventListener('change', onSelectionChange);
    }
}

function showSelectionCommands() {
    let selectionCommandsPanel = currentSelectionCommandsPanel;

    if (!selectionCommandsPanel) {
        selectionCommandsPanel = document.createElement('div');
        selectionCommandsPanel.classList.add('selectionCommandsPanel');

        document.body.appendChild(selectionCommandsPanel);
        currentSelectionCommandsPanel = selectionCommandsPanel;

        let html = '';

        html += '<button is="paper-icon-button-light" class="btnCloseSelectionPanel autoSize"><span class="material-icons close" aria-hidden="true"></span></button>';
        html += '<h1 class="itemSelectionCount"></h1>';

        const moreIcon = 'more_vert';
        html += `<button is="paper-icon-button-light" class="btnSelectionPanelOptions autoSize"><span class="material-icons ${moreIcon}" aria-hidden="true"></span></button>`;

        selectionCommandsPanel.innerHTML = html;

        selectionCommandsPanel.querySelector('.btnCloseSelectionPanel').addEventListener('click', hideSelections);

        const btnSelectionPanelOptions = selectionCommandsPanel.querySelector('.btnSelectionPanelOptions');

        dom.addEventListener(btnSelectionPanelOptions, 'click', showMenuForSelectedItems, { passive: true });
    }
}

function showMenuForSelectedItems(e) {
    const apiClient = ServerConnections.currentApiClient();

    const menuItems = [];

    menuItems.push({
        name: globalize.translate('SelectAll'),
        id: 'selectall',
        icon: 'select_all'
    });

    menuItems.push({
        name: globalize.translate('MarkPlayed'),
        id: 'markplayed',
        icon: 'check_box'
    });

    menuItems.push({
        name: globalize.translate('MarkUnplayed'),
        id: 'markunplayed',
        icon: 'check_box_outline_blank'
    });

    import('../actionSheet/actionSheet').then((actionsheet) => {
        actionsheet.show({
            items: menuItems,
            positionTo: e.target,
            callback: function (id) {
                const items = selectedItems.slice(0);

                switch (id) {
                    case 'selectall':
                        {
                            const elems = document.querySelectorAll('.itemSelectionPanel');
                            for (let i = 0, length = elems.length; i < length; i++) {
                                const chkItemSelect = elems[i].querySelector('.chkItemSelect');

                                if (chkItemSelect && !chkItemSelect.classList.contains('checkedInitial') && !chkItemSelect.checked && chkItemSelect.getBoundingClientRect().width != 0) {
                                    chkItemSelect.checked = true;
                                    updateItemSelection(chkItemSelect, true);
                                }
                            }
                        }
                        break;
                    case 'markplayed':
                        items.forEach(itemId => {
                            apiClient.markPlayed(apiClient.getCurrentUserId(), itemId);
                        });
                        hideSelections();
                        dispatchNeedsRefresh();
                        break;
                    case 'markunplayed':
                        items.forEach(itemId => {
                            apiClient.markUnplayed(apiClient.getCurrentUserId(), itemId);
                        });
                        hideSelections();
                        dispatchNeedsRefresh();
                        break;
                    default:
                        break;
                }
            }
        });
    });
}

function dispatchNeedsRefresh() {
    const elems = [];

    [].forEach.call(selectedElements, i => {
        const container = dom.parentWithAttribute(i, 'is', 'emby-itemscontainer');

        if (container && !elems.includes(container)) {
            elems.push(container);
        }
    });

    for (let i = 0, length = elems.length; i < length; i++) {
        elems[i].notifyRefreshNeeded(true);
    }

    Events.trigger(document, EventType.REFRESH_NEEDED);
}

function showSelections(initialCard, addInitialCheck) {
    import('../../elements/emby-checkbox/emby-checkbox').then(() => {
        const cards = document.querySelectorAll('.card');
        for (let i = 0, length = cards.length; i < length; i++) {
            showSelection(cards[i], initialCard === cards[i], addInitialCheck);
        }

        showSelectionCommands();
        updateItemSelection(initialCard, true);
    });
}

function onContainerClick(e) {
    const target = e.target;

    if (selectedItems.length) {
        const card = dom.parentWithClass(target, 'card');
        if (card) {
            const itemSelectionPanel = card.querySelector('.itemSelectionPanel');
            if (itemSelectionPanel) {
                return onItemSelectionPanelClick(e, itemSelectionPanel);
            }
        }

        e.preventDefault();
        e.stopPropagation();
        return false;
    }
}

document.addEventListener('viewbeforehide', hideSelections);

export default function (options) {
    const self = this;

    const container = options.container;

    function onTapHold(e) {
        const card = dom.parentWithClass(e.target, 'card');

        if (card) {
            showSelections(card, true);
        }

        e.preventDefault();
        // It won't have this if it's a hammer event
        if (e.stopPropagation) {
            e.stopPropagation();
        }
        return false;
    }

    function getTouches(e) {
        return e.changedTouches || e.targetTouches || e.touches;
    }

    let touchTarget;
    let touchStartTimeout;
    let touchStartX;
    let touchStartY;
    function onTouchStart(e) {
        const touch = getTouches(e)[0];
        touchTarget = null;
        touchStartX = 0;
        touchStartY = 0;

        if (touch) {
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            const element = touch.target;

            if (element) {
                const card = dom.parentWithClass(element, 'card');

                if (card) {
                    if (touchStartTimeout) {
                        clearTimeout(touchStartTimeout);
                        touchStartTimeout = null;
                    }

                    touchTarget = card;
                    touchStartTimeout = setTimeout(onTouchStartTimerFired, 550);
                }
            }
        }
    }

    function onTouchMove(e) {
        if (touchTarget) {
            const touch = getTouches(e)[0];
            let deltaX;
            let deltaY;

            if (touch) {
                const touchEndX = touch.clientX || 0;
                const touchEndY = touch.clientY || 0;
                deltaX = Math.abs(touchEndX - (touchStartX || 0));
                deltaY = Math.abs(touchEndY - (touchStartY || 0));
            } else {
                deltaX = 100;
                deltaY = 100;
            }
            if (deltaX >= 5 || deltaY >= 5) {
                onMouseOut();
            }
        }
    }

    function onTouchEnd() {
        onMouseOut();
    }

    function onMouseDown(e) {
        touchTarget = null;
        touchStartX = e.clientX || 0;
        touchStartY = e.clientY || 0;

        const element = e.target;
        if (!dom.parentWithClass(element, 'card')) {
            return;
        }

        if (touchStartTimeout) {
            clearTimeout(touchStartTimeout);
            touchStartTimeout = null;
        }

        touchTarget = element;
        touchStartTimeout = setTimeout(onTouchStartTimerFired, 550);
    }

    function onMouseMove(e) {
        if (!touchTarget) {
            return;
        }

        const deltaX = Math.abs((e.clientX || 0) - (touchStartX || 0));
        const deltaY = Math.abs((e.clientY || 0) - (touchStartY || 0));

        if (deltaX >= 5 || deltaY >= 5) {
            onMouseOut();
        }
    }

    function onMouseOut() {
        if (touchStartTimeout) {
            clearTimeout(touchStartTimeout);
            touchStartTimeout = null;
        }
        touchTarget = null;
    }

    function onTouchStartTimerFired() {
        if (!touchTarget) {
            return;
        }

        const card = dom.parentWithClass(touchTarget, 'card');
        touchTarget = null;

        if (card) {
            showSelections(card, true);
        }
    }

    function initTapHold(element) {
        // mobile safari doesn't allow contextmenu override
        if (browser.touch && !browser.safari) {
            element.addEventListener('contextmenu', onTapHold);
        } else {
            dom.addEventListener(element, 'touchstart', onTouchStart, {
                passive: true
            });
            dom.addEventListener(element, 'touchmove', onTouchMove, {
                passive: true
            });
            dom.addEventListener(element, 'touchend', onTouchEnd, {
                passive: true
            });
            dom.addEventListener(element, 'touchcancel', onTouchEnd, {
                passive: true
            });
            dom.addEventListener(element, 'mousedown', onMouseDown, {
                passive: true
            });
            dom.addEventListener(element, 'mousemove', onMouseMove, {
                passive: true
            });
            dom.addEventListener(element, 'mouseleave', onMouseOut, {
                passive: true
            });
            dom.addEventListener(element, 'mouseup', onMouseOut, {
                passive: true
            });
        }
    }

    initTapHold(container);

    if (options.bindOnClick !== false) {
        container.addEventListener('click', onContainerClick);
    }

    self.onContainerClick = onContainerClick;

    self.destroy = () => {
        container.removeEventListener('click', onContainerClick);
        container.removeEventListener('contextmenu', onTapHold);

        const element = container;

        dom.removeEventListener(element, 'touchstart', onTouchStart, {
            passive: true
        });
        dom.removeEventListener(element, 'touchmove', onTouchMove, {
            passive: true
        });
        dom.removeEventListener(element, 'touchend', onTouchEnd, {
            passive: true
        });
        dom.removeEventListener(element, 'mousedown', onMouseDown, {
            passive: true
        });
        dom.removeEventListener(element, 'mousemove', onMouseMove, {
            passive: true
        });
        dom.removeEventListener(element, 'mouseleave', onMouseOut, {
            passive: true
        });
        dom.removeEventListener(element, 'mouseup', onMouseOut, {
            passive: true
        });
    };
}

export const startMultiSelect = (card) => {
    showSelections(card, false);
};

export const stopMultiSelect = () => {
    hideSelections();
};
