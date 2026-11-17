import focusManager from '../../lib/focusManager';
import browser from '../../scripts/browser';
import layoutManager from '../../lib/layoutManager';
import inputManager from '../../scripts/inputManager';
import { toBoolean } from '../../utils/string';
import { hide } from '../loading/loading';
import dom from '../../utils/dom';

import { history } from 'lib/navigationHistory';

import './dialoghelper.scss';
import '../../styles/scrollstyles.scss';

import type { DialogElement, DialogOptions } from './dialogTypes';
import type { Update } from 'history';
import { focusDialog } from './dialogFocus';

let globalOnOpenCallback: ((dialog: DialogElement) => void) | undefined;

function removeCenterFocus(dlg: DialogElement) {
    if (layoutManager.tv) {
        if (dlg.classList.contains('scrollX')) {
            centerFocus(dlg, true, false);
        } else if (dlg.classList.contains('smoothScrollY')) {
            centerFocus(dlg, false, false);
        }
    }
}

function tryRemoveElement(elem: Element) {
    const parentNode = elem.parentNode;
    if (parentNode) {
        // Seeing crashes in edge webview
        try {
            parentNode.removeChild(elem);
        } catch (err) {
            console.error('[dialogHelper] error removing dialog element: ' + err);
        }
    }
}

function removeDialogElement(dlg: DialogElement) {
    removeCenterFocus(dlg);
    const dialogContainer = dlg.dialogContainer;
    if (dialogContainer) {
        tryRemoveElement(dialogContainer);
        dlg.dialogContainer = null;
    } else {
        tryRemoveElement(dlg);
    }
}

function handleDialogHistory(dlg: DialogElement, hash: string, resolve: (result: { element: DialogElement }) => void) {
    const activeElement = document.activeElement;
    let removeScrollLockOnClose = false;
    let unlisten: (() => void) | null = null;

    function onHashChange({ location }: Update) {
        const dialogs = (location.state as { dialogs?: string[] } | null)?.dialogs || [];
        const shouldClose = !dialogs.includes(hash);

        if ((shouldClose || !isOpened(dlg)) && unlisten) {
            unlisten();
            unlisten = null;
        }

        if (shouldClose) {
            close(dlg);
        }
    }

    function finishClose() {
        if (unlisten) {
            unlisten();
            unlisten = null;
        }

        dlg.dispatchEvent(new CustomEvent('close', {
            bubbles: false,
            cancelable: false
        }));

        resolve({
            element: dlg
        });
    }

    function onBackCommand(e: Event) {
        if ((e as CustomEvent<{ command: string }>).detail.command === 'back') {
            e.preventDefault();
            e.stopPropagation();
            close(dlg);
        }
    }

    function onDialogClosed() {
        if (!isHistoryEnabled(dlg)) {
            inputManager.off(dlg, onBackCommand);
        }

        if (unlisten) {
            unlisten();
            unlisten = null;
        }

        removeBackdrop(dlg);
        hide();

        dlg.classList.remove('opened');

        if (removeScrollLockOnClose) {
            document.body.classList.remove('noScroll');
        }

        let closesWithHistory = false;
        if (isHistoryEnabled(dlg)) {
            const state = history.location.state || {};
            if (state.dialogs?.length > 0) {
                if (state.dialogs[state.dialogs.length - 1] === hash) {
                    closesWithHistory = true;
                    unlisten = history.listen(finishClose);
                    history.back();
                } else if (state.dialogs.includes(hash)) {
                    console.warn('[dialogHelper] dialog "%s" was closed, but is not the last dialog opened', hash);

                    closesWithHistory = true;
                    unlisten = history.listen(finishClose);

                    // Remove the closed dialog hash from the history state
                    history.replace(
                        `${history.location.pathname}${history.location.search}`,
                        {
                            ...state,
                            dialogs: state.dialogs.filter((dialog: string) => dialog !== hash)
                        }
                    );
                }
            }
        }

        if (layoutManager.tv) {
            focusManager.focus(activeElement);
        }

        if (toBoolean(dlg.getAttribute('data-removeonclose'), true)) {
            removeDialogElement(dlg);
        }

        if (!closesWithHistory) {
            finishClose();
        }
    }

    dlg.addEventListener('_close', onDialogClosed);

    const center = !dlg.classList.contains('dialog-fixedSize');
    if (center) {
        dlg.classList.add('centeredDialog');
    }

    dlg.classList.remove('hide');

    addBackdropOverlay(dlg);

    dlg.classList.add('opened');
    dlg.dispatchEvent(new CustomEvent('open', {
        bubbles: false,
        cancelable: false
    }));

    if (dlg.getAttribute('data-lockscroll') === 'true' && !document.body.classList.contains('noScroll')) {
        document.body.classList.add('noScroll');
        removeScrollLockOnClose = true;
    }

    focusDialog(dlg);

    if (isHistoryEnabled(dlg)) {
        const state = history.location.state || {};
        const dialogs = state.dialogs || [];
        // Add new dialog to the list of open dialogs
        dialogs.push(hash);

        history.push(
            `${history.location.pathname}${history.location.search}`,
            {
                ...state,
                dialogs
            }
        );

        unlisten = history.listen(onHashChange);
    } else {
        inputManager.on(dlg, onBackCommand);
    }
}

