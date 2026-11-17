import { Api } from '@jellyfin/sdk';
import type { EndPointInfo } from '@jellyfin/sdk/lib/generated-client/models/end-point-info';
import { getSystemApi } from '@jellyfin/sdk/lib/utils/api/system-api';

import { getMaxBandwidth } from './getMaxBandwidth';

/** Maximum bitrate (Int32) */
const MAX_BITRATE = 2147483647;
/** Approximate LAN bitrate */
const LAN_BITRATE = 140000000;
/** Bitrate test timeout in milliseconds */
const BITRATETEST_TIMEOUT = 5000;
/** Bitrate cache time in milliseconds */
const BITRATE_CACHE_DURATION = 3600000;

type BitrateCache = {
    bitrate?: number;
    detectedAt?: number;
    pending?: Promise<number>;
};
const endpointBitrates = new Map<string, BitrateCache>();

interface BitrateTest {
    bytes: number;
    threshold: number;
}

/**
 * Perform a download speed test
 * @param {Api} api The Api client
 * @param {number} bytes The bytes to download
 * @returns {number} Download speed in bits per second
 */
const getDownloadSpeed = (api: Api, bytes: number) => {
    return new Promise<number>((resolve, reject) => {
        const url = api.basePath + '/Playback/BitrateTest?' + new URLSearchParams({
            Size: bytes.toString()
        });

        const xhr = new XMLHttpRequest;

        xhr.open('GET', url, true);

        xhr.responseType = 'blob';
        xhr.timeout = BITRATETEST_TIMEOUT;

        const headers = {
            'Cache-Control': 'no-cache, no-store',
            'Authorization': api.authorizationHeader
        };

        for (const key in headers) {
            xhr.setRequestHeader(key, headers[key as keyof typeof headers]);
        }

        let startTime: number;

        xhr.onreadystatechange = () => {
            if (xhr.readyState == XMLHttpRequest.HEADERS_RECEIVED) {
                startTime = performance.now();
            }
        };

        xhr.onload = () => {
            if (xhr.status < 400) {
                const responseTimeSeconds = (performance.now() - startTime) * 1e-3;
                const bytesLoaded = xhr.response.size;
                const bytesPerSecond = bytesLoaded / responseTimeSeconds;
                const bitrate = Math.round(bytesPerSecond * 8);

                console.debug(`[bitratetest] ${bytesLoaded} bytes loaded (${bytes} requested) in ${responseTimeSeconds} seconds -> ${bitrate} bps`);

                resolve(bitrate);
            } else {
                reject(new Error(`[bitratetest] failed with ${xhr.status} status`));
            }
        };

        xhr.onabort = () => {
            reject(new Error('[bitratetest] abort'));
        };

        xhr.onerror = () => {
            reject(new Error('[bitratetest] error'));
        };

        xhr.ontimeout = () => {
            reject(new Error('[bitratetest] timeout'));
        };

        xhr.send(null);
    });
};

/**
 * Normalizes the bitrate value by reducing it by 30% (to account for network overhead)
 * and limits the value by MAX_BITRATE
 * @param bitrate The bitrate to normalize
 * @returns {number} Normalized bitrate
 */
const normalizeReturnBitrate = (bitrate: number, cache: BitrateCache) => {
    if (!bitrate) {
        if (cache.bitrate) {
            return cache.bitrate;
        }
    }

    let result = Math.min(Math.round(bitrate * 0.7), MAX_BITRATE);

    const maxRate = getMaxBandwidth();
    if (maxRate) {
        result = Math.min(result, maxRate);
    }

    cache.bitrate = result;
    cache.detectedAt = Date.now();

    return result;
};

/**
 *
 * @param {Api} api The Api client
 * @param {BitrateTest[]} tests The tests to perform
 * @param {number} index Current test index
 * @param {number | undefined} currentBitrate Current bitrate
 * @returns {number} Normalized bitrate
 */
const detectBitrateInternal = (api: Api, tests: BitrateTest[], index: number, currentBitrate: number | undefined, cache: BitrateCache): Promise<number> => {
    if (index >= tests.length) {
        return Promise.resolve(normalizeReturnBitrate(currentBitrate || 0, cache));
    }

    const test = tests[index];

    return getDownloadSpeed(api, test.bytes).then(
        // eslint-disable-next-line sonarjs/function-return-type
        (bitrate) => {
            if (bitrate < test.threshold) {
                return normalizeReturnBitrate(bitrate, cache);
            } else {
                return detectBitrateInternal(api, tests, index + 1, bitrate, cache);
            }
        },
        () => normalizeReturnBitrate(currentBitrate || 0, cache)
    );
};

/**
 * Detects the bitrate using a series of tests
 * @param {Api} api The api client
 * @param {EndPointInfo} endpointInfo Endpoint info for special handling on local networks
 * @returns {number} Normalized bitrate
 */
const detectBitrateWithEndpointInfo = (api: Api, endpointInfo: EndPointInfo, cache: BitrateCache) => {
    // On the local network the detected bitrate is raised to at least LAN_BITRATE anyway,
    // so skip downloading the test files
    if (endpointInfo.IsInNetwork) {
        cache.bitrate = LAN_BITRATE;
        cache.detectedAt = Date.now();
        return Promise.resolve(LAN_BITRATE);
    }

    return detectBitrateInternal(
        api,
        [
            {
                bytes: 500000,
                threshold: 500000
            },
            {
                bytes: 1000000,
                threshold: 20000000
            },
            {
                bytes: 3000000,
                threshold: 50000000
            }
        ],
        0,
        undefined,
        cache
    ).then(result => {
        const bitrateInMbps = (result / 1048576).toFixed(2);
        console.debug(`[bitratetest] bitrate detected as ${bitrateInMbps} Mbps`);
        return result;
    });
};

/**
 * Detects the bitrate on the current device
 * @param {Api} api The Api client
 * @param {boolean} force Ignore the cached bitrate and force a re-detection
 * @returns {number} The detected bitrate
 */
export const detectBitrate = (api: Api, force = false): Promise<number> => {
    let cache = endpointBitrates.get(api.basePath);
    if (!cache) {
        cache = {};
        endpointBitrates.set(api.basePath, cache);
    }
    const endpointCache = cache;
    if (!force && endpointCache.bitrate
        && Date.now() - (endpointCache.detectedAt || 0) <= BITRATE_CACHE_DURATION) {
        return Promise.resolve(endpointCache.bitrate);
    }

    if (endpointCache.pending) return endpointCache.pending;

    endpointCache.pending = getSystemApi(api)
        .getEndpointInfo()
        .then(
            (response) => detectBitrateWithEndpointInfo(api, response.data, endpointCache),
            () => detectBitrateWithEndpointInfo(api, {}, endpointCache)
        ).finally(() => {
            endpointCache.pending = undefined;
        });

    return endpointCache.pending;
};
