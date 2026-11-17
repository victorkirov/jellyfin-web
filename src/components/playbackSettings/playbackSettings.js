import { MediaSegmentType } from '@jellyfin/sdk/lib/generated-client/models/media-segment-type';

import { MediaSegmentAction } from 'apps/legacy/features/playback/constants/mediaSegmentAction';
import { getId, getMediaSegmentAction } from 'apps/legacy/features/playback/utils/mediaSegmentSettings';
import { pluginManager } from 'components/pluginManager';
import { AppFeature } from 'constants/appFeature';
import { PluginType } from 'constants/pluginType';
import { MILLISECONDS_PER_MINUTE } from 'constants/time';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { ID as STILL_WATCHING_ID, StillWatchingConfiguration, StillWatchingOptions } from 'plugins/stillWatching/constants';

import appSettings from '../../scripts/settings/appSettings';
import { appHost } from '../apphost';
import browser from '../../scripts/browser';
import focusManager from '../focusManager';
import qualityoptions from '../qualityOptions';
import globalize from '../../lib/globalize';
import loading from '../loading/loading';
import Events from '../../utils/events.ts';
import toast from '../toast/toast';
import template from './playbackSettings.template.html';

import '../../elements/emby-select/emby-select';
import '../../elements/emby-checkbox/emby-checkbox';

function populateMediaSegments(container, userSettings) {
    const selectedValues = {};
    const actionOptions = Object.values(MediaSegmentAction)
        .map(action => {
            const actionLabel = globalize.translate(`MediaSegmentAction.${action}`);
            return `<option value='${action}'>${actionLabel}</option>`;
        })
        .join('');

    const segmentSettings = [
        // List the types in a logical order (and exclude "Unknown" type)
        MediaSegmentType.Intro,
        MediaSegmentType.Preview,
        MediaSegmentType.Recap,
        MediaSegmentType.Commercial,
        MediaSegmentType.Outro
    ].map(segmentType => {
        const segmentTypeLabel = globalize.translate('LabelMediaSegmentsType', globalize.translate(`MediaSegmentType.${segmentType}`));
        const id = getId(segmentType);
        selectedValues[id] = getMediaSegmentAction(userSettings, segmentType);
        return `<div class="selectContainer">
<select is="emby-select" id="${id}" class="segmentTypeAction" label="${segmentTypeLabel}">
    ${actionOptions}
</select>
</div>`;
    }).join('');

    container.innerHTML = segmentSettings;

    Object.entries(selectedValues)
        .forEach(([id, value]) => {
            const field = container.querySelector(`#${id}`);
            if (field) field.value = value;
        });
}

function fillQuality(select, isInNetwork, mediatype, maxVideoWidth) {
    const options = mediatype === 'Audio' ? qualityoptions.getAudioQualityOptions({

        currentMaxBitrate: appSettings.maxStreamingBitrate(isInNetwork, mediatype),
        isAutomaticBitrateEnabled: appSettings.enableAutomaticBitrateDetection(isInNetwork, mediatype),
        enableAuto: true

    }) : qualityoptions.getVideoQualityOptions({

        currentMaxBitrate: appSettings.maxStreamingBitrate(isInNetwork, mediatype),
        isAutomaticBitrateEnabled: appSettings.enableAutomaticBitrateDetection(isInNetwork, mediatype),
        enableAuto: true,
        maxVideoWidth

    });

    select.innerHTML = options.map(i => {
        // render empty string instead of 0 for the auto option
        return `<option value="${i.bitrate || ''}">${i.name}</option>`;
    }).join('');
}

function setMaxBitrateIntoField(select, isInNetwork, mediatype) {
    fillQuality(select, isInNetwork, mediatype);

    if (appSettings.enableAutomaticBitrateDetection(isInNetwork, mediatype)) {
        select.value = '';
    } else {
        select.value = appSettings.maxStreamingBitrate(isInNetwork, mediatype);
    }
}

function fillStillWatchingOptions(select, selectedOption) {
    select.innerHTML = Object.values(StillWatchingOptions).map(value => {
        let label;
        if (value === StillWatchingOptions.Disabled) {
            label = globalize.translate('Disabled');
        } else {
            const { count, duration: durationMs } = StillWatchingConfiguration[value];
            const duration = Math.round(durationMs / MILLISECONDS_PER_MINUTE);
            label = globalize.translate('StillWatchingOption', count, duration);
        }

        return `<option value="${value}">${label}</option>`;
    }).join('');

    select.value = selectedOption || StillWatchingOptions.Default;
}

