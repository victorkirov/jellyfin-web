import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSavedVolume } from './htmlMediaHelper';

const settings = vi.hoisted(() => ({ get: vi.fn<() => string | number | null>() }));
vi.mock('../scripts/settings/appSettings', () => ({ default: settings }));
afterEach(() => vi.resetAllMocks());

describe('saved HTML media volume', () => {
    it.each([null, '', '0.5', '0', '1'])('preserves the legacy media-setter result for %s', (stored) => {
        settings.get.mockReturnValue(stored);
        const legacyElement = document.createElement('audio');
        // The original JS passed the raw storage string to the coercing DOM setter.
        Reflect.set(legacyElement, 'volume', stored || 1);
        expect(getSavedVolume()).toBe(legacyElement.volume);
        const element = document.createElement('video');
        element.volume = getSavedVolume();
        expect(element.volume).toBe(legacyElement.volume);
    });

    it('keeps the legacy fallback for a numeric zero storage value', () => {
        settings.get.mockReturnValue(0);
        expect(getSavedVolume()).toBe(1);
    });
});
