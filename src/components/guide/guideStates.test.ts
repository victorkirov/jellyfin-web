import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Guide from './guide';

const { apiClient, focus, loading } = vi.hoisted(() => ({
    apiClient: {
        getCurrentUserId: () => 'user', subscribe: vi.fn(),
        getLiveTvGuideInfo: vi.fn(), getLiveTvChannels: vi.fn(), getLiveTvPrograms: vi.fn()
    },
    focus: vi.fn((element: HTMLElement) => element.querySelector<HTMLElement>('button, a')?.focus()),
    loading: { show: vi.fn(), hide: vi.fn() }
}));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApiClient: () => apiClient } }));
vi.mock('scripts/inputManager', () => ({ default: { on: vi.fn(), off: vi.fn() } }));
vi.mock('scripts/browser', () => ({ default: {} }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key, translateHtml: (html: string) => html } }));
vi.mock('utils/events', () => ({ default: { trigger: vi.fn() } }));
vi.mock('scripts/scrollHelper', () => ({ default: {} }));
vi.mock('components/loading/loading', () => ({ default: loading }));
vi.mock('scripts/datetime', () => ({ default: {
    parseISO8601Date: (value: string) => new Date(value),
    toLocaleDateString: () => 'Today', getDisplayTime: () => '12:00'
} }));
vi.mock('lib/focusManager', () => ({ default: { focus: vi.fn(), autoFocus: focus } }));
vi.mock('components/playback/playbackmanager', () => ({ playbackManager: {} }));
vi.mock('scripts/settings/userSettings', () => ({ get: vi.fn() }));
vi.mock('components/images/imageLoader', () => ({ default: { lazyChildren: vi.fn() } }));
vi.mock('lib/layoutManager', () => ({ default: { tv: true } }));
vi.mock('components/shortcuts', () => ({ default: { on: vi.fn(), off: vi.fn() } }));
vi.mock('utils/dom', () => ({ default: {
    getWindowSize: () => ({ innerWidth: 1920 }),
    addEventListener: (element: HTMLElement, event: string, callback: EventListener) => element.addEventListener(event, callback),
    removeEventListener: (element: HTMLElement, event: string, callback: EventListener) => element.removeEventListener(event, callback),
    parentWithClass: () => null
} }));
vi.mock('elements/emby-programcell/emby-programcell', () => ({}));
vi.mock('components/buttons/emby-button', () => ({}));
vi.mock('elements/emby-button/paper-icon-button-light', () => ({}));
vi.mock('elements/emby-tabs/emby-tabs', () => ({}));
vi.mock('elements/emby-scroller/emby-scroller', () => ({}));
vi.mock('webcomponents.js/webcomponents-lite', () => ({}));
vi.mock('./tvguide.template.html', async () => ({ default: (await import('node:fs')).readFileSync('src/components/guide/tvguide.template.html', 'utf8') }));

const guides: InstanceType<typeof Guide>[] = [];
function createGuide() {
    const page = document.createElement('div');
    document.body.append(page);
    // Only the custom element refresh method is needed by the guide's date setup.
    Object.defineProperty(HTMLElement.prototype, 'refresh', { configurable: true, value: vi.fn() });
    const guide = new Guide({ element: page, serverId: 'server' });
    guides.push(guide);
    return { page, guide };
}