function setMaxBitrateFromField(select, isInNetwork, mediatype) {
    if (select.value) {
        appSettings.maxStreamingBitrate(isInNetwork, mediatype, select.value);
        appSettings.enableAutomaticBitrateDetection(isInNetwork, mediatype, false);
    } else {
        appSettings.enableAutomaticBitrateDetection(isInNetwork, mediatype, true);
    }
}

function showHideQualityFields(context, user, apiClient) {
    if (user.Policy.EnableVideoPlaybackTranscoding) {
        context.querySelector('.videoQualitySection').classList.remove('hide');
    } else {
        context.querySelector('.videoQualitySection').classList.add('hide');
    }

    if (appHost.supports(AppFeature.MultiServer)) {
        context.querySelector('.fldVideoInNetworkQuality').classList.remove('hide');
        context.querySelector('.fldVideoInternetQuality').classList.remove('hide');

        if (user.Policy.EnableAudioPlaybackTranscoding) {
            context.querySelector('.musicQualitySection').classList.remove('hide');
        } else {
            context.querySelector('.musicQualitySection').classList.add('hide');
        }

        return;
    }

    apiClient.getEndpointInfo().then(endpointInfo => {
        if (endpointInfo.IsInNetwork) {
            context.querySelector('.fldVideoInNetworkQuality').classList.remove('hide');

            context.querySelector('.fldVideoInternetQuality').classList.add('hide');
            context.querySelector('.musicQualitySection').classList.add('hide');
        } else {
            context.querySelector('.fldVideoInNetworkQuality').classList.add('hide');

            context.querySelector('.fldVideoInternetQuality').classList.remove('hide');

            if (user.Policy.EnableAudioPlaybackTranscoding) {
                context.querySelector('.musicQualitySection').classList.remove('hide');
            } else {
                context.querySelector('.musicQualitySection').classList.add('hide');
            }
        }
    });
}

function loadForm(context, user, userSettings, apiClient) {
    const loggedInUserId = apiClient.getCurrentUserId();
    const userId = user.Id;

    showHideQualityFields(context, user, apiClient);

    if (browser.safari) {
        context.querySelector('.fldEnableHi10p').classList.remove('hide');
    }

    // Show hls segment length setting for webOS only, as the setting only aims to fix an issue on that platform.
    if (browser.web0s) {
        context.querySelector('.fldLimitSegmentLength').classList.remove('hide');
    }

    context.querySelector('#selectAllowedAudioChannels').value = userSettings.allowedAudioChannels();

    if (appHost.supports(AppFeature.ExternalPlayerIntent) && userId === loggedInUserId) {
        context.querySelector('.fldExternalPlayer').classList.remove('hide');
    } else {
        context.querySelector('.fldExternalPlayer').classList.add('hide');
    }

    if (userId === loggedInUserId && (user.Policy.EnableVideoPlaybackTranscoding || user.Policy.EnableAudioPlaybackTranscoding)) {
        context.querySelector('.qualitySections').classList.remove('hide');
    } else {
        context.querySelector('.qualitySections').classList.add('hide');
    }

    // Only show the Still Watching option if the plugin is loaded
    const stillWatchingPlugin = pluginManager.ofType(PluginType.PreplayIntercept).some(p => p.id === STILL_WATCHING_ID);
    context.querySelector('.fldStillWatchingOption').classList.toggle('hide', !stillWatchingPlugin);
    fillStillWatchingOptions(context.querySelector('.selectStillWatchingOption'), userSettings.stillWatchingPrompt());

    context.querySelector('.chkPreferFmp4HlsContainer').checked = userSettings.preferFmp4HlsContainer();
    context.querySelector('.chkLimitSegmentLength').checked = userSettings.limitSegmentLength();
    context.querySelector('.chkEnableDts').checked = appSettings.enableDts();
    context.querySelector('.chkEnableTrueHd').checked = appSettings.enableTrueHd();
    context.querySelector('.chkEnableHi10p').checked = appSettings.enableHi10p();
    context.querySelector('.chkEnableCinemaMode').checked = userSettings.enableCinemaMode();
    context.querySelector('#selectAudioNormalization').value = userSettings.selectAudioNormalization();
    context.querySelector('.fldAudioNormalization').classList.toggle('hide', !!browser.iOS);
    context.querySelector('.chkEnableNextVideoOverlay').checked = userSettings.enableNextVideoInfoOverlay();
    context.querySelector('.chkExternalVideoPlayer').checked = appSettings.enableSystemExternalPlayers();
    context.querySelector('.chkLimitSupportedVideoResolution').checked = appSettings.limitSupportedVideoResolution();
    context.querySelector('#selectPreferredTranscodeVideoCodec').value = appSettings.preferredTranscodeVideoCodec();
    context.querySelector('#selectPreferredTranscodeVideoAudioCodec').value = appSettings.preferredTranscodeVideoAudioCodec();
    context.querySelector('.chkDisableVbrAudioEncoding').checked = appSettings.disableVbrAudio();
    context.querySelector('.chkAlwaysRemuxFlac').checked = appSettings.alwaysRemuxFlac();
    context.querySelector('.chkAlwaysRemuxMp3').checked = appSettings.alwaysRemuxMp3();

    setMaxBitrateIntoField(context.querySelector('.selectVideoInNetworkQuality'), true, 'Video');
    setMaxBitrateIntoField(context.querySelector('.selectVideoInternetQuality'), false, 'Video');
    setMaxBitrateIntoField(context.querySelector('.selectMusicInternetQuality'), false, 'Audio');

    const selectMaxVideoWidth = context.querySelector('.selectMaxVideoWidth');
    selectMaxVideoWidth.value = appSettings.maxVideoWidth();

    const mediaSegmentContainer = context.querySelector('.mediaSegmentActionContainer');
    populateMediaSegments(mediaSegmentContainer, userSettings);

    loading.hide();
}

