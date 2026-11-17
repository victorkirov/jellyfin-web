import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventType } from 'constants/eventType';
import { currentSettings } from 'scripts/settings/userSettings';
import Events from 'utils/events';
import { getCurrentDateTimeLocale, getCurrentLocale, getIsRTL, translate, updateCurrentCulture } from './index';
import 'scripts/localizationSettings';

const settings = vi.hoisted(() => ({ culture: 'en-US', dateTimeCulture: undefined as string | undefined }));
vi.mock('scripts/settings/userSettings', () => ({
    currentSettings: {
        language: () => settings.culture,
        dateTimeLocale: () => settings.dateTimeCulture
    }
}));

describe('localization settings binding', () => {
    beforeEach(() => {
        settings.culture = 'en-US';
        settings.dateTimeCulture = undefined;
        updateCurrentCulture();
    });
    afterEach(() => vi.restoreAllMocks());
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

it('updates RTL and date formatting through the settings change subscription', () => {
    const changed = vi.fn();
    Events.on(document, EventType.LANGUAGE_CHANGE, changed);
    try {
        settings.culture = 'ar';
        settings.dateTimeCulture = 'fr-FR';
        Events.trigger(currentSettings, 'change', ['language']);
        expect(getCurrentLocale()).toBe('ar');
        expect(getCurrentDateTimeLocale()).toBe('fr-fr');
        expect(getIsRTL()).toBe(true);
        expect(document.documentElement.getAttribute('dir')).toBe('rtl');
        expect(changed).toHaveBeenCalledTimes(1);
        Events.trigger(currentSettings, 'change', ['datetimelocale']);
        expect(changed).toHaveBeenCalledTimes(1);
        settings.culture = 'en-US';
        settings.dateTimeCulture = undefined;
        updateCurrentCulture();
        expect(document.documentElement.getAttribute('dir')).toBe('ltr');
        expect(getCurrentDateTimeLocale()).toBe('en-us');
    } finally {
        Events.off(document, EventType.LANGUAGE_CHANGE, changed);
    }
});
