import type { UserSettings } from '../../scripts/settings/userSettings';

type Options = { element: HTMLElement; serverId: string; userId: string; userSettings: UserSettings; enableSaveConfirmation?: boolean; enableSaveButton?: boolean; autoFocus?: boolean };

import escapeHtml from 'escape-html';

import { AppFeature } from 'constants/appFeature';
import { PluginType } from 'constants/pluginType';
import { ServerConnections } from 'lib/jellyfin-apiclient';

import { pluginManager } from '../pluginManager';
import { appHost } from '../apphost';
import focusManager from '../../lib/focusManager';
import datetime from '../../scripts/datetime';
import globalize from '../../lib/globalize';
import loading from '../loading/loading';
import Events from '../../utils/events';
import toast from '../toast/toast';

import template from './displaySettings.template.html';

import '../select/emby-select';
import '../../elements/emby-checkbox/emby-checkbox';
import '../buttons/emby-button';
import '../../elements/emby-textarea/emby-textarea';

function loadScreensavers(context: HTMLElement, userSettings: UserSettings) {
    const selectScreensaver = context.querySelector<HTMLSelectElement>('.selectScreensaver')!;
    const options = pluginManager.ofType(PluginType.Screensaver).map(plugin => {
        return {
            name: globalize.translate(plugin.name),
            value: plugin.id
        };
    });

    options.unshift({
        name: globalize.translate('None'),
        value: 'none'
    });

    selectScreensaver.innerHTML = options.map(o => {
        return `<option value="${o.value}">${escapeHtml(o.name)}</option>`;
    }).join('');

    selectScreensaver.value = userSettings.screensaver()!;

    if (!selectScreensaver.value) {
        // TODO: set the default instead of none
        selectScreensaver.value = 'none';
    }
}

function loadForm(context: HTMLElement, userSettings: UserSettings) {
    if (appHost.supports(AppFeature.DisplayLanguage)) {
        context.querySelector<HTMLElement>('.languageSection')!.classList.remove('hide');
    } else {
        context.querySelector<HTMLElement>('.languageSection')!.classList.add('hide');
    }

    if (appHost.supports(AppFeature.ExternalLinks)) {
        context.querySelector<HTMLElement>('.learnHowToContributeContainer')!.classList.remove('hide');
    } else {
        context.querySelector<HTMLElement>('.learnHowToContributeContainer')!.classList.add('hide');
    }

    context.querySelector<HTMLElement>('.txtSlideshowIntervalContainer')!.classList.remove('hide');

    if (appHost.supports(AppFeature.Screensaver)) {
        context.querySelector<HTMLElement>('.selectScreensaverContainer')!.classList.remove('hide');
        context.querySelector<HTMLElement>('.txtBackdropScreensaverIntervalContainer')!.classList.remove('hide');
        context.querySelector<HTMLElement>('.txtScreensaverTimeContainer')!.classList.remove('hide');
    } else {
        context.querySelector<HTMLElement>('.selectScreensaverContainer')!.classList.add('hide');
        context.querySelector<HTMLElement>('.txtBackdropScreensaverIntervalContainer')!.classList.add('hide');
        context.querySelector<HTMLElement>('.txtScreensaverTimeContainer')!.classList.add('hide');
    }

    if (datetime.supportsLocalization()) {
        context.querySelector<HTMLElement>('.fldDateTimeLocale')!.classList.remove('hide');
    } else {
        context.querySelector<HTMLElement>('.fldDateTimeLocale')!.classList.add('hide');
    }

    loadScreensavers(context, userSettings);

    context.querySelector<HTMLInputElement>('#txtBackdropScreensaverInterval')!.value = String(userSettings.backdropScreensaverInterval());
    context.querySelector<HTMLInputElement>('#txtSlideshowInterval')!.value = String(userSettings.slideshowInterval());
    context.querySelector<HTMLInputElement>('#txtScreensaverTime')!.value = String(userSettings.screensaverTime());

    context.querySelector<HTMLInputElement>('#chkThemeSong')!.checked = userSettings.enableThemeSongs();
    context.querySelector<HTMLInputElement>('#chkThemeVideo')!.checked = userSettings.enableThemeVideos();
    context.querySelector<HTMLInputElement>('#chkBlurhash')!.checked = userSettings.enableBlurhash();
    context.querySelector<HTMLInputElement>('#chkBackdrops')!.checked = userSettings.enableBackdrops();
    context.querySelector<HTMLInputElement>('#chkDetailsBanner')!.checked = userSettings.detailsBanner();

    context.querySelector<HTMLInputElement>('#chkDisableCustomCss')!.checked = userSettings.disableCustomCss();
    context.querySelector<HTMLTextAreaElement>('#txtLocalCustomCss')!.value = userSettings.customCss()!;

    context.querySelector<HTMLSelectElement>('#selectLanguage')!.value = userSettings.language() || '';
    context.querySelector<HTMLSelectElement>('.selectDateTimeLocale')!.value = userSettings.dateTimeLocale() || '';

    context.querySelector<HTMLInputElement>('#txtLibraryPageSize')!.value = String(userSettings.libraryPageSize());

    context.querySelector<HTMLInputElement>('#txtMaxDaysForNextUp')!.value = String(userSettings.maxDaysForNextUp());
    context.querySelector<HTMLInputElement>('#chkRewatchingNextUp')!.checked = userSettings.enableRewatchingInNextUp();

    loading.hide();
}