beforeEach(() => {
    const date = new Date().toISOString();
    apiClient.getLiveTvGuideInfo.mockResolvedValue({ StartDate: date, EndDate: date });
    apiClient.getLiveTvChannels.mockResolvedValue({ Items: [], TotalRecordCount: 0 });
    apiClient.getLiveTvPrograms.mockResolvedValue({ Items: [] });
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => callback());
});
afterEach(() => {
    guides.splice(0).forEach(guide => {
        guide.destroy();
    });
    document.body.innerHTML = '';
    delete (HTMLElement.prototype as HTMLElement & { refresh?: unknown }).refresh;
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('Guide request states', () => {
    it('ignores an older guide-info result after a newer refresh', async () => {
        let resolveFirst!: (value: object) => void;
        apiClient.getLiveTvGuideInfo.mockReturnValueOnce(new Promise(resolve => {
            resolveFirst = resolve;
        }));
        const { page, guide } = createGuide();
        guide.refresh();
        await vi.waitFor(() => expect(page.textContent).toContain('LiveTvNoChannels'));
        const calls = apiClient.getLiveTvChannels.mock.calls.length;
        resolveFirst({});
        await vi.waitFor(() => expect(loading.hide).toHaveBeenCalled());
        await Promise.resolve();
        expect(apiClient.getLiveTvChannels).toHaveBeenCalledTimes(calls);
    });

    it.each(['pause', 'destroy'] as const)('invalidates nested channel requests on %s', async action => {
        let resolveChannels!: (value: object) => void;
        apiClient.getLiveTvChannels.mockReturnValueOnce(new Promise(resolve => {
            resolveChannels = resolve;
        }));
        const { page, guide } = createGuide();
        await vi.waitFor(() => expect(apiClient.getLiveTvChannels).toHaveBeenCalled());
        guide[action]();
        if (action === 'pause') guide.resume(false);
        resolveChannels({ Items: [{ Id: 'old', Name: 'Stale', ImageTags: {} }], TotalRecordCount: 1 });
        await Promise.resolve();
        await Promise.resolve();
        expect(apiClient.getLiveTvPrograms).not.toHaveBeenCalled();
        expect(page.textContent).not.toContain('Stale');
        expect(loading.hide).toHaveBeenCalled();
    });

    it('preserves the newer program grid when nested requests finish in reverse order', async () => {
        let resolveOld!: (value: object) => void;
        apiClient.getLiveTvChannels.mockResolvedValue({ Items: [{ Id: 'channel', Name: 'News', ImageTags: {} }], TotalRecordCount: 1 });
        apiClient.getLiveTvPrograms.mockReturnValueOnce(new Promise(resolve => {
            resolveOld = resolve;
        }));
        const { page, guide } = createGuide();
        await vi.waitFor(() => expect(apiClient.getLiveTvPrograms).toHaveBeenCalledTimes(1));
        guide.refresh();
        await vi.waitFor(() => expect(page.textContent).toContain('LiveTvNoPrograms'));
        const channel = page.querySelector<HTMLElement>('.guide-channelHeaderCell')!;
        channel.focus();
        const active = document.activeElement;
        const html = page.innerHTML;
        focus.mockClear();
        loading.hide.mockClear();
        resolveOld({ Items: [{ Id: 'old' }] });
        await Promise.resolve();
        await Promise.resolve();
        expect(page.innerHTML).toBe(html);
        expect(document.activeElement).toBe(active);
        expect(focus).not.toHaveBeenCalled();
        expect(loading.hide).not.toHaveBeenCalled();
    });

    it('releases loading on pause and removes its refresh timer on destroy', async () => {
        vi.useFakeTimers();
        apiClient.getLiveTvGuideInfo.mockReturnValueOnce(new Promise(() => undefined));
        const { guide } = createGuide();
        expect(vi.getTimerCount()).toBe(1);
        guide.pause();
        expect(loading.hide).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
        guide.resume(false);
        expect(vi.getTimerCount()).toBe(1);
        guide.destroy();
        expect(vi.getTimerCount()).toBe(0);
        guide.resume(true);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('shows no channels after success and avoids an unscoped programs request', async () => {
        const { page } = createGuide();
        await vi.waitFor(() => expect(page.textContent).toContain('LiveTvNoChannels'));
        expect(apiClient.getLiveTvPrograms).not.toHaveBeenCalled();
        expect(page.querySelector('.guideVerticalScroller')?.classList.contains('hide')).toBe(true);
        expect(page.querySelector('.liveTvStatus a')?.getAttribute('href')).toBe('#/livetv?tab=2');
    });

    it('explains filtered channel emptiness without claiming configuration is missing', async () => {
        const { page, guide } = createGuide();
        guide.categoryOptions.categories = ['sports'];
        await vi.waitFor(() => expect(page.textContent).toContain('LiveTvNoMatchingChannels'));
        expect(apiClient.getLiveTvChannels.mock.calls[0][0].IsSports).toBe(true);
        expect(page.querySelector('.btnGuideViewSettings')?.closest('.hide')).toBeNull();
    });

    it('keeps channels usable and explains a day without guide data', async () => {
        apiClient.getLiveTvGuideInfo.mockResolvedValue({});
        apiClient.getLiveTvChannels.mockResolvedValue({ Items: [{ Id: 'channel', Name: 'News', ImageTags: {} }], TotalRecordCount: 1 });
        const { page } = createGuide();
        await vi.waitFor(() => expect(page.textContent).toContain('LiveTvNoPrograms'));
        expect(page.querySelector('.guide-channelHeaderCell')?.textContent).toContain('News');
        expect(page.querySelector('.guideVerticalScroller')?.classList.contains('hide')).toBe(false);
        expect(apiClient.getLiveTvPrograms.mock.calls[0][0].channelIds).toBe('channel');
    });

    it('renders populated guide data without an empty status', async () => {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start.getTime() + 86400000);
        apiClient.getLiveTvChannels.mockResolvedValue({ Items: [{ Id: 'channel', Name: 'News', ImageTags: {} }], TotalRecordCount: 1 });
        apiClient.getLiveTvPrograms.mockResolvedValue({ Items: [{ Id: 'program', ChannelId: 'channel', Name: 'Bulletin', StartDate: start.toISOString(), EndDate: end.toISOString() }] });
        const { page } = createGuide();
        await vi.waitFor(() => expect(page.querySelector('.programCell')?.textContent).toContain('Bulletin'));
        expect(page.querySelector('.liveTvStatus')).toBeNull();
    });

    it('handles guide-info failure with a focused retry action', async () => {
        apiClient.getLiveTvGuideInfo.mockRejectedValueOnce(new Error('offline'));
        const { page } = createGuide();
        await vi.waitFor(() => expect(page.textContent).toContain('LiveTvLoadError'));
        expect(document.activeElement).toBe(page.querySelector('.liveTvStatus button'));
        expect(loading.hide).toHaveBeenCalled();
        page.querySelector<HTMLButtonElement>('.liveTvStatus button')!.click();
        await vi.waitFor(() => expect(page.textContent).toContain('LiveTvNoChannels'));
    });

    it('handles a failed programs request separately from no guide data', async () => {
        apiClient.getLiveTvChannels.mockResolvedValue({ Items: [{ Id: 'channel', Name: 'News', ImageTags: {} }], TotalRecordCount: 1 });
        apiClient.getLiveTvPrograms.mockRejectedValueOnce(new Error('offline'));
        const { page } = createGuide();
        await vi.waitFor(() => expect(page.textContent).toContain('LiveTvLoadError'));
        expect(page.textContent).not.toContain('LiveTvNoPrograms');
        apiClient.getLiveTvChannels.mockResolvedValue({ Items: [{ Id: 'channel', Name: 'News', ImageTags: {} }], TotalRecordCount: 600 });
        page.querySelector<HTMLButtonElement>('.liveTvStatus button')!.click();
        await vi.waitFor(() => expect(page.textContent).toContain('LiveTvNoPrograms'));
        expect(page.querySelector('.guideOptions')?.classList.contains('hide')).toBe(false);
        expect(page.querySelector('.timeslotHeaders')?.classList.contains('hide')).toBe(false);
        expect(page.querySelector('.guideVerticalScroller')?.classList.contains('hide')).toBe(false);
    });
    it.each(['getLiveTvGuideInfo', 'getLiveTvChannels', 'getLiveTvPrograms'] as const)(
        'keeps the rendered guide and focus when background %s fails', async request => {
            vi.useFakeTimers();
            const start = new Date();
            start.setHours(0, 0, 0, 0);
            const end = new Date(start.getTime() + 86400000);
            apiClient.getLiveTvChannels.mockResolvedValue({ Items: [{ Id: 'channel', Name: 'News', ImageTags: {} }], TotalRecordCount: 1 });
            apiClient.getLiveTvPrograms.mockResolvedValue({ Items: [{ Id: 'program', ChannelId: 'channel', Name: 'Bulletin', StartDate: start.toISOString(), EndDate: end.toISOString() }] });
            const { page, guide } = createGuide();
            await vi.waitFor(() => expect(page.querySelector('.programCell')?.textContent).toContain('Bulletin'));
            const card = page.querySelector<HTMLElement>('.programCell')!;
            card.focus();
            expect(document.activeElement).toBe(card);
            focus.mockClear();
            const calls = apiClient[request].mock.calls.length;
            apiClient[request].mockRejectedValue(new Error('background offline'));
            await vi.advanceTimersByTimeAsync(15 * 60000);
            expect(apiClient[request]).toHaveBeenCalledTimes(calls + 1);
            expect(page.querySelector('.programCell')).toBe(card);
            expect(page.querySelector('.guideVerticalScroller')?.classList.contains('hide')).toBe(false);
            expect(page.querySelector('.timeslotHeaders')?.classList.contains('hide')).toBe(false);
            expect(page.querySelector('.liveTvStatus')).toBeNull();
            expect(document.activeElement).toBe(card);
            expect(focus).not.toHaveBeenCalled();
            expect(loading.hide).toHaveBeenCalled();

            guide.refresh();
            await vi.waitFor(() => expect(page.textContent).toContain('LiveTvLoadError'));
            expect(document.activeElement).toBe(page.querySelector('.liveTvStatus button'));
        }
    );
});
