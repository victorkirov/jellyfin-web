import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import initializeLogin from './index';
import loading from 'components/loading/loading';

const { api, autoFocus } = vi.hoisted(() => ({
    api: { getPublicUsers: vi.fn(), getQuickConnect: vi.fn(), getJSON: vi.fn(), getUrl: (url: string) => url },
    autoFocus: vi.fn()
}));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getOrCreateApiClient: () => api } }));
vi.mock('components/apphost', () => ({ appHost: { supports: () => false } }));
vi.mock('scripts/settings/appSettings', () => ({ default: { enableAutoLogin: () => true } }));
vi.mock('components/loading/loading', () => ({ default: { show: vi.fn(), hide: vi.fn() } }));
vi.mock('lib/layoutManager', () => ({ default: { tv: true } }));
vi.mock('scripts/libraryMenu', () => ({ default: { setTransparentMenu: vi.fn() } }));
vi.mock('scripts/browser', () => ({ default: {} }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('elements/emby-checkbox/emby-checkbox', () => ({}));
vi.mock('components/dashboard', () => ({ default: {} }));
vi.mock('components/toast/toast', () => ({ default: vi.fn() }));
vi.mock('components/dialogHelper/dialogHelper', () => ({ default: {} }));
vi.mock('components/alert', () => ({ default: vi.fn() }));
vi.mock('components/cardbuilder/utils/builder', () => ({ getDefaultBackgroundClass: () => 'default' }));
vi.mock('components/autoFocuser', () => ({ default: { autoFocus } }));
vi.mock('utils/markdown', () => ({ renderMarkdown: (text: string) => text }));
let view: HTMLElement;

beforeEach(() => {
    document.body.innerHTML = readFileSync('src/apps/legacy/controllers/session/login/index.html', 'utf8');
    view = document.querySelector<HTMLElement>('#loginPage')!;
    api.getPublicUsers.mockResolvedValue([]);
    api.getQuickConnect.mockResolvedValue(false);
    api.getJSON.mockResolvedValue({ LoginDisclaimer: 'Optional branding' });
    initializeLogin(view, { serverid: 'server' });
});
afterEach(() => {
    view.dispatchEvent(new Event('viewdestroy'));
    document.body.innerHTML = '';
    vi.clearAllMocks();
});

it('settles an empty user list into the usable manual form', async () => {
    view.dispatchEvent(new Event('viewshow'));
    await vi.waitFor(() => expect(loading.hide).toHaveBeenCalledOnce());
    expect(view.querySelector('.manualLoginForm')?.classList.contains('hide')).toBe(false);
    expect(document.activeElement).toBe(view.querySelector('#txtManualName'));
    expect(view.querySelector('.loginDisclaimer')?.textContent).toBe('Optional branding');
});

it('renders public users and permits switching to manual login without submitting', async () => {
    api.getPublicUsers.mockResolvedValue([{ Id: 'public', Name: 'Public user', HasPassword: true }]);
    view.dispatchEvent(new Event('viewshow'));
    await vi.waitFor(() => expect(loading.hide).toHaveBeenCalledOnce());
    expect(view.querySelectorAll('#divUsers .card')).toHaveLength(1);
    view.querySelector<HTMLButtonElement>('.btnManual')!.click();
    expect(view.querySelector('.manualLoginForm')?.classList.contains('hide')).toBe(false);
    expect(document.activeElement).toBe(view.querySelector('#txtManualName'));
});

it('settles discovery and optional branding failures with manual login usable', async () => {
    api.getPublicUsers.mockRejectedValue(new Error('discovery unavailable'));
    api.getJSON.mockRejectedValue(new Error('branding unavailable'));
    api.getQuickConnect.mockRejectedValue(new Error('quick connect unavailable'));
    view.dispatchEvent(new Event('viewshow'));
    await vi.waitFor(() => expect(loading.hide).toHaveBeenCalledOnce());
    expect(view.querySelector('.manualLoginForm')?.classList.contains('hide')).toBe(false);
    expect(document.activeElement).toBe(view.querySelector('#txtManualName'));
    expect(view.querySelector('.btnCancel')?.classList.contains('hide')).toBe(true);
    expect(view.querySelector('.btnQuick')?.classList.contains('hide')).toBe(true);
});

it.each(['viewbeforehide', 'viewhide', 'viewdestroy'])('discards late discovery, branding and quick connect after %s', async event => {
    let users!: (value: unknown[]) => void;
    let branding!: (value: unknown) => void;
    let quick!: (value: boolean) => void;
    api.getPublicUsers.mockReturnValue(new Promise(resolve => {
        users = resolve;
    }));
    api.getJSON.mockReturnValue(new Promise(resolve => {
        branding = resolve;
    }));
    api.getQuickConnect.mockReturnValue(new Promise(resolve => {
        quick = resolve;
    }));
    view.dispatchEvent(new Event('viewshow'));
    view.dispatchEvent(new Event(event));
    const markup = view.innerHTML;
    const focus = document.activeElement;
    users([{ Id: 'late', Name: 'Late user' }]);
    branding({ LoginDisclaimer: 'Late branding' });
    quick(true);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(view.innerHTML).toBe(markup);
    expect(document.activeElement).toBe(focus);
    expect(autoFocus).not.toHaveBeenCalled();
    expect(loading.hide).toHaveBeenCalledOnce();
});

it('ignores an older show after hide and reshow, including rejection cleanup', async () => {
    let reject!: (error: Error) => void;
    api.getPublicUsers.mockReturnValueOnce(new Promise((_resolve, fail) => {
        reject = fail;
    }));
    view.dispatchEvent(new Event('viewshow'));
    view.dispatchEvent(new Event('viewbeforehide'));
    api.getPublicUsers.mockResolvedValue([{ Id: 'current', Name: 'Current user' }]);
    view.dispatchEvent(new Event('viewshow'));
    await vi.waitFor(() => expect(view.querySelector('#divUsers')?.textContent).toContain('Current user'));
    const hides = vi.mocked(loading.hide).mock.calls.length;
    reject(new Error('obsolete'));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(view.querySelector('.visualLoginForm')?.classList.contains('hide')).toBe(false);
    expect(loading.hide).toHaveBeenCalledTimes(hides);
});

it('treats branding failure as optional while public users remain usable', async () => {
    api.getJSON.mockRejectedValue(new Error('branding unavailable'));
    api.getPublicUsers.mockResolvedValue([{ Id: 'public', Name: 'Public user' }]);
    view.dispatchEvent(new Event('viewshow'));
    await vi.waitFor(() => expect(loading.hide).toHaveBeenCalledOnce());
    expect(view.querySelector('#divUsers')?.textContent).toContain('Public user');
    expect(view.querySelector('.visualLoginForm')?.classList.contains('hide')).toBe(false);
});
