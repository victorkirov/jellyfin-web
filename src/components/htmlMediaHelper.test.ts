import { afterEach, describe, expect, it, vi } from 'vitest';

import Events from '../utils/events';
import { getBufferedRanges, onEndedInternal, playWithPromise, seekOnPlaybackStart } from './htmlMediaHelper';

vi.mock('../scripts/settings/appSettings', () => ({ default: {} }));

afterEach(() => vi.restoreAllMocks());

describe('HTML media boundary units', () => {
    it('seeks fractional resume ticks immediately when duration is available', () => {
        const element = document.createElement('video');
        Object.defineProperty(element, 'duration', { value: 60 });
        const ready = vi.fn();
        seekOnPlaybackStart({}, element, 125_000_000, ready);
        expect(element.currentTime).toBe(12.5);
        expect(ready).toHaveBeenCalledOnce();
    });

    it('seeks deferred resume ticks once and removes readiness listeners', () => {
        const element = document.createElement('audio');
        const ready = vi.fn();
        seekOnPlaybackStart({}, element, 125_000_000, ready);
        Object.defineProperty(element, 'duration', { value: 60 });
        element.dispatchEvent(new Event('loadedmetadata'));
        expect(element.currentTime).toBe(12.5);
        element.currentTime = 0;
        element.dispatchEvent(new Event('durationchange'));
        expect(element.currentTime).toBe(0);
        expect(ready).toHaveBeenCalledOnce();
    });

    it('keeps buffered seconds plus transcoding ticks in the public tick contract', () => {
        const element = document.createElement('video');
        Object.defineProperty(element, 'buffered', { value: {
            length: 2,
            start: (index: number) => index === 0 ? 0 : 1.25,
            end: (index: number) => index === 0 ? 0.5 : 2.75
        } });
        expect(getBufferedRanges({ _currentPlayOptions: { transcodingOffsetTicks: 30_000_000 } }, element)).toEqual([
            { start: 30_000_000, end: 35_000_000 },
            { start: 42_500_000, end: 57_500_000 }
        ]);
    });

    it('reports the stopped source before clearing player state', () => {
        const instance = { _currentSrc: 'movie.mp4', _currentTime: 12.5, _currentPlayOptions: {} };
        const element = document.createElement('video');
        element.src = 'movie.mp4';
        const stopped = vi.fn();
        Events.on(instance, 'stopped', stopped);
        onEndedInternal(instance, element, vi.fn());
        expect(stopped).toHaveBeenCalledWith({ type: 'stopped' }, { src: 'movie.mp4' });
        expect(instance._currentSrc).toBeNull();
        expect(instance._currentPlayOptions).toBeNull();
        expect(element.hasAttribute('src')).toBe(false);
    });
});

describe('Media playback promise compatibility', () => {
    it.each(['NotAllowedError', 'AbortError'])('allows retry after %s and binds media errors', async (name) => {
        const element = document.createElement('video');
        vi.spyOn(element, 'play').mockRejectedValue({ name });
        const onError = vi.fn();
        await playWithPromise(element, onError);
        element.dispatchEvent(new Event('error'));
        expect(onError).toHaveBeenCalledOnce();
    });

    it('preserves decoder rejection and does not bind a successful-play listener', async () => {
        const element = document.createElement('video');
        const error = new Error('decode');
        vi.spyOn(element, 'play').mockRejectedValue(error);
        const onError = vi.fn();
        await expect(playWithPromise(element, onError)).rejects.toBe(error);
        element.dispatchEvent(new Event('error'));
        expect(onError).not.toHaveBeenCalled();
    });

    it.each(['throw', 'legacy'])('rejects a %s synchronous play failure as a promise', async (mode) => {
        const element = document.createElement('video');
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(element, 'play').mockImplementation(() => {
            if (mode === 'throw') throw new Error('sync');
            return undefined as unknown as Promise<void>;
        });
        await expect(playWithPromise(element, vi.fn())).rejects.toBeUndefined();
    });
});

describe('browser media sources', () => {
    it('applies ordinary URLs without calling Windows Storage', async () => {
        const { applySrc } = await import('./htmlMediaHelper');
        const storage = vi.fn().mockResolvedValue({});
        vi.stubGlobal('Windows', { Storage: { StorageFile: { getFileFromPathAsync: storage } } });
        try {
            const element = document.createElement('video');
            await applySrc(element, 'https://example/video.mp4');
            expect(element.src).toBe('https://example/video.mp4');
            await applySrc(element, 'https://example/local.mp4');
            expect(element.src).toBe('https://example/local.mp4');
            expect(storage).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
