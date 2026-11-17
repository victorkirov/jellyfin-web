import { describe, expect, it, vi } from 'vitest';
import { translate, updateCurrentCulture } from './index';

const settings = vi.hoisted(() => ({ culture: 'en-US' }));
vi.mock('scripts/settings/userSettings', () => ({
    currentSettings: {
        language: () => settings.culture,
        dateTimeLocale: () => settings.culture
    }
}));

describe('translated numbers', () => {
    it('reuses number formatting and clears it on culture change', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const formatter = vi.spyOn(Intl, 'NumberFormat');
        expect(translate('{0}', 1234.5)).toBe((1234.5).toLocaleString('en-US'));
        expect(translate('{0}', 1234.5)).toBe((1234.5).toLocaleString('en-US'));
        expect(formatter).toHaveBeenCalledTimes(1);
        settings.culture = 'fr-FR';
        updateCurrentCulture();
        expect(translate('{0}', 1234.5)).toBe((1234.5).toLocaleString('fr-FR'));
        expect(formatter).toHaveBeenCalledTimes(2);
        expect(translate('{0}', 'text')).toBe('text');
    });
});
