import { expect, it, vi } from 'vitest';

vi.mock('scripts/settings/userSettings', () => ({
    currentSettings: { language: () => 'bg-BG', dateTimeLocale: () => undefined }
}));
vi.mock('lib/globalize/dictionaries', async importOriginal => ({
    ...await importOriginal<typeof import('lib/globalize/dictionaries')>(),
    loadStringsForLocale: vi.fn().mockResolvedValue([])
}));

it('uses the saved locale before requesting the cold startup dictionary', async () => {
    await import('./localizationSettings');
    const { getCurrentLocale, getCurrentDateTimeLocale } = await import('lib/globalize');
    const { loadCoreDictionary } = await import('lib/globalize/loader');
    const { loadStringsForLocale } = await import('lib/globalize/dictionaries');
    await loadCoreDictionary();
    expect(getCurrentLocale()).toBe('bg-bg');
    expect(getCurrentDateTimeLocale()).toBe('bg-bg');
    expect(document.documentElement.getAttribute('lang')).toBe('bg-bg');
    expect(loadStringsForLocale).toHaveBeenCalledWith(expect.objectContaining({ name: 'core' }), 'bg-bg');
});