function saveUser(context: HTMLElement, userSettingsInstance: UserSettings) {
    if (appHost.supports(AppFeature.DisplayLanguage)) {
        userSettingsInstance.language(context.querySelector<HTMLSelectElement>('#selectLanguage')!.value);
    }

    userSettingsInstance.dateTimeLocale(context.querySelector<HTMLSelectElement>('.selectDateTimeLocale')!.value);

    userSettingsInstance.enableThemeSongs(context.querySelector<HTMLInputElement>('#chkThemeSong')!.checked);
    userSettingsInstance.enableThemeVideos(context.querySelector<HTMLInputElement>('#chkThemeVideo')!.checked);
    userSettingsInstance.screensaver(context.querySelector<HTMLSelectElement>('.selectScreensaver')!.value);
    userSettingsInstance.backdropScreensaverInterval(context.querySelector<HTMLInputElement>('#txtBackdropScreensaverInterval')!.value as unknown as number);
    userSettingsInstance.slideshowInterval(context.querySelector<HTMLInputElement>('#txtSlideshowInterval')!.value as unknown as number);
    userSettingsInstance.screensaverTime(context.querySelector<HTMLInputElement>('#txtScreensaverTime')!.value as unknown as number);

    // Preserve the legacy string serialization accepted by the numeric setters.
    userSettingsInstance.libraryPageSize(context.querySelector<HTMLInputElement>('#txtLibraryPageSize')!.value as unknown as number);

    userSettingsInstance.maxDaysForNextUp(context.querySelector<HTMLInputElement>('#txtMaxDaysForNextUp')!.value as unknown as number);
    userSettingsInstance.enableRewatchingInNextUp(context.querySelector<HTMLInputElement>('#chkRewatchingNextUp')!.checked);

    userSettingsInstance.enableBlurhash(context.querySelector<HTMLInputElement>('#chkBlurhash')!.checked);
    userSettingsInstance.enableBackdrops(context.querySelector<HTMLInputElement>('#chkBackdrops')!.checked);
    userSettingsInstance.detailsBanner(context.querySelector<HTMLInputElement>('#chkDetailsBanner')!.checked);

    userSettingsInstance.disableCustomCss(context.querySelector<HTMLInputElement>('#chkDisableCustomCss')!.checked);
    userSettingsInstance.customCss(context.querySelector<HTMLTextAreaElement>('#txtLocalCustomCss')!.value);
}

function save(instance: DisplaySettings, context: HTMLElement, userSettings: UserSettings, enableSaveConfirmation?: boolean) {
    loading.show();
    saveUser(context, userSettings);
    loading.hide();
    if (enableSaveConfirmation) {
        toast(globalize.translate('SettingsSaved'));
    }
    Events.trigger(instance, 'saved');
}

function onSubmit(this: DisplaySettings, e?: Event) {
    const apiClient = ServerConnections.getApiClient(this.options.serverId);
    const userId = this.options.userId;
    const userSettings = this.options.userSettings;

    void userSettings.setUserInfo(userId, apiClient!).then(() => {
        const enableSaveConfirmation = this.options.enableSaveConfirmation;
        save(this, this.options.element, userSettings, enableSaveConfirmation);
    });

    // Disable default form submission
    if (e) {
        e.preventDefault();
    }
    return false;
}

function embed(options: Options, self: DisplaySettings) {
    options.element.innerHTML = globalize.translateHtml(template, 'core');
    options.element.querySelector<HTMLElement>('form')!.addEventListener('submit', onSubmit.bind(self));
    if (options.enableSaveButton) {
        options.element.querySelector<HTMLElement>('.btnSave')!.classList.remove('hide');
    }
    void self.loadData(options.autoFocus);
}

class DisplaySettings {
    options: Options;
    dataLoaded?: boolean;

    constructor(options: Options) {
        this.options = options;
        embed(options, this);
    }

    async loadData(autoFocus?: boolean) {
        const context = this.options.element;

        loading.show();

        const userId = this.options.userId;
        const apiClient = ServerConnections.getApiClient(this.options.serverId);
        const userSettings = this.options.userSettings;

        await userSettings.setUserInfo(userId, apiClient!);

        this.dataLoaded = true;
        loadForm(context, userSettings);
        if (autoFocus) {
            focusManager.autoFocus(context);
        }
    }

    submit() {
        onSubmit.call(this);
    }

    destroy() {
        this.options = null!;
    }
}

export default DisplaySettings;
