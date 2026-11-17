import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemDto } from 'types/base/models/item-dto';
import type { UserDataChangedMessage } from '@jellyfin/sdk/lib/generated-client';

type StateButton = HTMLButtonElement & { setItem(item: ItemDto | null): void };
type StatePrototype = StateButton & { detachedCallback(this: StateButton): void };
const mocks = vi.hoisted(() => ({
    prototypes: {} as Record<string, StatePrototype>,
    subscribe: vi.fn<(_types: unknown, callback: (message: UserDataChangedMessage) => void) => (() => void)>(),
    unsubscribe: vi.fn(),
    markPlayed: vi.fn(),
    markUnplayed: vi.fn(),
    updateFavoriteStatus: vi.fn().mockResolvedValue({ IsFavorite: true }),
    invalidateQueries: vi.fn(),
    trigger: vi.fn()
}));
vi.mock('../../lib/globalize/index', () => ({ default: { translate: (key: string) => key } }));
vi.mock('./emby-button', () => ({ default: {} }));
vi.mock('lib/jellyfin-apiclient/index', () => ({ ServerConnections: {
    getApiClient: () => ({ getCurrentUserId: () => 'user', subscribe: mocks.subscribe, markPlayed: mocks.markPlayed, markUnplayed: mocks.markUnplayed, updateFavoriteStatus: mocks.updateFavoriteStatus }),
    getApi: () => ({})
} }));
vi.mock('utils/query/queryClient', () => ({ queryClient: { invalidateQueries: mocks.invalidateQueries } }));
vi.mock('utils/query/queryKeys', () => ({ userLibraryQueryKeys: () => [['favorites']] }));
vi.mock('scripts/serverNotifications', () => ({ default: {} }));
vi.mock('utils/events', () => ({ default: { trigger: mocks.trigger } }));

beforeAll(async () => {
    Object.assign(document, { registerElement: (name: string, options: { prototype: StatePrototype }) => {
        mocks.prototypes[name] = options.prototype;
    } });
    await import('./emby-playstatebutton');
    await import('./emby-ratingbutton');
});
beforeEach(() => {
    vi.clearAllMocks();
    mocks.subscribe.mockReturnValue(mocks.unsubscribe);
    mocks.updateFavoriteStatus.mockResolvedValue({ IsFavorite: true });
    document.body.innerHTML = '';
});

function makeButton(kind: 'playstate' | 'rating') {
    const button = document.createElement('button') as StateButton;
    button.innerHTML = '<span class="material-icons"></span><span class="button-text"></span>';
    button.setItem = mocks.prototypes['emby-' + kind + 'button'].setItem;
    document.body.appendChild(button);
    return button;
}
const item = { Id: 'item', ServerId: 'server', Type: 'Movie' } as ItemDto;

describe('state button identity, labels and updates', () => {
    it('updates played state from setItem, clicks and matching websocket messages without replacing focus', () => {
        const button = makeButton('playstate');
        button.setItem({ ...item, UserData: { Key: 'item', Played: false } });
        button.focus();
        expect(button.title).toBe('MarkPlayed');
        button.click();
        expect(mocks.markPlayed).toHaveBeenCalledWith('user', 'item', expect.any(Date));
        expect(button.title).toBe('Watched');
        expect(button.classList.contains('playstatebutton-played')).toBe(true);
        button.click();
        expect(mocks.markUnplayed).toHaveBeenCalledWith('user', 'item', expect.any(Date));
        const callback = mocks.subscribe.mock.calls[mocks.subscribe.mock.calls.length - 1][1];
        callback({ Data: { UserDataList: [{ Key: 'item', ItemId: 'other', Played: true }] } });
        expect(button.title).toBe('MarkPlayed');
        callback({ Data: { UserDataList: [{ Key: 'item', ItemId: 'item', Played: true }] } });
        expect(button.title).toBe('Watched');
        expect(document.activeElement).toBe(button);
        button.setItem(null);
        expect(button.hasAttribute('data-id')).toBe(false);
        expect(mocks.unsubscribe).toHaveBeenCalled();
    });

    it('updates favorite state from setItem, mutation results and websocket messages while retaining focus and query invalidation', async () => {
        const button = makeButton('rating');
        button.setItem({ ...item, UserData: { Key: 'item', IsFavorite: false } });
        button.focus();
        expect(button.title).toBe('AddToFavorites');
        button.click();
        await Promise.resolve();
        expect(mocks.updateFavoriteStatus).toHaveBeenCalledWith('user', 'item', true);
        expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['favorites'] });
        expect(button.title).toBe('Favorite');
        const callback = mocks.subscribe.mock.calls[mocks.subscribe.mock.calls.length - 1][1];
        callback({ Data: { UserDataList: [{ Key: 'item', ItemId: 'other', IsFavorite: false }] } });
        expect(button.title).toBe('Favorite');
        callback({ Data: { UserDataList: [{ Key: 'item', ItemId: 'item', IsFavorite: false }] } });
        expect(button.title).toBe('AddToFavorites');
        expect(document.activeElement).toBe(button);
        button.setItem(null);
        expect(button.hasAttribute('data-id')).toBe(false);
        expect(mocks.unsubscribe).toHaveBeenCalled();
    });
});
