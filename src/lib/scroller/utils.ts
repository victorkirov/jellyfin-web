import globalize from '../globalize';

/**
 * Disables an event it was triggered on and unbinds itself.
 *
 * @param  {Event} event
 *
 * @return {Void}
 */
export function disableOneEvent(this: EventTarget, event: Event) {
    /*jshint validthis:true */
    event.preventDefault();
    event.stopPropagation();
    this.removeEventListener(event.type, disableOneEvent);
}

/**
 * Make sure that number is within the limits.
 *
 * @param {Number} number
 * @param {Number} min
 * @param {Number} max
 *
 * @return {Number}
 */
export function within(number: number, num1: number, num2?: number) {
    if (num2 === undefined && globalize.getIsRTL()) {
        return number > num1 ? num1 : number;
    } else if (num2 === undefined) {
        return number < num1 ? num1 : number;
    }
    const min = Math.min(num1, num2);
    const max = Math.max(num1, num2);
    if (number < min) {
        return min;
    } else if (number > max) {
        return max;
    }
    return number;
}

