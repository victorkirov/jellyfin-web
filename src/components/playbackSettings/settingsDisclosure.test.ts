import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PlaybackSettings from './playbackSettings';
import SubtitleSettings from '../subtitlesettings/subtitlesettings';
import appSettings from '../../scripts/settings/appSettings';
import Events from '../../utils/events';
import focusManager from '../focusManager';

vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApiClient: () => ({
    getUser: () => Promise.resolve({ Id: 'user', Policy: { EnableVideoPlaybackTranscoding: true, EnableAudioPlaybackTranscoding: true } }),
    getCurrentUserId: () => 'user'
}) } }));
vi.mock('components/apphost', () => ({ appHost: { supports: () => true } }));
vi.mock('components/layoutManager', () => ({ default: { tv: true } }));
vi.mock('scripts/browser', () => ({ default: { web0s: true, safari: true } }));
vi.mock('components/scrollManager', () => ({ default: { isEnabled: () => false } }));
vi.mock('components/pluginManager', () => ({ pluginManager: { ofType: () => [] } }));
vi.mock('components/qualityOptions', () => ({ default: {
    getAudioQualityOptions: () => [{ bitrate: 0, name: 'Auto' }, { bitrate: 1500000, name: 'Selected' }],
    getVideoQualityOptions: () => [{ bitrate: 0, name: 'Auto' }, { bitrate: 1500000, name: 'Selected' }]
} }));
vi.mock('components/loading/loading', () => ({ default: { show: vi.fn(), hide: vi.fn() } }));
vi.mock('components/toast/toast', () => ({ default: vi.fn() }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key, translateHtml: (html: string) => html } }));
vi.mock('components/subtitlesettings/subtitleappearancehelper', () => ({ default: { applyStyles: vi.fn() } }));
vi.mock('components/playbackSettings/playbackSettings.template.html', () => ({ default: readFileSync('src/components/playbackSettings/playbackSettings.template.html', 'utf8') }));
vi.mock('components/subtitlesettings/subtitlesettings.template.html', () => ({ default: readFileSync('src/components/subtitlesettings/subtitlesettings.template.html', 'utf8') }));
vi.mock('elements/emby-select/emby-select', () => ({}));
vi.mock('elements/emby-checkbox/emby-checkbox', () => ({}));
vi.mock('elements/emby-input/emby-input', () => ({}));
vi.mock('elements/emby-slider/emby-slider', () => ({}));

function settings() {
    const values: Record<string, unknown> = {
        allowedAudioChannels: '6', stillWatchingPrompt: 'disabled', preferFmp4HlsContainer: true,
        limitSegmentLength: true, enableCinemaMode: true, selectAudioNormalization: 'AlbumGain',
        enableNextVideoInfoOverlay: false
    };
    let appearance = { aspectMode: 'contain', subtitleStyling: 'Custom', textSize: 'larger', textWeight: 'bold',
        dropShadow: 'uniform', font: 'console', textBackground: 'transparent', textColor: '#ffff00', verticalPosition: 4 };
    return {
        ...Object.fromEntries(Object.keys(values).map(key => [key, (value?: unknown) => {
            if (value !== undefined) values[key] = value;
            return values[key];
        }])),
        setUserInfo: vi.fn().mockResolvedValue(undefined),
        get: (key: string) => values[key],
        set: (key: string, value: unknown) => { values[key] = value; },
        getSubtitleAppearanceSettings: () => ({ ...appearance }),
        setSubtitleAppearanceSettings: (value: typeof appearance) => { appearance = value; }
    };
}

function formValues(element: HTMLElement) {
    return Array.from(element.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')).map(field => ({
        selector: field.id || field.className,
        value: field.type === 'checkbox' ? (field as HTMLInputElement).checked : field.value
    }));
}

async function mount(Component: typeof PlaybackSettings | typeof SubtitleSettings, userSettings: ReturnType<typeof settings>) {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const slider = HTMLInputElement.prototype as HTMLInputElement & { enableKeyboardDragging?: () => void };
    slider.enableKeyboardDragging = vi.fn();
    const instance = new Component({ element, userSettings, userId: 'user', enableSaveButton: true });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect('dataLoaded' in instance && instance.dataLoaded).toBe(true);
    return { instance, element };
}

