import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { getItemQuery as itemFacade } from 'hooks/useItem';
import { getDisplayPreferencesQuery as preferencesFacade } from 'hooks/api/useDisplayPreferences';
import { getUserQuery as userFacade } from 'hooks/api/useUser';
import { getUserViewsQuery as viewsFacade } from 'hooks/api/useUserViews';
import { getBrandingOptionsQuery as brandingFacade } from 'hooks/useBrandingOptions';
import { getItemQuery } from './item';
import { getDisplayPreferencesQuery } from './displayPreferences';
import { getUserQuery } from './user';
import { getUserViewsQuery } from './userViews';
import { getBrandingOptionsQuery } from './brandingOptions';

vi.mock('hooks/useApi', () => ({ useApi: vi.fn() }));

describe('framework-independent query factories', () => {
    it('preserves existing factory exports for legacy consumers', () => {
        expect(itemFacade).toBe(getItemQuery);
        expect(preferencesFacade).toBe(getDisplayPreferencesQuery);
        expect(userFacade).toBe(getUserQuery);
        expect(viewsFacade).toBe(getUserViewsQuery);
        expect(brandingFacade).toBe(getBrandingOptionsQuery);
    });

    it.each(['item', 'displayPreferences', 'user', 'userViews', 'brandingOptions'])('%s has no application context dependency', name => {
        const source = readFileSync('src/lib/queries/' + name + '.ts', 'utf8');
        expect(source).not.toMatch(/from ['"](?:hooks|components|apps)\//);
        expect(source).not.toContain('useQuery');
    });
});
