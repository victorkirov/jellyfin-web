/**
 * Name of animation end event.
 */
let _animationEvent: string | undefined;

/**
 * Returns name of animation end event.
 * @returns {string} Name of animation end event.
 */
export function whichAnimationEvent() {
    if (_animationEvent) {
        return _animationEvent;
    }

    const el = document.createElement('div');
    const animations: Record<string, string> = {
        'animation': 'animationend',
        'OAnimation': 'oAnimationEnd',
        'MozAnimation': 'animationend',
        'WebkitAnimation': 'webkitAnimationEnd'
    };
    for (const t in animations) {
        // lib.dom omits the vendor-prefixed CSS properties probed by legacy browsers.
        if ((el.style as unknown as Record<string, string | undefined>)[t] !== undefined) {
            _animationEvent = animations[t];
            return animations[t];
        }
    }

    _animationEvent = 'animationend';
    return _animationEvent;
}

/**
 * Returns name of animation cancel event.
 * @returns {string} Name of animation cancel event.
 */
export function whichAnimationCancelEvent() {
    return whichAnimationEvent().replace('animationend', 'animationcancel').replace('AnimationEnd', 'AnimationCancel');
}

/**
 * Name of transition end event.
 */
let _transitionEvent: string | undefined;

/**
 * Returns name of transition end event.
 * @returns {string} Name of transition end event.
 */
export function whichTransitionEvent() {
    if (_transitionEvent) {
        return _transitionEvent;
    }

    const el = document.createElement('div');
    const transitions: Record<string, string> = {
        'transition': 'transitionend',
        'OTransition': 'oTransitionEnd',
        'MozTransition': 'transitionend',
        'WebkitTransition': 'webkitTransitionEnd'
    };
    for (const t in transitions) {
        // lib.dom omits the vendor-prefixed CSS properties probed by legacy browsers.
        if ((el.style as unknown as Record<string, string | undefined>)[t] !== undefined) {
            _transitionEvent = transitions[t];
            return transitions[t];
        }
    }

    _transitionEvent = 'transitionend';
    return _transitionEvent;
}

