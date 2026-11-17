import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSections, pause, resume } from './homesections';
import { loadLibraryButtons } from './sections/libraryButtons';
import { loadLibraryTiles } from './sections/libraryTiles';
import { loadResume } from './sections/resume';
import { deferSection } from './deferSection';

const emptyLibraries = vi.hoisted(() => ({ fetchQuery: vi.fn(), translate: vi.fn((key: string) => key) }));

vi.mock('./deferSection', () => ({ deferSection: vi.fn(() => vi.fn()) }));
vi.mock('components/layoutManager', () => ({ default: { tv: true } }));
vi.mock('hooks/api/useUserViews', () => ({ getUserViewsQuery: vi.fn() }));
vi.mock('lib/globalize', () => ({ default: { translate: emptyLibraries.translate } }));
vi.mock('lib/jellyfin-apiclient/ServerConnections', () => ({ default: { getApi: () => ({}) } }));
vi.mock('utils/query/queryClient', () => ({ queryClient: { fetchQuery: emptyLibraries.fetchQuery } }));
vi.mock('./sections/activeRecordings', () => ({ loadRecordings: vi.fn() }));
vi.mock('./sections/libraryButtons', () => ({ loadLibraryButtons: vi.fn() }));
vi.mock('./sections/libraryTiles', () => ({ loadLibraryTiles: vi.fn() }));
vi.mock('./sections/liveTv', () => ({ loadLiveTV: vi.fn() }));
vi.mock('./sections/nextUp', () => ({ loadNextUp: vi.fn() }));
vi.mock('./sections/recentlyAdded', () => ({ loadRecentlyAdded: vi.fn() }));
vi.mock('./sections/resume', () => ({ loadResume: vi.fn() }));
vi.mock('elements/emby-button/paper-icon-button-light', () => ({}));
vi.mock('elements/emby-itemscontainer/emby-itemscontainer', () => ({}));
vi.mock('elements/emby-scroller/emby-scroller', () => ({}));
vi.mock('elements/emby-button/emby-button', () => ({}));

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(deferSection).mockReturnValue(vi.fn());
});

afterEach(() => {
    document.body.innerHTML = '';
});

function setup() {
    const root = document.createElement('main');
    document.body.appendChild(root);
    const rows = Array.from({ length: 5 }, () => {
        const parentContainer = document.createElement('section');
        parentContainer.className = 'hide';
        const row = Object.assign(document.createElement('div'), {
            needsRefresh: false,
            parentContainer,
            fetchData: vi.fn(),
            pause: vi.fn(),
            resume: vi.fn<(options?: { refresh?: boolean }) => Promise<void>>()
        });
        row.resume.mockImplementation(options => {
            if (row.needsRefresh || options?.refresh) row.fetchData();
            row.needsRefresh = false;
            return Promise.resolve();
        });
        row.className = 'itemsContainer';
        parentContainer.appendChild(row);
        root.appendChild(parentContainer);
        return row;
    });
    return { root, rows };
}

describe('TV home row resume', () => {
    it('keeps empty rows hidden and preserves the focused row on restoration', async () => {
        const { root, rows } = setup();
        rows[4].parentContainer.classList.remove('hide');
        rows[4].innerHTML = '<button>Latest movie</button>';
        const card = rows[4].querySelector('button')!;
        card.focus();
        await resume(root, {});
        expect(deferSection).not.toHaveBeenCalled();
        expect(rows.every(row => row.fetchData.mock.calls.length === 0)).toBe(true);
        expect(rows[2].parentContainer.classList.contains('hide')).toBe(true);
        expect(rows[3].parentContainer.classList.contains('hide')).toBe(true);
        expect(document.activeElement).toBe(card);
    });

    it('retains a deferred refresh across pause and passes resume options through', async () => {
        const { root, rows } = setup();
        await resume(root, { refresh: true });
        expect(rows[0].fetchData).toHaveBeenCalledTimes(1);
        expect(rows[1].fetchData).toHaveBeenCalledTimes(1);
        expect(rows[2].needsRefresh).toBe(true);
        expect(rows[2].fetchData).not.toHaveBeenCalled();
        pause(root);
        vi.mocked(deferSection).mockClear();
        const options = {};
        await resume(root, options);
        expect(deferSection).toHaveBeenCalledTimes(3);
        const load = vi.mocked(deferSection).mock.calls[0][1];
        await load();
        expect(rows[2].resume).toHaveBeenCalledWith(options);
        expect(rows[2].fetchData).toHaveBeenCalledTimes(1);
    });
});

describe('Empty libraries', () => {
    it.each([true, false])('shows setup guidance without an admin link (administrator: %s)', async isAdministrator => {
        emptyLibraries.fetchQuery.mockResolvedValue({ Items: [] });
        const container = document.createElement('div');
        await loadSections(container, { serverId: () => 'server' }, {
            Id: 'user', Policy: { IsAdministrator: isAdministrator }
        }, {});
        expect(container.textContent).toContain('AskAdminToCreateLibrary');
        expect(container.querySelector('a, button, #button-createLibrary')).toBeNull();
    });
});

describe('TV home section preferences', () => {
    async function load(saved: string[] = []) {
        emptyLibraries.fetchQuery.mockResolvedValue({ Items: [{ Id: 'movies' }] });
        const container = document.createElement('main');
        document.body.appendChild(container);
        const settings = { get: vi.fn((key: string) => saved[Number(key.replace('homesection', ''))]) };
        await loadSections(container, { serverId: () => 'server' }, { Id: 'user' }, settings);
        return { container, settings };
    }

    it('defaults to Continue Watching followed by compact library buttons', async () => {
        const { container, settings } = await load();
        expect(vi.mocked(loadResume).mock.calls[0][0]).toBe(container.querySelector('.section0'));
        expect(vi.mocked(loadResume).mock.calls[0][2]).toBe('HeaderContinueWatching');
        expect(loadLibraryButtons).toHaveBeenCalledWith(container.querySelector('.section1'), [{ Id: 'movies' }]);
        expect(loadLibraryTiles).not.toHaveBeenCalled();
        expect(Object.keys(settings)).toEqual(['get']);
    });

    it('preserves saved section positions and the legacy folders library section', async () => {
        const saved = ['latestmedia', 'smalllibrarytiles', 'none', 'resume', 'none', 'none', 'none', 'none', 'none', 'none'];
        const { container } = await load(saved);
        expect(loadLibraryTiles).toHaveBeenCalledWith(container.querySelector('.section1'), [{ Id: 'movies' }], { enableOverflow: true });
        expect(vi.mocked(loadResume).mock.calls[0][0]).toBe(container.querySelector('.section3'));
        expect(loadLibraryButtons).not.toHaveBeenCalled();
        vi.mocked(loadLibraryTiles).mockClear();
        const legacy = await load(['folders', ...Array<string>(9).fill('none')]);
        expect(vi.mocked(loadLibraryTiles).mock.calls[0][0]).toBe(legacy.container.querySelector('.section0'));
    });

    it('keeps libraries reachable when the first resume row is empty', async () => {
        vi.mocked(loadResume).mockImplementation(element => {
            element.classList.add('hide');
        });
        vi.mocked(loadLibraryButtons).mockImplementation(element => {
            element.innerHTML = '<button>Movies</button>';
        });
        const { container } = await load();
        const library = container.querySelector<HTMLButtonElement>('.section1 button')!;
        library.focus();
        await resume(container, {});
        expect(container.querySelector('.section0')?.classList.contains('hide')).toBe(true);
        expect(library.closest('.hide')).toBeNull();
        expect(document.activeElement).toBe(library);
    });
});
