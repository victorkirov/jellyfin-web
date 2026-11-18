/** The number of milliseconds per second */
export const MILLISECONDS_PER_SECOND = 1_000;

/** The number of milliseconds per minute */
export const MILLISECONDS_PER_MINUTE = 60 * MILLISECONDS_PER_SECOND;

/** The number of milliseconds per hour */
export const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE;

/** The number of ticks per millisecond */
export const TICKS_PER_MILLISECOND = 10_000;

/** The number of ticks per second */
export const TICKS_PER_SECOND = MILLISECONDS_PER_SECOND * TICKS_PER_MILLISECOND;

/** The number of ticks per minute */
export const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND;

export function millisecondsToTicks(milliseconds: number) {
    return milliseconds * TICKS_PER_MILLISECOND;
}

export function ticksToMilliseconds(ticks: number) {
    return ticks / TICKS_PER_MILLISECOND;
}
