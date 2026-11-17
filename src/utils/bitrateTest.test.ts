import type { Api } from '@jellyfin/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMaxBandwidth } from './getMaxBandwidth';

const { getEndpointInfo } = vi.hoisted(() => ({ getEndpointInfo: vi.fn() }));
vi.mock('@jellyfin/sdk/lib/utils/api/system-api', () => ({ getSystemApi: () => ({ getEndpointInfo }) }));
const api = (basePath: string) => ({ basePath, authorizationHeader: 'test' }) as Api;

describe('bandwidth units', () => {
    afterEach(() => vi.unstubAllGlobals());
    it.each([undefined, 0, -3, NaN, Infinity, '10'])('ignores invalid downlink %s', value => {
        vi.stubGlobal('navigator', { connection: { downlinkMax: value } });
        expect(getMaxBandwidth()).toBeNull();
    });
    it('rounds fractional decimal Mbps down to whole bits/second', () => {
        vi.stubGlobal('navigator', { connection: { downlinkMax: 1.23456789 } });
        expect(getMaxBandwidth()).toBe(864197);
    });
});

describe('endpoint bitrate detection', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.stubGlobal('navigator', {});
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('shares a pending probe and cached result for the same endpoint', async () => {
        const { detectBitrate } = await import('./bitrateTest');
        let resolve!: (value: unknown) => void;
        getEndpointInfo.mockReturnValue(new Promise(done => {
            resolve = done;
        }));
        const first = detectBitrate(api('https://A'), false);
        const second = detectBitrate(api('https://A'), false);
        expect(first).toBe(second);
        resolve({ data: { IsInNetwork: true } });
        expect(await first).toBe(140_000_000);
        expect(await detectBitrate(api('https://A'), false)).toBe(140_000_000);
        expect(getEndpointInfo).toHaveBeenCalledTimes(1);
    });

    it('keeps concurrent A and B probes and cache entries independent', async () => {
        const { detectBitrate } = await import('./bitrateTest');
        let resolveA!: (value: unknown) => void;
        getEndpointInfo.mockReturnValueOnce(new Promise(done => {
            resolveA = done;
        }))
            .mockResolvedValueOnce({ data: { IsInNetwork: true } });
        const first = detectBitrate(api('https://A'), false);
        const second = detectBitrate(api('https://B'), false);
        expect(second).not.toBe(first);
        expect(await second).toBe(140_000_000);
        resolveA({ data: { IsInNetwork: true } });
        await first;
        expect(getEndpointInfo).toHaveBeenCalledTimes(2);
    });

    it('clamps a measured bitrate using the shared whole-bit bandwidth limit', async () => {
        const { detectBitrate } = await import('./bitrateTest');
        vi.stubGlobal('navigator', { connection: { downlinkMax: 1.23456789 } });
        getEndpointInfo.mockResolvedValue({ data: {} });
        vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(1000);
        class DownloadRequest {
            readyState = 2;
            status = 200;
            response = { size: 3_000_000 };
            onreadystatechange?: () => void;
            onload?: () => void;
            open = vi.fn();
            setRequestHeader = vi.fn();
            send() {
                this.onreadystatechange?.();
                this.onload?.();
            }
        }
        Object.defineProperty(DownloadRequest, 'HEADERS_RECEIVED', { value: 2 });
        vi.stubGlobal('XMLHttpRequest', DownloadRequest);
        expect(await detectBitrate(api('https://A'), false)).toBe(getMaxBandwidth());
    });

    it('expires cached results and respects forced probes', async () => {
        const { detectBitrate } = await import('./bitrateTest');
        getEndpointInfo.mockResolvedValue({ data: { IsInNetwork: true } });
        await detectBitrate(api('https://A'), false);
        await detectBitrate(api('https://A'), true);
        vi.advanceTimersByTime(3_600_001);
        await detectBitrate(api('https://A'), false);
        expect(getEndpointInfo).toHaveBeenCalledTimes(3);
    });

    it('does not cache failed downloads or borrow another endpoint bitrate', async () => {
        const { detectBitrate } = await import('./bitrateTest');
        getEndpointInfo.mockResolvedValueOnce({ data: { IsInNetwork: true } })
            .mockRejectedValue(new Error('offline'));
        class FailedRequest {
            open = vi.fn();
            setRequestHeader = vi.fn();
            onerror?: () => void;
            send() { this.onerror?.(); }
        }
        vi.stubGlobal('XMLHttpRequest', FailedRequest);
        await detectBitrate(api('https://A'), false);
        expect(await detectBitrate(api('https://B'), false)).toBe(0);
        expect(await detectBitrate(api('https://B'), false)).toBe(0);
        expect(getEndpointInfo).toHaveBeenCalledTimes(3);
    });
});
