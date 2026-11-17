import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestSubtitleData } from './subtitleRequest';

const subtitleData = {
    TrackEvents: [{ StartPositionTicks: 12_500_000, EndPositionTicks: 27_500_000, Text: 'Subtitle' }]
};

afterEach(() => vi.unstubAllGlobals());

describe('Subtitle response acquisition', () => {
    it('balances fetch activity before JSON decoding completes', async () => {
        let finishJson: (value: typeof subtitleData) => void = () => undefined;
        const json = vi.fn(() => new Promise(resolve => { finishJson = resolve; }));
        const request = vi.fn().mockResolvedValue({ ok: true, json });
        vi.stubGlobal('fetch', request);
        const activity = { incrementFetchQueue: vi.fn(), decrementFetchQueue: vi.fn() };
        const pending = requestSubtitleData(activity, () => '/subtitles.js');
        await Promise.resolve();
        expect(request).toHaveBeenCalledExactlyOnceWith('/subtitles.js');
        expect(activity.incrementFetchQueue).toHaveBeenCalledOnce();
        expect(activity.decrementFetchQueue).toHaveBeenCalledOnce();
        finishJson(subtitleData);
        expect(await pending).toEqual(subtitleData);
    });

    it.each(['network', 'status', 'url', 'json'])('balances activity after %s failure', async (failure) => {
        const error = new Error(failure);
        vi.stubGlobal('fetch', failure === 'network'
            ? vi.fn().mockRejectedValue(error)
            : vi.fn().mockResolvedValue({
                ok: failure !== 'status',
                json: () => Promise.reject(error)
            }));
        const activity = { incrementFetchQueue: vi.fn(), decrementFetchQueue: vi.fn() };
        const pending = requestSubtitleData(activity, () => {
            if (failure === 'url') throw error;
            return '/subtitles.js';
        });
        await expect(pending).rejects.toThrow();
        expect(activity.incrementFetchQueue).toHaveBeenCalledOnce();
        expect(activity.decrementFetchQueue).toHaveBeenCalledOnce();
    });
});
