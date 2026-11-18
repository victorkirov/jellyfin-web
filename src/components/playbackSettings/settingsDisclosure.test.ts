import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserSettings } from 'scripts/settings/userSettings';
import PlaybackSettings from './playbackSettings';
import SubtitleSettings from '../subtitlesettings/subtitlesettings';
import appSettings from '../../scripts/settings/appSettings';
import Events from '../../utils/events';
import focusManager from '../../lib/focusManager';
import loading from '../loading/loading';

const pending = vi.hoisted(() => ({ endpoint: vi.fn(), multiServer: true }));

vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApiClient: () => ({
    getUser: () => Promise.resolve({ Id: 'user', Policy: { EnableVideoPlaybackTranscoding: true, EnableAudioPlaybackTranscoding: true } }),
    getEndpointInfo: pending.endpoint,
    getCurrentUserId: () => 'user'
}) } }));
vi.mock('components/apphost', () => ({ appHost: { supports: (feature: string) => feature !== 'multiserver' || pending.multiServer } }));
vi.mock('lib/layoutManager', () => ({ default: { tv: true } }));
vi.mock('scripts/browser', () => ({ default: { web0s: true, safari: true } }));
vi.mock('lib/scrollManager', () => ({ default: { isEnabled: () => false } }));
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
vi.mock('components/select/emby-select', () => ({}));
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

async function mount(Component: typeof PlaybackSettings | typeof SubtitleSettings, userSettings: ReturnType<typeof settings>, autoFocus = false) {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const slider = HTMLInputElement.prototype as HTMLInputElement & { enableKeyboardDragging?: () => void };
    slider.enableKeyboardDragging = vi.fn();
    const instance = new Component({ element, userSettings: userSettings as unknown as UserSettings, userId: 'user', enableSaveButton: true, autoFocus });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect('dataLoaded' in instance && instance.dataLoaded).toBe(true);
    return { instance, element };
}

beforeEach(() => {
    document.body.innerHTML = '';
    pending.multiServer = true;
    pending.endpoint.mockResolvedValue({ IsInNetwork: true });
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

it('waits for endpoint visibility and focuses the first quality control', async () => {
    pending.multiServer = false;
    let resolve!: (value: { IsInNetwork: boolean }) => void;
    pending.endpoint.mockReturnValue(new Promise(done => {
        resolve = done;
    }));
    const focus = vi.spyOn(focusManager, 'focus');
    const { instance, element } = await mount(PlaybackSettings, settings(), true);
    expect(focus).not.toHaveBeenCalled();
    resolve({ IsInNetwork: true });
    await vi.waitFor(() => expect(focus).toHaveBeenCalled());
    expect(document.activeElement).toBe(element.querySelector('.selectVideoInNetworkQuality'));
    instance.destroy();
});

it.each(['move', 'leave', 'destroy'] as const)('does not steal focus after the user chooses to %s during load', async action => {
    pending.multiServer = false;
    let resolve!: (value: { IsInNetwork: boolean }) => void;
    pending.endpoint.mockReturnValue(new Promise(done => {
        resolve = done;
    }));
    const focus = vi.spyOn(focusManager, 'focus');
    const { instance, element } = await mount(PlaybackSettings, settings(), true);
    if (action === 'move') element.querySelector<HTMLSelectElement>('#selectAllowedAudioChannels')!.focus();
    if (action === 'leave') element.remove();
    if (action === 'destroy') instance.destroy();
    resolve({ IsInNetwork: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(focus).not.toHaveBeenCalled();
    if (action !== 'destroy') instance.destroy();
});

it('preserves restored focus when the cached view reloads its data', async () => {
    const userSettings = settings();
    const { instance, element } = await mount(PlaybackSettings, userSettings, true);
    await vi.waitFor(() => expect(document.activeElement).toBe(element.querySelector('.selectVideoInNetworkQuality')));
    element.querySelector<HTMLButtonElement>('.btnSettingsAdvanced')!.click();
    const restoredControl = element.querySelector<HTMLSelectElement>('#selectAudioNormalization')!;
    restoredControl.focus();
    await instance.loadData();
    expect(userSettings.setUserInfo).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(restoredControl);
    instance.destroy();
});

it.each(['destroy', 'detach'] as const)('hides the loading spinner after the view is removed by %s during user settings load', async action => {
    const userSettings = settings();
    let finishLoading!: () => void;
    userSettings.setUserInfo.mockReturnValueOnce(new Promise<void>(resolve => {
        finishLoading = resolve;
    }));
    const element = document.createElement('div');
    document.body.appendChild(element);
    const instance = new PlaybackSettings({ element, userId: 'user', userSettings: userSettings as unknown as UserSettings });
    vi.mocked(loading.hide).mockClear();
    await Promise.resolve();
    expect(userSettings.setUserInfo).toHaveBeenCalledTimes(1);
    expect(loading.hide).not.toHaveBeenCalled();
    if (action === 'destroy') instance.destroy();
    else element.remove();
    finishLoading();
    await Promise.resolve();
    expect(loading.hide).toHaveBeenCalledTimes(1);
    if (action !== 'destroy') instance.destroy();
});
