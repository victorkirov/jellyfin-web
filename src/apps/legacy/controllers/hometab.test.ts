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
