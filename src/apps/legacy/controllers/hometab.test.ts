import { beforeEach, expect, it, vi } from 'vitest';
import HomeTab from './hometab';

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(), loadSections: vi.fn(), resume: vi.fn(), pause: vi.fn(),
    destroySections: vi.fn(), autoFocus: vi.fn()
}));
vi.mock('scripts/settings/userSettings', () => ({}));
vi.mock('components/itemscontainer/emby-itemscontainer', () => ({}));
vi.mock('lib/focusManager', () => ({ default: { autoFocus: mocks.autoFocus } }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { currentApiClient: () => ({ getCurrentUser: mocks.getCurrentUser }) } }));
vi.mock('components/homesections/homesections', () => ({ default: mocks }));

beforeEach(() => {
    vi.resetAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ Id: 'user' });
    mocks.loadSections.mockResolvedValue(undefined);
    mocks.resume.mockResolvedValue(undefined);
});

function setup() {
    const view = document.createElement('main');
    view.innerHTML = '<div class="sections"></div>';
    return { view, tab: new HomeTab(view, {}) };
}

it('initializes once and resumes existing sections with the caller options', async () => {
    const { tab, view } = setup();
    await tab.onResume({ autoFocus: true });
    expect(mocks.loadSections).toHaveBeenCalledTimes(1);
    expect(mocks.resume).toHaveBeenCalledWith(view.querySelector('.sections'), { autoFocus: true, refresh: true });
    expect(mocks.autoFocus).toHaveBeenCalledWith(view);
    tab.onPause();
    expect(mocks.pause).toHaveBeenCalledWith(view.querySelector('.sections'));
    const options = { refresh: true };
    await tab.onResume(options);
    expect(mocks.resume).toHaveBeenCalledWith(view.querySelector('.sections'), options);
    expect(mocks.getCurrentUser).toHaveBeenCalledTimes(1);
    tab.destroy();
    expect(mocks.destroySections).toHaveBeenCalledTimes(2);
});

it.each(['user', 'sections'])('retries failed %s initialization on the next resume', async stage => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = stage === 'user' ? mocks.getCurrentUser : mocks.loadSections;
    failing.mockRejectedValueOnce(new Error('offline'));
    const { tab } = setup();
    await tab.onResume({});
    expect(mocks.resume).not.toHaveBeenCalled();
    await tab.onResume({});
    expect(mocks.getCurrentUser).toHaveBeenCalledTimes(2);
    expect(mocks.loadSections).toHaveBeenCalledTimes(stage === 'user' ? 1 : 2);
    expect(mocks.resume).toHaveBeenCalledTimes(1);
});

it.each(['pause', 'destroy'])('ignores a pending user lookup after %s', async action => {
    let finish!: (user: { Id: string }) => void;
    mocks.getCurrentUser.mockReturnValueOnce(new Promise(resolve => {
        finish = resolve;
    }));
    const { tab } = setup();
    const pending = tab.onResume({ autoFocus: true });
    if (action === 'pause') tab.onPause();
    else tab.destroy();
    finish({ Id: 'old-user' });
    await pending;
    expect(mocks.loadSections).not.toHaveBeenCalled();
    expect(mocks.autoFocus).not.toHaveBeenCalled();
    if (action === 'pause') {
        await tab.onResume({});
        expect(mocks.loadSections).toHaveBeenCalledTimes(1);
    }
});

it('shares a pending initialization between simultaneous resumes', async () => {
    const { tab } = setup();
    const first = tab.onResume({});
    const second = tab.onResume({});
    await Promise.all([first, second]);
    expect(mocks.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(mocks.resume).toHaveBeenCalledTimes(1);
});