beforeEach(() => {
    document.body.innerHTML = '';
    // jsdom has no layout; expose the visibility measurement used by focusManager.
    vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) {
        return this.closest('.hide') ? null : document.body;
    });
    localStorage.clear();
    appSettings.maxVideoWidth(1920);
    appSettings.enableSystemExternalPlayers(true);
    appSettings.limitSupportedVideoResolution(true);
    appSettings.enableAutomaticBitrateDetection(true, 'Video', false);
    appSettings.enableAutomaticBitrateDetection(false, 'Video', false);
    appSettings.enableAutomaticBitrateDetection(false, 'Audio', false);
    appSettings.maxStreamingBitrate(true, 'Video', 1500000);
    appSettings.maxStreamingBitrate(false, 'Video', 1500000);
    appSettings.maxStreamingBitrate(false, 'Audio', 1500000);
    appSettings.enableDts(true);
    appSettings.enableTrueHd(true);
    appSettings.enableHi10p(true);
    appSettings.disableVbrAudio(true);
    appSettings.alwaysRemuxFlac(true);
    appSettings.alwaysRemuxMp3(true);
    appSettings.preferredTranscodeVideoCodec('hevc');
    appSettings.preferredTranscodeVideoAudioCodec('flac');
    appSettings.set('subtitleburnin', '');
    appSettings.set('subtitlerenderpgs', 'true');
    appSettings.alwaysBurnInSubtitleWhenTranscoding(true);
});

describe('TV settings disclosures', () => {
    it.each([
        [PlaybackSettings, '.qualitySections'],
        [SubtitleSettings, '.subtitleAppearanceSection']
    ] as const)('prioritizes common controls and preserves every value through closed save and reopen (%#)', async (Component, firstSection) => {
        const userSettings = settings();
        const { instance, element } = await mount(Component, userSettings);
        expect(element.querySelector('form')?.firstElementChild).toBe(element.querySelector(firstSection));
        const advanced = element.querySelector('.settingsAdvanced') as HTMLElement;
        expect(advanced).not.toBeNull();
        expect(advanced.classList.contains('hide')).toBe(true);
        const initial = formValues(element);
        const saved = new Promise(resolve => Events.on(instance, 'saved', resolve));
        instance.submit();
        await saved;
        element.remove();
        const reopened = await mount(Component, userSettings);
        expect(formValues(reopened.element)).toEqual(initial);
        expect(reopened.element.querySelector('.settingsAdvanced.hide')).not.toBeNull();
        instance.destroy();
        reopened.instance.destroy();
    });

    it.each([PlaybackSettings, SubtitleSettings])('keeps collapsed controls outside D-pad traversal and toggles without submitting (%#)', async Component => {
        const userSettings = settings();
        const { element, instance } = await mount(Component, userSettings);
        const button = element.querySelector<HTMLButtonElement>('.btnSettingsAdvanced')!;
        const advanced = element.querySelector<HTMLElement>('.settingsAdvanced')!;
        expect(button).not.toBeNull();
        expect(button.type).toBe('button');
        const visibleFields = () => focusManager.getFocusableElements(element);
        expect(visibleFields().some(field => advanced.contains(field))).toBe(false);
        button.focus();
        button.click();
        expect(button.getAttribute('aria-expanded')).toBe('true');
        expect(advanced.classList.contains('hide')).toBe(false);
        expect(visibleFields().some(field => advanced.contains(field))).toBe(true);
        button.click();
        expect(button.getAttribute('aria-expanded')).toBe('false');
        expect(visibleFields().some(field => advanced.contains(field))).toBe(false);
        expect(document.activeElement).toBe(button);
        expect(userSettings.setUserInfo).toHaveBeenCalledTimes(1);
        instance.destroy();
    });

    it('removes the disclaimer for the removed casting feature', async () => {
        const { element, instance } = await mount(SubtitleSettings, settings());
        expect(element.textContent).not.toContain('SubtitleAppearanceSettingsAlsoPassedToCastDevices');
        instance.destroy();
    });
});
