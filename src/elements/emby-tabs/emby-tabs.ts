import 'webcomponents.js/webcomponents-lite';
import dom from '../../utils/dom';
import ScrollerFactory from 'lib/scroller';
import type { ScrollerOptions } from 'lib/scroller/types';
import focusManager from '../../lib/focusManager';
import layoutManager from '../../lib/layoutManager';
import './emby-tabs.scss';
import '../../styles/scrollstyles.scss';

import type { Tabs, TabsPrototype } from './tabTypes';
const EmbyTabs = Object.create(HTMLDivElement.prototype) as TabsPrototype;
const buttonClass = 'emby-tab-button';
const activeButtonClass = buttonClass + '-active';

function setActiveTabButton(newButton: Element) {
    newButton.classList.add(activeButtonClass);
}

function triggerBeforeTabChange(tabs: Tabs, index: number, previousIndex?: number | null) {
    tabs.dispatchEvent(new CustomEvent('beforetabchange', {
        detail: {
            selectedTabIndex: index,
            previousIndex: previousIndex
        }
    }));
}

function onClick(this: Tabs, e: { target: EventTarget | null }) {
    const current = this.querySelector('.' + activeButtonClass);
    const tabButton = dom.parentWithClass(e.target as HTMLElement, buttonClass);

    if (tabButton && tabButton !== current) {
        if (current) {
            current.classList.remove(activeButtonClass);
        }

        const previousIndex = current ? parseInt(current.getAttribute('data-index')!, 10) : null;

        setActiveTabButton(tabButton);

        const index = parseInt(tabButton.getAttribute('data-index')!, 10);

        triggerBeforeTabChange(this, index, previousIndex);

        // If toCenter is called syncronously within the click event, it sometimes ends up canceling it
        setTimeout(() => {
            this.selectedTabIndex = index;

            this.dispatchEvent(new CustomEvent('tabchange', {
                detail: {
                    selectedTabIndex: index,
                    previousIndex: previousIndex
                }
            }));
        }, 120);

        if (this.scroller) {
            this.scroller.toCenter(tabButton, false);
        }
    }
}

function onFocusIn(this: Tabs, e: Event) {
    const tabButton = dom.parentWithClass(e.target as HTMLElement, buttonClass);
    if (tabButton && this.scroller) {
        this.scroller.toCenter(tabButton, false);
    }
}

function onFocusOut(e: Event) {
    const target = e.target as HTMLElement;
    const parentContainer = target.parentNode as HTMLElement;
    const previousFocus = parentContainer.querySelector('.lastFocused');
    if (previousFocus) {
        previousFocus.classList.remove('lastFocused');
    }
    target.classList.add('lastFocused');
}

function initScroller(tabs: Tabs) {
    if (tabs.scroller) {
        return;
    }

    const contentScrollSlider = tabs.querySelector<HTMLElement>('.emby-tabs-slider');
    if (contentScrollSlider) {
        const options: ScrollerOptions & Record<string, unknown> = {
            horizontal: 1,
            itemNav: 0,
            mouseDragging: 1,
            slidee: contentScrollSlider,
            smart: true,
            releaseSwing: true,
            scrollBy: 200,
            elasticBounds: 1,
            dragHandle: 1,
            dynamicHandle: 1,
            clickBar: 1,
            hiddenScroll: true

        };
        tabs.scroller = new ScrollerFactory(tabs, options);
        tabs.scroller.init();
    } else {
        tabs.classList.add('scrollX');
        tabs.classList.add('hiddenScrollX');
        tabs.classList.add('smoothScrollX');
    }
}

EmbyTabs.createdCallback = function () {
    if (this.classList.contains('emby-tabs')) {
        return;
    }
    this.classList.add('emby-tabs');
    this.classList.add('focusable');

    dom.addEventListener(this, 'click', onClick, {
        passive: true
    });

    if (layoutManager.tv) {
        dom.addEventListener(this, 'focusin', onFocusIn, { passive: true });
    }

    dom.addEventListener(this, 'focusout', onFocusOut);
};

