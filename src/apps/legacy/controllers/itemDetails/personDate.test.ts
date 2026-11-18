import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatPersonDate } from './personDate';

const locale = vi.hoisted(() => ({ value: 'en-GB' }));
vi.mock('lib/globalize', () => ({ default: {
    getCurrentDateTimeLocale: () => locale.value,
    translate: (label: string, value: string | number) => `${label}: ${value}`
} }));
afterEach(() => {
    locale.value = 'en-GB';
    vi.useRealTimers();
});

describe('person date captions', () => {
    it('uses the application locale and the living person age', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 10, 18));
        expect(formatPersonDate('1980-01-02', 'BirthDateValue', '1980-01-02')).toBe('BirthDateValue: 02/01/1980 AgeValue: 46');
        locale.value = 'fr-FR';
        expect(formatPersonDate('1980-01-02', 'BirthDateValue')).toBe('BirthDateValue: 02/01/1980');
    });
    it('calculates a deceased person age at death', () => {
        expect(formatPersonDate('2020-01-03', 'DeathDateValue', '1980-01-02', '2020-01-03')).toBe('DeathDateValue: 03/01/2020 AgeValue: 40');
        expect(formatPersonDate('1980-01-02', 'BirthDateValue')).toBe('BirthDateValue: 02/01/1980');
    });
    it.each(['bad-date', '1980-02-31', '1980-13-01'])('rejects invalid date %s', value => {
        expect(() => formatPersonDate(value, 'BirthDateValue')).toThrow();
    });
    it('keeps a date-only birthday on the same local calendar day', () => {
        const expected = new Intl.DateTimeFormat('en-GB').format(new Date(1980, 0, 2));
        expect(formatPersonDate('1980-01-02', 'BirthDateValue')).toBe(`BirthDateValue: ${expected}`);
    });
});
