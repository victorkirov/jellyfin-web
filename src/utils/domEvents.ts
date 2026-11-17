let supportsCaptureOption = false;
try {
    const opts = Object.defineProperty({}, 'capture', {
        get: function () {
            supportsCaptureOption = true;
            return null;
        }
    });
    (window as EventTarget).addEventListener('test', null, opts);
} catch {
    // no capture support
}

/**
 * Adds event listener to specified target.
 * @param {EventTarget} target - Event target.
 * @param {string} type - Event type.
 * @param {function} handler - Event handler.
 * @param {Object} [options] - Listener options.
 */
export function addEventListener<Key extends keyof GlobalEventHandlersEventMap>(target: EventTarget, type: Key, handler: (event: GlobalEventHandlersEventMap[Key]) => void, options?: AddEventListenerOptions): void;
export function addEventListener<EventType extends Event>(target: EventTarget, type: string, handler: (event: EventType) => void, options?: AddEventListenerOptions): void;
export function addEventListener(target: EventTarget, type: string, handler: EventListenerObject, options?: AddEventListenerOptions): void;
export function addEventListener(target: EventTarget, type: string, handler: ((event: never) => void) | EventListenerObject, options?: AddEventListenerOptions) {
    let optionsOrCapture: AddEventListenerOptions | boolean | undefined = options || {};
    if (!supportsCaptureOption) {
        optionsOrCapture = optionsOrCapture.capture;
    }
    // Native event targets erase the event-specific callback type at registration.
    target.addEventListener(type, handler as EventListenerOrEventListenerObject, optionsOrCapture);
}

/**
 * Removes event listener from specified target.
 * @param {EventTarget} target - Event target.
 * @param {string} type - Event type.
 * @param {function} handler - Event handler.
 * @param {Object} [options] - Listener options.
 */
export function removeEventListener<Key extends keyof GlobalEventHandlersEventMap>(target: EventTarget, type: Key, handler: (event: GlobalEventHandlersEventMap[Key]) => void, options?: AddEventListenerOptions): void;
export function removeEventListener<EventType extends Event>(target: EventTarget, type: string, handler: (event: EventType) => void, options?: AddEventListenerOptions): void;
export function removeEventListener(target: EventTarget, type: string, handler: EventListenerObject, options?: AddEventListenerOptions): void;
export function removeEventListener(target: EventTarget, type: string, handler: ((event: never) => void) | EventListenerObject, options?: AddEventListenerOptions) {
    let optionsOrCapture: AddEventListenerOptions | boolean | undefined = options || {};
    if (!supportsCaptureOption) {
        optionsOrCapture = optionsOrCapture.capture;
    }
    // Match registration while preserving the original callback identity.
    target.removeEventListener(type, handler as EventListenerOrEventListenerObject, optionsOrCapture);
}