function saveUser(context, userSettingsInstance) {
    appSettings.enableSystemExternalPlayers(context.querySelector('.chkExternalVideoPlayer').checked);

    appSettings.maxVideoWidth(context.querySelector('.selectMaxVideoWidth').value);
    appSettings.limitSupportedVideoResolution(context.querySelector('.chkLimitSupportedVideoResolution').checked);
    appSettings.preferredTranscodeVideoCodec(context.querySelector('#selectPreferredTranscodeVideoCodec').value);
    appSettings.preferredTranscodeVideoAudioCodec(context.querySelector('#selectPreferredTranscodeVideoAudioCodec').value);

    appSettings.enableDts(context.querySelector('.chkEnableDts').checked);
    appSettings.enableTrueHd(context.querySelector('.chkEnableTrueHd').checked);

    appSettings.enableHi10p(context.querySelector('.chkEnableHi10p').checked);
    appSettings.disableVbrAudio(context.querySelector('.chkDisableVbrAudioEncoding').checked);
    appSettings.alwaysRemuxFlac(context.querySelector('.chkAlwaysRemuxFlac').checked);
    appSettings.alwaysRemuxMp3(context.querySelector('.chkAlwaysRemuxMp3').checked);

    setMaxBitrateFromField(context.querySelector('.selectVideoInNetworkQuality'), true, 'Video');
    setMaxBitrateFromField(context.querySelector('.selectVideoInternetQuality'), false, 'Video');
    setMaxBitrateFromField(context.querySelector('.selectMusicInternetQuality'), false, 'Audio');

    userSettingsInstance.allowedAudioChannels(context.querySelector('#selectAllowedAudioChannels').value);
    userSettingsInstance.stillWatchingPrompt(context.querySelector('.selectStillWatchingOption').value);
    userSettingsInstance.preferFmp4HlsContainer(context.querySelector('.chkPreferFmp4HlsContainer').checked);
    userSettingsInstance.limitSegmentLength(context.querySelector('.chkLimitSegmentLength').checked);
    userSettingsInstance.enableCinemaMode(context.querySelector('.chkEnableCinemaMode').checked);
    userSettingsInstance.selectAudioNormalization(context.querySelector('#selectAudioNormalization').value);
    userSettingsInstance.enableNextVideoInfoOverlay(context.querySelector('.chkEnableNextVideoOverlay').checked);

    const segmentTypeActions = context.querySelectorAll('.segmentTypeAction') || [];
    Array.prototype.forEach.call(segmentTypeActions, actionEl => {
        userSettingsInstance.set(actionEl.id, actionEl.value, false);
    });
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

    self.loadData();

    if (options.autoFocus) {
        focusManager.autoFocus(options.element);
    }
}

class PlaybackSettings {
    constructor(options) {
        this.options = options;
        embed(options, this);
    }

    loadData() {
        const self = this;
        const context = self.options.element;

        loading.show();

        const userId = self.options.userId;
        const apiClient = ServerConnections.getApiClient(self.options.serverId);
        const userSettings = self.options.userSettings;

        apiClient.getUser(userId).then(user => {
            userSettings.setUserInfo(userId, apiClient).then(() => {
                self.dataLoaded = true;

                loadForm(context, user, userSettings, apiClient);
            });
        });
    }

    submit() {
        onSubmit.call(this);
    }

    destroy() {
        this.options = null;
    }
}

export default PlaybackSettings;
