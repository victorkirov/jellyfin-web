import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    pageClassOn: vi.fn(), setBackdrops: vi.fn(), clearBackdrop: vi.fn(),
    setBackdropImages: vi.fn(), currentApiClient: vi.fn(), getApi: vi.fn(),
    fetchQuery: vi.fn(), getTopParentId: vi.fn()
}));
vi.mock('../components/backdrop/backdrop', () => mocks);
vi.mock('./settings/userSettings', () => ({ enableBackdrops: () => true }));
vi.mock('./libraryMenu', () => ({ default: mocks }));
vi.mock('../utils/dashboard', () => mocks);
vi.mock('utils/query/queryClient', () => ({ queryClient: mocks }));
vi.mock('hooks/useBrandingOptions', () => ({ getBrandingOptionsQuery: () => ({}) }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: mocks }));

let showPage;
let api;
const images = () => ({ Items: [{ Id: 'image', ServerId: 'server', BackdropImageTags: ['tag'] }] });
const page = (type = 'Movie', extraClass = '') => ({
    classList: {
        contains: value => ['page', 'backdropPage', extraClass].includes(value),
        remove: vi.fn()
    },
    getAttribute: () => type
});
const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};

describe('automatic backdrop navigation and cache', () => {
    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();
        api = { serverId: () => 'server', serverAddress: () => 'address', getCurrentUserId: () => 'user', getItems: vi.fn().mockResolvedValue(images()) };
        mocks.currentApiClient.mockReturnValue(api);
        mocks.getTopParentId.mockReturnValue('parent');
        await import('./autoBackdrops');
        showPage = mocks.pageClassOn.mock.calls[0][2];
    });

    it('reuses records without letting backdrop consumers mutate the cache', async () => {
        showPage.call(page());
        await flush();
        mocks.setBackdrops.mock.calls[0][0][0].Id = 'mutated';
        mocks.setBackdrops.mock.calls[0][0][0].BackdropImageTags[0] = 'mutated';
        showPage.call(page());
        await flush();
        expect(api.getItems).toHaveBeenCalledTimes(1);
        expect(mocks.setBackdrops.mock.lastCall[0][0]).toMatchObject({ Id: 'image', BackdropImageTags: ['tag'] });
    });

    it('separates servers, users and ambiguous type/parent tuples', async () => {
        mocks.getTopParentId.mockReturnValue('bc');
        showPage.call(page('a'));
        await flush();
        mocks.getTopParentId.mockReturnValue('c');
        showPage.call(page('ab'));
        await flush();
        api.getCurrentUserId = () => 'other';
        showPage.call(page('ab'));
        await flush();
        api.serverId = () => 'other-server';
        showPage.call(page('ab'));
        await flush();
        expect(api.getItems).toHaveBeenCalledTimes(4);
    });

    it('ignores an item response after navigating to a self backdrop page', async () => {
        let resolve;
        api.getItems.mockReturnValue(new Promise(done => {
            resolve = done;
        }));
        showPage.call(page());
        showPage.call(page('', 'selfBackdropPage'));
        resolve(images());
        await flush();
        expect(mocks.setBackdrops).not.toHaveBeenCalled();
    });

    it('ignores a response after the current user changes without navigation', async () => {
        let resolve;
        api.getItems.mockReturnValue(new Promise(done => {
            resolve = done;
        }));
        showPage.call(page());
        api.getCurrentUserId = () => 'other';
        resolve(images());
        await flush();
        expect(mocks.setBackdrops).not.toHaveBeenCalled();
    });

    it('evicts old lists after 32 distinct requests', async () => {
        for (let index = 0; index < 33; index++) {
            showPage.call(page(String(index)));
            await flush();
        }
        showPage.call(page('0'));
        await flush();
        expect(api.getItems).toHaveBeenCalledTimes(34);
    });

    it('ignores a splash response after navigating away', async () => {
        let resolve;
        mocks.fetchQuery.mockReturnValue(new Promise(done => {
            resolve = done;
        }));
        mocks.getApi.mockReturnValue({ getUri: () => 'splash' });
        showPage.call(page('splashscreen'));
        showPage.call(page('', 'selfBackdropPage'));
        resolve({ SplashscreenEnabled: true });
        await flush();
        expect(mocks.setBackdropImages).not.toHaveBeenCalled();
    });
});
