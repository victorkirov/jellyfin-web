import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { LEGACY_USER_ROUTES } from './user';

it('removes the controls page whose only setting was smooth scrolling', () => {
    expect(LEGACY_USER_ROUTES.some(route => route.path === 'mypreferencescontrols')).toBe(false);
    const settings = readFileSync('src/apps/legacy/routes/user/settings/index.tsx', 'utf8');
    expect(settings).not.toContain('mypreferencescontrols');
});