function addBackdropOverlay(dlg: DialogElement) {
    const backdrop = document.createElement('div');
    backdrop.classList.add('dialogBackdrop');

    const backdropParent = dlg.dialogContainer || dlg;
    backdropParent.parentNode!.insertBefore(backdrop, backdropParent);
    dlg.backdrop = backdrop;

    backdrop.classList.add('dialogBackdropOpened');

    let clickedElement: EventTarget | null;

    dom.addEventListener((dlg.dialogContainer || backdrop), 'mousedown', (e: MouseEvent) => {
        clickedElement = e.target;
    });

    dom.addEventListener((dlg.dialogContainer || backdrop), 'click', (e: MouseEvent) => {
        if (dlg.dialogContainer?.isSameNode(e.target as Node) && e.target == clickedElement) {
            close(dlg);
        }
    }, {
        passive: true
    });

    dom.addEventListener((dlg.dialogContainer || backdrop), 'contextmenu', (e: MouseEvent) => {
        if (dlg.dialogContainer?.isSameNode(e.target as Node)) {
            // Close the application dialog menu
            close(dlg);
            // Prevent the default browser context menu from appearing
            e.preventDefault();
        }
    });
}

function isHistoryEnabled(dlg: DialogElement) {
    return dlg.getAttribute('data-history') === 'true';
}

export function open(dlg: DialogElement) {
    if (globalOnOpenCallback) {
        globalOnOpenCallback(dlg);
    }

    const parent = dlg.parentNode;
    if (parent) {
        parent.removeChild(dlg);
    }

    const dialogContainer = document.createElement('div');
    dialogContainer.classList.add('dialogContainer');
    dialogContainer.appendChild(dlg);
    dlg.dialogContainer = dialogContainer;
    document.body.appendChild(dialogContainer);

    return new Promise<{ element: DialogElement }>((resolve) => {
        handleDialogHistory(dlg, `dlg${new Date().getTime()}`, resolve);
    });
}

function isOpened(dlg: DialogElement) {
    return !dlg.classList.contains('hide');
}

export function close(dlg: DialogElement) {
    if (!dlg.classList.contains('hide')) {
        dlg.dispatchEvent(new CustomEvent('closing', {
            bubbles: false,
            cancelable: false
        }));

        const onAnimationFinish = () => {
            focusManager.popScope();

            dlg.classList.add('hide');
            dlg.dispatchEvent(new CustomEvent('_close', {
                bubbles: false,
                cancelable: false
            }));
        };

        onAnimationFinish();
    }
}

const supportsOverscrollBehavior = 'overscroll-behavior-y' in document.body.style;

function shouldLockDocumentScroll(options: DialogOptions) {
    if (options.lockScroll != null) {
        return options.lockScroll;
    }

    if (options.size === 'fullscreen') {
        return true;
    }

    if (supportsOverscrollBehavior && (options.size || !browser.touch)) {
        return false;
    }

    if (options.size) {
        return true;
    }

    return browser.touch;
}

function removeBackdrop(dlg: DialogElement) {
    const backdrop = dlg.backdrop;

    if (!backdrop) {
        return;
    }

    dlg.backdrop = null;

    tryRemoveElement(backdrop);
}

function centerFocus(elem: HTMLElement, horiz: boolean, on: boolean) {
    void import('../../scripts/scrollHelper').then((scrollHelper) => {
        const fn = on ? 'on' : 'off';
        scrollHelper.centerFocus[fn](elem, horiz);
    });
}

export function createDialog(options: DialogOptions = {}) {
    // If there's no native dialog support, use a plain div
    // Also not working well in samsung tizen browser, content inside not clickable
    // Just go ahead and always use a plain div because we're seeing issues overlaying absoltutely positioned content over a modal dialog
    const dlg: DialogElement = document.createElement('div');

    // Add an id so we can access the dialog element
    if (options.id) {
        dlg.id = options.id;
    }

    dlg.classList.add('focuscontainer');
    dlg.classList.add('hide');

    if (shouldLockDocumentScroll(options)) {
        dlg.setAttribute('data-lockscroll', 'true');
    }

    if (options.enableHistory !== false) {
        dlg.setAttribute('data-history', 'true');
    }

    // without this safari will scroll the background instead of the dialog contents
    // but not needed here since this is already on top of an existing dialog
    // but skip it in IE because it's causing the entire browser to hang
    // Also have to disable for firefox because it's causing select elements to not be clickable
    if (options.modal !== false) {
        dlg.setAttribute('modal', 'modal');
    }

    if (options.autoFocus !== false) {
        dlg.setAttribute('data-autofocus', 'true');
    }

    dlg.classList.add('dialog');

    if (options.scrollX) {
        dlg.classList.add('scrollX');
        dlg.classList.add('smoothScrollX');

        if (layoutManager.tv) {
            centerFocus(dlg, true, true);
        }
    } else if (options.scrollY !== false) {
        dlg.classList.add('smoothScrollY');

        if (layoutManager.tv) {
            centerFocus(dlg, false, true);
        }
    }

    if (options.removeOnClose) {
        dlg.setAttribute('data-removeonclose', 'true');
    }

    if (options.size) {
        dlg.classList.add('dialog-fixedSize');
        dlg.classList.add(`dialog-${options.size}`);
    }

    return dlg;
}

export function setOnOpen(val: ((dialog: DialogElement) => void) | undefined) {
    globalOnOpenCallback = val;
}

export default {
    open: open,
    close: close,
    createDialog: createDialog,
    setOnOpen: setOnOpen
};
