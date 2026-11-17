import { describe, expect, it, vi } from 'vitest';
import { canPlayList, parseOptionalBoolean } from './policies';
import { getItems } from './queries';
import { ListSettings } from './settings';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import type { ItemDto } from 'types/base/models/item-dto';

vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApiClient: vi.fn() } }));
vi.mock('scripts/settings/userSettings', () => ({ getFilter: vi.fn(), getSortValuesLegacy: () => ({ sortBy: 'SortName', sortOrder: 'Ascending' }) }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));

describe('List query and action policies', () => {
    it.each([
        ['true', true], ['false', false], [undefined, undefined], ['TRUE', undefined], ['', undefined], ['invalid', undefined]
    ])('preserves optional boolean %s as %s', (input, expected) => {
        expect(parseOptionalBoolean(input as string | undefined)).toBe(expected);
    });

    it('passes false through the programs caller and omits missing or invalid fields', async () => {
        const getLiveTvPrograms = vi.fn().mockResolvedValue({ Items: [] });
        vi.mocked(ServerConnections.getApiClient).mockReturnValue({ getCurrentUserId: () => 'user', getLiveTvPrograms } as never);
        const params = { serverId: 'server', type: 'Programs', IsMovie: 'false', IsSeries: 'true', IsNews: 'invalid' };
        await getItems(new ListSettings(params), params, null, null, 0, 2);
        expect(getLiveTvPrograms).toHaveBeenCalledWith(expect.objectContaining({ IsMovie: false, IsSeries: true, StartIndex: 0, Limit: 2 }));
        expect(getLiveTvPrograms.mock.calls[0][0]).not.toHaveProperty('IsNews');
        expect(getLiveTvPrograms.mock.calls[0][0]).not.toHaveProperty('IsKids');
    });

    it.each([
        [null, undefined, true], [null, 'Programs', false], [null, 'nextup', true],
        [{ Type: 'Playlist' }, undefined, true], [{ Type: 'Folder' }, undefined, true],
        [{ Type: 'Channel' }, undefined, false], [{ Type: 'UserView' }, undefined, false],
        [{ Type: 'MusicGenre' }, 'Programs', true],
        [{ Type: 'CollectionFolder', CollectionType: 'homevideos' }, undefined, true],
        [{ Type: 'CollectionFolder', CollectionType: 'musicvideos' }, undefined, true],
        [{ Type: 'CollectionFolder', CollectionType: 'movies' }, undefined, false],
        [{ Type: 'CollectionFolder', CollectionType: 'homevideos' }, 'Programs', false]
    ])('keeps play eligibility for %j in %s', (item, type, expected) => {
        expect(canPlayList(item as ItemDto | null, { serverId: 'server', type: type as string | undefined })).toBe(expected);
    });
});
