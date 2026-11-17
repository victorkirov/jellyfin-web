import focusManager from 'lib/focusManager';
import dom from 'utils/dom';

import { dispatchCommand } from './inputCommandActions';

export type CommandSource = Element | Window;
export type CommandOptions = { sourceElement?: Element | null; [key: string]: unknown };


let lastInputTime = new Date().getTime();

export function notify() {
    lastInputTime = new Date().getTime();
    handleCommand('unknown');
}

export function notifyMouseMove() {
    lastInputTime = new Date().getTime();
}

export function idleTime() {
    return new Date().getTime() - lastInputTime;
}

export function select(sourceElement: HTMLElement) {
    sourceElement.click();
}

let eventListenerCount = 0;
export function on(scope: EventTarget, fn: EventListener) {
    eventListenerCount++;
    dom.addEventListener(scope, 'command', fn, {});
}

export function off(scope: EventTarget, fn: EventListener) {
    if (eventListenerCount) {
        eventListenerCount--;
    }

    dom.removeEventListener(scope, 'command', fn, {});
}

export function handleCommand(commandName: string, options?: CommandOptions) {
    lastInputTime = new Date().getTime();

    let sourceElement: CommandSource | null | undefined = options?.sourceElement;

    if (sourceElement) {
        sourceElement = focusManager.focusableParent(sourceElement);
    }

    if (!sourceElement) {
        sourceElement = document.activeElement || window;

        const dialogs = document.querySelectorAll('.dialogContainer .dialog.opened');

        // Suppose the top open dialog is active
        const dlg = dialogs.length ? dialogs[dialogs.length - 1] : null;

        if (dlg && !dlg.contains(sourceElement as Node)) {
            sourceElement = dlg;
        }
    }

    if (eventListenerCount) {
        const customEvent = new CustomEvent('command', {
            detail: {
                command: commandName
            },
            bubbles: true,
            cancelable: true
        });

        const eventResult = sourceElement.dispatchEvent(customEvent);
        if (!eventResult) {
            // event cancelled
            return;
        }
    }

    dispatchCommand(commandName, sourceElement, options);
}

dom.addEventListener(document, 'click', notify, {
    passive: true
});

export default {
    handleCommand: handleCommand,
    notify: notify,
    notifyMouseMove: notifyMouseMove,
    idleTime: idleTime,
    on: on,
    off: off
};
