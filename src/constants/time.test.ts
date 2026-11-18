import { describe, expect, it } from 'vitest';
import { millisecondsToTicks, ticksToMilliseconds } from './time';

describe('media time conversions', () => {
    it.each([[0, 0], [1, 10000], [1.25, 12500], [123456, 1234560000], [-10, -100000]])(
        'converts %s milliseconds to %s ticks without rounding', (milliseconds, ticks) => {
            expect(millisecondsToTicks(milliseconds)).toBe(ticks);
            expect(ticksToMilliseconds(ticks)).toBe(milliseconds);
        }
    );
    it('keeps fractional milliseconds until the countdown display boundary', () => {
        const remainingTicks = 100000 - millisecondsToTicks(9.45);
        expect(ticksToMilliseconds(remainingTicks)).toBe(0.55);
        expect(Math.round(ticksToMilliseconds(remainingTicks))).toBe(1);
    });
});
