import focusManager from 'lib/focusManager';
import dom from 'utils/dom';

export type CommandSource = Element | Window;
export type CommandOptions = { sourceElement?: Element | null; [key: string]: unknown };
type CommandDispatcher = (commandName: string, options?: CommandOptions) => void;
let commandDispatcher: CommandDispatcher | undefined;

export function setCommandDispatcher(dispatcher: CommandDispatcher) {
    commandDispatcher = dispatcher;
}

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

    switch (commandName) {
        case 'up':
            focusManager.moveUp(sourceElement);
            break;
        case 'down':
            focusManager.moveDown(sourceElement);
            break;
        case 'left':
            focusManager.moveLeft(sourceElement);
            break;
        case 'right':
            focusManager.moveRight(sourceElement);
            break;
        case 'select':
            select(sourceElement as HTMLElement);
            break;
        case 'unknown':
            break;
        default:
            commandDispatcher?.(commandName, options);
    }
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
