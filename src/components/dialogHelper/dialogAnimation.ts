import focusManager from '../../lib/focusManager';
import browser from '../../scripts/browser';
import dom from '../../utils/dom';
import type { DialogElement } from './dialogTypes';

export function enableAnimation() {
    // too slow
    if (browser.tv) {
        return false;
    }

    return browser.supportsCssAnimation();
}

const getAnimationEndHandler = (dlg: DialogElement, callback: () => void) => function handler() {
    dom.removeEventListener(dlg, dom.whichAnimationEvent(), handler, { once: true });
    callback();
};

export function animateDialogOpen(dlg: DialogElement) {
    const onAnimationFinish = () => {
        focusManager.pushScope(dlg);

        if (dlg.getAttribute('data-autofocus') === 'true') {
            focusManager.autoFocus(dlg);
        }

        if (document.activeElement && !dlg.contains(document.activeElement)) {
            // Blur foreign element to prevent triggering of an action from the previous scope
            (document.activeElement as HTMLElement).blur();
        }
    };

    if (enableAnimation()) {
        dom.addEventListener(
            dlg,
            dom.whichAnimationEvent(),
            getAnimationEndHandler(dlg, onAnimationFinish),
            { once: true });

        return;
    }

    onAnimationFinish();
}

export function animateDialogClose(dlg: DialogElement, onAnimationFinish: () => void) {
    if (enableAnimation()) {
        let animated = true;

        switch (dlg.animationConfig!.exit.name) {
            case 'fadeout':
                dlg.style.animation = `fadeout ${dlg.animationConfig!.exit.timing.duration}ms ease-out normal both`;
                break;
            case 'scaledown':
                dlg.style.animation = `scaledown ${dlg.animationConfig!.exit.timing.duration}ms ease-out normal both`;
                break;
            case 'slidedown':
                dlg.style.animation = `slidedown ${dlg.animationConfig!.exit.timing.duration}ms ease-out normal both`;
                break;
            default:
                animated = false;
                break;
        }

        dom.addEventListener(
            dlg,
            dom.whichAnimationEvent(),
            getAnimationEndHandler(dlg, onAnimationFinish),
            { once: true });

        if (animated) {
            return;
        }
    }

    onAnimationFinish();
}

