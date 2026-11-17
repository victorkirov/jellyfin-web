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
import Events from '../../utils/events.ts';
import toast from '../toast/toast';

import template from './displaySettings.template.html';

import '../select/emby-select';
import '../../elements/emby-checkbox/emby-checkbox';
import '../buttons/emby-button';
import '../../elements/emby-textarea/emby-textarea';

function loadScreensavers(context, userSettings) {
    const selectScreensaver = context.querySelector('.selectScreensaver');
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

    selectScreensaver.value = userSettings.screensaver();

    if (!selectScreensaver.value) {
        // TODO: set the default instead of none
        selectScreensaver.value = 'none';
    }
}

function loadForm(context, userSettings) {
    if (appHost.supports(AppFeature.DisplayLanguage)) {
        context.querySelector('.languageSection').classList.remove('hide');
    } else {
        context.querySelector('.languageSection').classList.add('hide');
    }

    if (appHost.supports(AppFeature.ExternalLinks)) {
        context.querySelector('.learnHowToContributeContainer').classList.remove('hide');
    } else {
        context.querySelector('.learnHowToContributeContainer').classList.add('hide');
    }

    context.querySelector('.txtSlideshowIntervalContainer').classList.remove('hide');

    if (appHost.supports(AppFeature.Screensaver)) {
        context.querySelector('.selectScreensaverContainer').classList.remove('hide');
        context.querySelector('.txtBackdropScreensaverIntervalContainer').classList.remove('hide');
        context.querySelector('.txtScreensaverTimeContainer').classList.remove('hide');
    } else {
        context.querySelector('.selectScreensaverContainer').classList.add('hide');
        context.querySelector('.txtBackdropScreensaverIntervalContainer').classList.add('hide');
        context.querySelector('.txtScreensaverTimeContainer').classList.add('hide');
    }

    if (datetime.supportsLocalization()) {
        context.querySelector('.fldDateTimeLocale').classList.remove('hide');
    } else {
        context.querySelector('.fldDateTimeLocale').classList.add('hide');
    }

    loadScreensavers(context, userSettings);

    context.querySelector('#txtBackdropScreensaverInterval').value = userSettings.backdropScreensaverInterval();
    context.querySelector('#txtSlideshowInterval').value = userSettings.slideshowInterval();
    context.querySelector('#txtScreensaverTime').value = userSettings.screensaverTime();

    context.querySelector('#chkThemeSong').checked = userSettings.enableThemeSongs();
    context.querySelector('#chkThemeVideo').checked = userSettings.enableThemeVideos();
    context.querySelector('#chkFadein').checked = userSettings.enableFastFadein();
    context.querySelector('#chkBlurhash').checked = userSettings.enableBlurhash();
    context.querySelector('#chkBackdrops').checked = userSettings.enableBackdrops();
    context.querySelector('#chkDetailsBanner').checked = userSettings.detailsBanner();

    context.querySelector('#chkDisableCustomCss').checked = userSettings.disableCustomCss();
    context.querySelector('#txtLocalCustomCss').value = userSettings.customCss();

    context.querySelector('#selectLanguage').value = userSettings.language() || '';
    context.querySelector('.selectDateTimeLocale').value = userSettings.dateTimeLocale() || '';

    context.querySelector('#txtLibraryPageSize').value = userSettings.libraryPageSize();

    context.querySelector('#txtMaxDaysForNextUp').value = userSettings.maxDaysForNextUp();
    context.querySelector('#chkRewatchingNextUp').checked = userSettings.enableRewatchingInNextUp();

    loading.hide();
}

function saveUser(context, userSettingsInstance) {
    if (appHost.supports(AppFeature.DisplayLanguage)) {
        userSettingsInstance.language(context.querySelector('#selectLanguage').value);
    }

    userSettingsInstance.dateTimeLocale(context.querySelector('.selectDateTimeLocale').value);

    userSettingsInstance.enableThemeSongs(context.querySelector('#chkThemeSong').checked);
    userSettingsInstance.enableThemeVideos(context.querySelector('#chkThemeVideo').checked);
    userSettingsInstance.screensaver(context.querySelector('.selectScreensaver').value);
    userSettingsInstance.backdropScreensaverInterval(context.querySelector('#txtBackdropScreensaverInterval').value);
    userSettingsInstance.slideshowInterval(context.querySelector('#txtSlideshowInterval').value);
    userSettingsInstance.screensaverTime(context.querySelector('#txtScreensaverTime').value);

    userSettingsInstance.libraryPageSize(context.querySelector('#txtLibraryPageSize').value);

    userSettingsInstance.maxDaysForNextUp(context.querySelector('#txtMaxDaysForNextUp').value);
    userSettingsInstance.enableRewatchingInNextUp(context.querySelector('#chkRewatchingNextUp').checked);

    userSettingsInstance.enableFastFadein(context.querySelector('#chkFadein').checked);
    userSettingsInstance.enableBlurhash(context.querySelector('#chkBlurhash').checked);
    userSettingsInstance.enableBackdrops(context.querySelector('#chkBackdrops').checked);
    userSettingsInstance.detailsBanner(context.querySelector('#chkDetailsBanner').checked);

    userSettingsInstance.disableCustomCss(context.querySelector('#chkDisableCustomCss').checked);
    userSettingsInstance.customCss(context.querySelector('#txtLocalCustomCss').value);
}

function save(instance, context, userSettings, enableSaveConfirmation) {
    loading.show();
    saveUser(context, userSettings);
    loading.hide();
    if (enableSaveConfirmation) {
        toast(globalize.translate('SettingsSaved'));
    }
    Events.trigger(instance, 'saved');
}

function onSubmit(e) {
    const self = this;
    const apiClient = ServerConnections.getApiClient(self.options.serverId);
    const userId = self.options.userId;
    const userSettings = self.options.userSettings;

    userSettings.setUserInfo(userId, apiClient).then(() => {
        const enableSaveConfirmation = self.options.enableSaveConfirmation;
        save(self, self.options.element, userSettings, enableSaveConfirmation);
    });

    // Disable default form submission
    if (e) {
        e.preventDefault();
    }
    return false;
}

function embed(options, self) {
    options.element.innerHTML = globalize.translateHtml(template, 'core');
    options.element.querySelector('form').addEventListener('submit', onSubmit.bind(self));
    if (options.enableSaveButton) {
        options.element.querySelector('.btnSave').classList.remove('hide');
    }
    self.loadData(options.autoFocus);
}

class DisplaySettings {
    constructor(options) {
        this.options = options;
        embed(options, this);
    }

    async loadData(autoFocus) {
        const self = this;
        const context = self.options.element;

        loading.show();

        const userId = self.options.userId;
        const apiClient = ServerConnections.getApiClient(self.options.serverId);
        const userSettings = self.options.userSettings;

        await userSettings.setUserInfo(userId, apiClient);

        self.dataLoaded = true;
        loadForm(context, userSettings);
        if (autoFocus) {
            focusManager.autoFocus(context);
        }
    }

    submit() {
        onSubmit.call(this);
    }

    destroy() {
        this.options = null;
    }
}

export default DisplaySettings;