EmbyTabs.focus = function () {
    const selectedTab = this.querySelector('.' + activeButtonClass);
    const lastFocused = this.querySelector('.lastFocused');

    if (selectedTab) {
        focusManager.focus(selectedTab);
    } else if (lastFocused) {
        focusManager.focus(lastFocused);
    } else {
        focusManager.autoFocus(this);
    }
};

EmbyTabs.refresh = function () {
    if (this.scroller) {
        this.scroller.reload();
    }
};

EmbyTabs.attachedCallback = function () {
    initScroller(this);

    const current = this.querySelector('.' + activeButtonClass);
    const currentIndex = current ? parseInt(current.getAttribute('data-index')!, 10) : parseInt(this.getAttribute('data-index') || '0', 10);

    if (currentIndex !== -1) {
        this.selectedTabIndex = currentIndex;

        const tabButtons = this.querySelectorAll('.' + buttonClass);

        const newTabButton = tabButtons[currentIndex];

        if (newTabButton) {
            setActiveTabButton(newTabButton);
        }
    }

    if (!this.readyFired) {
        this.readyFired = true;
        this.dispatchEvent(new CustomEvent('ready', {}));
    }
};

EmbyTabs.detachedCallback = function () {
    if (this.scroller) {
        this.scroller.destroy();
        this.scroller = null;
    }

    dom.removeEventListener(this, 'click', onClick, {
        passive: true
    });

    if (layoutManager.tv) {
        dom.removeEventListener(this, 'focusin', onFocusIn, { passive: true });
    }
};

function getSelectedTabButton(elem: Tabs) {
    return elem.querySelector('.' + activeButtonClass);
}

EmbyTabs.selectedIndex = function (selected, triggerEvent) {
    if (selected == null) {
        return this.selectedTabIndex || 0;
    }

    const current = this.selectedIndex()!;

    this.selectedTabIndex = selected;

    const tabButtons = this.querySelectorAll('.' + buttonClass);

    if (current === selected || triggerEvent === false) {
        triggerBeforeTabChange(this, selected, current);

        this.dispatchEvent(new CustomEvent('tabchange', {
            detail: {
                selectedTabIndex: selected
            }
        }));

        const currentTabButton = tabButtons[current];
        setActiveTabButton(tabButtons[selected]);

        if (current !== selected && currentTabButton) {
            currentTabButton.classList.remove(activeButtonClass);
        }
    } else {
        onClick.call(this, {
            target: tabButtons[selected]
        });
    }
};

function getSibling(elem: Element | null, method: 'nextSibling' | 'previousSibling') {
    let sibling = elem?.[method] as Element | null;

    while (sibling) {
        if (sibling.classList.contains(buttonClass) && !sibling.classList.contains('hide')) {
            return sibling;
        }

        sibling = sibling[method] as Element | null;
    }

    return null;
}

EmbyTabs.selectNext = function () {
    const current = getSelectedTabButton(this);

    const sibling = getSibling(current, 'nextSibling');

    if (sibling) {
        onClick.call(this, {
            target: sibling
        });
    }
};

EmbyTabs.selectPrevious = function () {
    const current = getSelectedTabButton(this);

    const sibling = getSibling(current, 'previousSibling');

    if (sibling) {
        onClick.call(this, {
            target: sibling
        });
    }
};

EmbyTabs.triggerBeforeTabChange = function () {
    triggerBeforeTabChange(this, this.selectedIndex()!);
};

EmbyTabs.triggerTabChange = function () {
    this.dispatchEvent(new CustomEvent('tabchange', {
        detail: {
            selectedTabIndex: this.selectedIndex()
        }
    }));
};

EmbyTabs.setTabEnabled = function (index, enabled) {
    const btn = this.querySelector('.emby-tab-button[data-index="' + index + '"]')!;

    if (enabled) {
        btn.classList.remove('hide');
    } else {
        btn.classList.remove('add');
    }
};

(document as Document & { registerElement(name: string, options: { prototype: TabsPrototype; extends: string }): void }).registerElement('emby-tabs', {
    prototype: EmbyTabs,
    extends: 'div'
});

