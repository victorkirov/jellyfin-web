import ScrollerFactory from 'lib/scroller';
import dom from '../../utils/dom';
import layoutManager from '../../components/layoutManager';
import inputManager from '../../scripts/inputManager';
import focusManager from '../../components/focusManager';
import 'webcomponents.js/webcomponents-lite';
import './emby-scroller.scss';

const ScrollerPrototype = Object.create(HTMLDivElement.prototype);

ScrollerPrototype.createdCallback = function () {
    this.classList.add('emby-scroller');
};

function initCenterFocus(elem, scrollerInstance) {
    dom.addEventListener(elem, 'focus', function (e) {
        const focused = focusManager.focusableParent(e.target);
        if (focused) {
            scrollerInstance.toCenter(focused);
        }
    }, {
        capture: true,
        passive: true
    });
}

ScrollerPrototype.scrollToBeginning = function () {
    if (this.scroller) {
        this.scroller.slideTo(0, true);
    }
};

ScrollerPrototype.toStart = function (elem, immediate) {
    if (this.scroller) {
        this.scroller.toStart(elem, immediate);
    }
};

ScrollerPrototype.toCenter = function (elem, immediate) {
    if (this.scroller) {
        this.scroller.toCenter(elem, immediate);
    }
};

ScrollerPrototype.scrollToPosition = function (pos, immediate) {
    if (this.scroller) {
        this.scroller.slideTo(pos, immediate);
    }
};

ScrollerPrototype.getScrollPosition = function () {
    if (this.scroller) {
        return this.scroller.getScrollPosition();
    }
};

ScrollerPrototype.getScrollSize = function () {
    if (this.scroller) {
        return this.scroller.getScrollSize();
    }
};

ScrollerPrototype.getScrollEventName = function () {
    if (this.scroller) {
        return this.scroller.getScrollEventName();
    }
};

ScrollerPrototype.getScrollSlider = function () {
    if (this.scroller) {
        return this.scroller.getScrollSlider();
    }
};

ScrollerPrototype.addScrollEventListener = function (fn, options) {
    if (this.scroller) {
        dom.addEventListener(this.scroller.getScrollFrame(), this.scroller.getScrollEventName(), fn, options);
    }
};

ScrollerPrototype.removeScrollEventListener = function (fn, options) {
    if (this.scroller) {
        dom.removeEventListener(this.scroller.getScrollFrame(), this.scroller.getScrollEventName(), fn, options);
    }
};

function onInputCommand(e) {
    const cmd = e.detail.command;
    if (cmd === 'end') {
        focusManager.focusLast(this, '.' + this.getAttribute('data-navcommands'));
        e.preventDefault();
        e.stopPropagation();
    } else if (cmd === 'pageup') {
        focusManager.moveFocus(e.target, this, '.' + this.getAttribute('data-navcommands'), -12);
        e.preventDefault();
        e.stopPropagation();
    } else if (cmd === 'pagedown') {
        focusManager.moveFocus(e.target, this, '.' + this.getAttribute('data-navcommands'), 12);
        e.preventDefault();
        e.stopPropagation();
    }
}

ScrollerPrototype.attachedCallback = function () {
    if (this.getAttribute('data-navcommands')) {
        inputManager.on(this, onInputCommand);
    }

    const horizontal = this.getAttribute('data-horizontal') !== 'false';

    const slider = this.querySelector('.scrollSlider');

    if (horizontal) {
        slider.style['white-space'] = 'nowrap';
    }

    const scrollFrame = this;

    const options = {
        horizontal: horizontal,
        mouseDragging: 1,
        mouseWheel: this.getAttribute('data-mousewheel') !== 'false',
        touchDragging: 1,
        slidee: slider,
        scrollBy: 200,
        speed: horizontal ? 270 : 240,
        elasticBounds: 1,
        dragHandle: 1,
        autoImmediate: true,
        skipSlideToWhenVisible: this.getAttribute('data-skipfocuswhenvisible') === 'true',
        dispatchScrollEvent: this.getAttribute('data-scrollevent') === 'true',
        hideScrollbar: this.getAttribute('data-hidescrollbar') === 'true',
        allowNativeSmoothScroll: this.getAttribute('data-allownativesmoothscroll') === 'true',
        allowNativeScroll: true,
        forceHideScrollbars: false,
        // In edge, with the native scroll, the content jumps around when hovering over the buttons
        requireAnimation: false
    };

    // If just inserted it might not have any height yet - yes this is a hack
    this.scroller = new ScrollerFactory(scrollFrame, options);
    this.scroller.init();
    this.scroller.reload();

    if (layoutManager.tv && this.getAttribute('data-centerfocus')) {
        initCenterFocus(this, this.scroller);
    }
};

ScrollerPrototype.detachedCallback = function () {
    if (this.getAttribute('data-navcommands')) {
        inputManager.off(this, onInputCommand);
    }

    const scrollerInstance = this.scroller;
    if (scrollerInstance) {
        scrollerInstance.destroy();
        this.scroller = null;
    }
};

document.registerElement('emby-scroller', {
    prototype: ScrollerPrototype,
    extends: 'div'
});

