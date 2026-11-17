import { describe, expect, it } from 'vitest';
import { getHttpStatus } from './httpStatus';

describe('getHttpStatus', () => {
    it.each([401, 404, 500])('reads HTTP %s from SDK, fetch and legacy errors', status => {
        expect(getHttpStatus({ response: { status } })).toBe(status);
        expect(getHttpStatus(new Response(null, { status }))).toBe(status);
        expect(getHttpStatus({ statusCode: status })).toBe(status);
    });
    it.each([undefined, null, new TypeError('network'), new DOMException('cancelled', 'AbortError'), { status: '401' }])('leaves non-HTTP errors unclassified: %s', error => {
        expect(getHttpStatus(error)).toBeUndefined();
    });
});
