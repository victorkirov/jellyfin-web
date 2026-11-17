import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDisplayRunningTime, toLocaleDateString, toLocaleString, toLocaleTimeString } from './datetime';

const locale = vi.hoisted(() => ({ value: 'en-US' }));
vi.mock('lib/globalize', () => ({
    default: { getCurrentDateTimeLocale: () => locale.value }
}));

beforeEach(() => {
    locale.value = 'en-US';
});

describe('cached date formatters', () => {
    const date = new Date(2026, 10, 17, 13, 5, 9);

    it('preserves defaults and explicit options for each date method', () => {
        for (const options of [undefined, {}, { year: 'numeric' as const }, { hour: 'numeric' as const, minute: '2-digit' as const }]) {
            expect(toLocaleString(date, options)).toBe(date.toLocaleString(locale.value, options));
            expect(toLocaleDateString(date, options)).toBe(date.toLocaleDateString(locale.value, options));
            expect(toLocaleTimeString(date, options)).toBe(date.toLocaleTimeString(locale.value, options));
        }
    });

    it('reuses a formatter and discards it when the locale changes', () => {
        const formatter = vi.spyOn(Intl, 'DateTimeFormat');
        const options = { weekday: 'long' as const };
        toLocaleDateString(date, options);
        toLocaleDateString(date, { ...options });
        expect(formatter).toHaveBeenCalledTimes(1);
        locale.value = 'fr-FR';
        expect(toLocaleDateString(date, options)).toBe(date.toLocaleDateString(locale.value, options));
        locale.value = 'en-US';
        toLocaleDateString(date, options);
        expect(formatter).toHaveBeenCalledTimes(3);
    });

    it('formats production years and counts as numbers with their own options', () => {
        const formatter = vi.spyOn(Intl, 'NumberFormat');
        expect(toLocaleString(2026, { useGrouping: false })).toBe('2026');
        expect(toLocaleString(2025, { useGrouping: false })).toBe('2025');
        expect(formatter).toHaveBeenCalledTimes(1);
        expect(toLocaleString(12345.5)).toBe((12345.5).toLocaleString('en-US'));
        expect(formatter).toHaveBeenCalledTimes(2);
        expect(toLocaleString('unchanged')).toBe('unchanged');
        expect(toLocaleString(new Date(NaN))).toBe('Invalid Date');
    });

    it('keeps native date and number fallbacks when Intl is unavailable', () => {
        const expectedDate = date.toLocaleTimeString('en-US', { hour: 'numeric' });
        const expectedNumber = (2026).toLocaleString('en-US', { useGrouping: false });
        vi.stubGlobal('Intl', undefined);
        try {
            expect(toLocaleTimeString(date, { hour: 'numeric' })).toBe(expectedDate);
            expect(toLocaleString(2026, { useGrouping: false })).toBe(expectedNumber);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('reuses number formatting for runtime digits', () => {
        locale.value = 'en-GB';
        const formatter = vi.spyOn(Intl, 'NumberFormat');
        expect(getDisplayRunningTime(36610000000)).toBe('1:01:01');
        expect(getDisplayRunningTime(610000000)).toBe('1:01');
        expect(formatter).toHaveBeenCalledTimes(1);
    });
});
