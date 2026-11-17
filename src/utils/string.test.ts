import { describe, expect, it } from 'vitest';

import { toBoolean } from './string';

describe('toBoolean', () => {
    it('Should return the boolean represented by the string', () => {
        let bool = toBoolean('true');
        expect(bool).toBe(true);

        bool = toBoolean('false', true);
        expect(bool).toBe(false);
    });

    it('Should return default value for invalid values', () => {
        let bool = toBoolean('test');
        expect(bool).toBe(false);

        bool = toBoolean(undefined);
        expect(bool).toBe(false);

        bool = toBoolean(null, true);
        expect(bool).toBe(true);
    });
});
