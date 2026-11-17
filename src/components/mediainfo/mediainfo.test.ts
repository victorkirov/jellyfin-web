import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fillPrimaryMediaInfo } from './mediainfo';
import datetime from '../../scripts/datetime';

vi.mock('../../scripts/datetime', () => ({
    default: { getDisplayTime: vi.fn((date: Date) => String(date.getTime())) }
}));
vi.mock('../../lib/globalize', () => ({
    default: { translate: (_key: string, value: string) => value }
}));
vi.mock('../router/appRouter', () => ({ appRouter: {} }));
vi.mock('../itemHelper', () => ({ default: {} }));
vi.mock('../indicators/indicators', () => ({ default: { getMissingIndicator: () => '' } }));
vi.mock('../buttons/emby-button', () => ({}));
vi.mock('../../scripts/settings/userSettings', () => ({}));

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.mocked(datetime.getDisplayTime).mockClear();
});

afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
});

describe('end time in cached views', () => {
    it('skips hidden work, refreshes on show, and stops after removal', () => {
        const view = document.createElement('div');
        view.className = 'mainAnimatedPage hide';
        const element = document.createElement('div');
        view.appendChild(element);
        document.body.appendChild(view);
        fillPrimaryMediaInfo(element, { MediaType: 'Video', RunTimeTicks: 600000000 }, { runtime: false });
        expect(datetime.getDisplayTime).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(60000);
        expect(datetime.getDisplayTime).toHaveBeenCalledTimes(1);
        view.classList.remove('hide');
        view.dispatchEvent(new CustomEvent('viewshow'));
        expect(element.querySelector('.endsAt')?.textContent).toBe('120000');
        expect(datetime.getDisplayTime).toHaveBeenCalledTimes(2);
        element.remove();
        vi.advanceTimersByTime(60000);
        expect(vi.getTimerCount()).toBe(0);
        view.dispatchEvent(new CustomEvent('viewshow'));
        expect(datetime.getDisplayTime).toHaveBeenCalledTimes(2);
    });

    it('stops immediately when the view is destroyed', () => {
        const view = document.createElement('div');
        view.className = 'mainAnimatedPage';
        document.body.appendChild(view);
        fillPrimaryMediaInfo(view, { MediaType: 'Video', RunTimeTicks: 600000000 }, { runtime: false });
        view.dispatchEvent(new CustomEvent('viewdestroy'));
        expect(vi.getTimerCount()).toBe(0);
    });
});
