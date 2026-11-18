import type { UserSettings } from 'scripts/settings/userSettings';
import type { UserDto } from '@jellyfin/sdk/lib/generated-client/models/user-dto';
import type { ConnectionClient } from 'lib/jellyfin-apiclient/connectionTypes';
import { MediaSegmentType } from '@jellyfin/sdk/lib/generated-client/models/media-segment-type';

import { MediaSegmentAction } from 'lib/playback/constants/mediaSegmentAction';
import { getId, getMediaSegmentAction } from 'lib/playback/utils/mediaSegmentSettings';
import { pluginManager } from 'components/pluginManager';
import { AppFeature } from 'constants/appFeature';
import { PluginType } from 'constants/pluginType';
import { MILLISECONDS_PER_MINUTE } from 'constants/time';
import { ID as STILL_WATCHING_ID, StillWatchingConfiguration, StillWatchingOptions } from 'plugins/stillWatching/constants';

import appSettings from '../../scripts/settings/appSettings';
import { appHost } from '../apphost';
import browser from '../../scripts/browser';
import qualityoptions from '../qualityOptions';
import globalize from '../../lib/globalize';

import '../select/emby-select';
import '../../elements/emby-checkbox/emby-checkbox';
import '../../elements/emby-collapse/emby-collapse.scss';

function populateMediaSegments(container: HTMLElement, userSettings: UserSettings) {
    const selectedValues: Record<string, string> = {};
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
            const field = container.querySelector<HTMLSelectElement>(`#${id}`)!;
            if (field) field.value = value;
        });
}

function fillQuality(select: HTMLSelectElement, isInNetwork: boolean, mediatype: string, maxVideoWidth?: number) {
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
        return `<option value="${i!.bitrate || ''}">${i!.name}</option>`;
    }).join('');
}

function setMaxBitrateIntoField(select: HTMLSelectElement, isInNetwork: boolean, mediatype: string) {
    fillQuality(select, isInNetwork, mediatype);

    if (appSettings.enableAutomaticBitrateDetection(isInNetwork, mediatype)) {
        select.value = '';
    } else {
        select.value = String(appSettings.maxStreamingBitrate(isInNetwork, mediatype));
    }
}

function fillStillWatchingOptions(select: HTMLSelectElement, selectedOption: string) {
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

function setMaxBitrateFromField(select: HTMLSelectElement, isInNetwork: boolean, mediatype: string) {
    if (select.value) {
        appSettings.maxStreamingBitrate(isInNetwork, mediatype, select.value);
        appSettings.enableAutomaticBitrateDetection(isInNetwork, mediatype, false);
    } else {
        appSettings.enableAutomaticBitrateDetection(isInNetwork, mediatype, true);
    }
}

function showHideQualityFields(context: HTMLElement, user: UserDto, apiClient: ConnectionClient) {
    if (user.Policy!.EnableVideoPlaybackTranscoding) {
        context.querySelector<HTMLElement>('.videoQualitySection')!.classList.remove('hide');
    } else {
        context.querySelector<HTMLElement>('.videoQualitySection')!.classList.add('hide');
    }

    if (appHost.supports(AppFeature.MultiServer)) {
        context.querySelector<HTMLElement>('.fldVideoInNetworkQuality')!.classList.remove('hide');
        context.querySelector<HTMLElement>('.fldVideoInternetQuality')!.classList.remove('hide');

        if (user.Policy!.EnableAudioPlaybackTranscoding) {
            context.querySelector<HTMLElement>('.musicQualitySection')!.classList.remove('hide');
        } else {
            context.querySelector<HTMLElement>('.musicQualitySection')!.classList.add('hide');
        }

        return Promise.resolve();
    }

    return apiClient.getEndpointInfo().then(endpointInfo => {
        if (endpointInfo.IsInNetwork) {
            context.querySelector<HTMLElement>('.fldVideoInNetworkQuality')!.classList.remove('hide');

            context.querySelector<HTMLElement>('.fldVideoInternetQuality')!.classList.add('hide');
            context.querySelector<HTMLElement>('.musicQualitySection')!.classList.add('hide');
        } else {
            context.querySelector<HTMLElement>('.fldVideoInNetworkQuality')!.classList.add('hide');

            context.querySelector<HTMLElement>('.fldVideoInternetQuality')!.classList.remove('hide');

            if (user.Policy!.EnableAudioPlaybackTranscoding) {
                context.querySelector<HTMLElement>('.musicQualitySection')!.classList.remove('hide');
            } else {
                context.querySelector<HTMLElement>('.musicQualitySection')!.classList.add('hide');
            }
        }
    });
}

export function loadForm(context: HTMLElement, user: UserDto, userSettings: UserSettings, apiClient: ConnectionClient) {
    const loggedInUserId = apiClient.getCurrentUserId();
    const userId = user.Id;

    const visibility = showHideQualityFields(context, user, apiClient);

    if (browser.safari) {
        context.querySelector<HTMLElement>('.fldEnableHi10p')!.classList.remove('hide');
    }

    // Show hls segment length setting for webOS only, as the setting only aims to fix an issue on that platform.
    if (browser.web0s) {
        context.querySelector<HTMLElement>('.fldLimitSegmentLength')!.classList.remove('hide');
    }

    context.querySelector<HTMLSelectElement>('#selectAllowedAudioChannels')!.value = userSettings.allowedAudioChannels();

    if (appHost.supports(AppFeature.ExternalPlayerIntent) && userId === loggedInUserId) {
        context.querySelector<HTMLElement>('.fldExternalPlayer')!.classList.remove('hide');
    } else {
        context.querySelector<HTMLElement>('.fldExternalPlayer')!.classList.add('hide');
    }

    if (userId === loggedInUserId && (user.Policy!.EnableVideoPlaybackTranscoding || user.Policy!.EnableAudioPlaybackTranscoding)) {
        context.querySelector<HTMLElement>('.qualitySections')!.classList.remove('hide');
    } else {
        context.querySelector<HTMLElement>('.qualitySections')!.classList.add('hide');
    }

    // Only show the Still Watching option if the plugin is loaded
    const stillWatchingPlugin = pluginManager.ofType(PluginType.PreplayIntercept).some(p => p.id === STILL_WATCHING_ID);
    context.querySelector<HTMLElement>('.fldStillWatchingOption')!.classList.toggle('hide', !stillWatchingPlugin);
    fillStillWatchingOptions(context.querySelector<HTMLSelectElement>('.selectStillWatchingOption')!, userSettings.stillWatchingPrompt());

    context.querySelector<HTMLInputElement>('.chkPreferFmp4HlsContainer')!.checked = userSettings.preferFmp4HlsContainer();
    context.querySelector<HTMLInputElement>('.chkLimitSegmentLength')!.checked = userSettings.limitSegmentLength();
    context.querySelector<HTMLInputElement>('.chkEnableDts')!.checked = appSettings.enableDts();
    context.querySelector<HTMLInputElement>('.chkEnableTrueHd')!.checked = appSettings.enableTrueHd();
    context.querySelector<HTMLInputElement>('.chkEnableHi10p')!.checked = appSettings.enableHi10p();
    context.querySelector<HTMLInputElement>('.chkEnableCinemaMode')!.checked = userSettings.enableCinemaMode();
    context.querySelector<HTMLSelectElement>('#selectAudioNormalization')!.value = userSettings.selectAudioNormalization();
    context.querySelector<HTMLElement>('.fldAudioNormalization')!.classList.toggle('hide', !!browser.iOS);
    context.querySelector<HTMLInputElement>('.chkEnableNextVideoOverlay')!.checked = userSettings.enableNextVideoInfoOverlay();
    context.querySelector<HTMLInputElement>('.chkExternalVideoPlayer')!.checked = appSettings.enableSystemExternalPlayers();
    context.querySelector<HTMLInputElement>('.chkLimitSupportedVideoResolution')!.checked = appSettings.limitSupportedVideoResolution();
    context.querySelector<HTMLSelectElement>('#selectPreferredTranscodeVideoCodec')!.value = appSettings.preferredTranscodeVideoCodec();
    context.querySelector<HTMLSelectElement>('#selectPreferredTranscodeVideoAudioCodec')!.value = appSettings.preferredTranscodeVideoAudioCodec();
    context.querySelector<HTMLInputElement>('.chkDisableVbrAudioEncoding')!.checked = appSettings.disableVbrAudio();
    context.querySelector<HTMLInputElement>('.chkAlwaysRemuxFlac')!.checked = appSettings.alwaysRemuxFlac();
    context.querySelector<HTMLInputElement>('.chkAlwaysRemuxMp3')!.checked = appSettings.alwaysRemuxMp3();

    setMaxBitrateIntoField(context.querySelector<HTMLSelectElement>('.selectVideoInNetworkQuality')!, true, 'Video');
    setMaxBitrateIntoField(context.querySelector<HTMLSelectElement>('.selectVideoInternetQuality')!, false, 'Video');
    setMaxBitrateIntoField(context.querySelector<HTMLSelectElement>('.selectMusicInternetQuality')!, false, 'Audio');

    const selectMaxVideoWidth = context.querySelector<HTMLSelectElement>('.selectMaxVideoWidth')!;
    selectMaxVideoWidth.value = String(appSettings.maxVideoWidth());

    const mediaSegmentContainer = context.querySelector<HTMLElement>('.mediaSegmentActionContainer')!;
    populateMediaSegments(mediaSegmentContainer, userSettings);

    return visibility;
}

export function saveUser(context: HTMLElement, userSettingsInstance: UserSettings) {
    appSettings.enableSystemExternalPlayers(context.querySelector<HTMLInputElement>('.chkExternalVideoPlayer')!.checked);

    appSettings.maxVideoWidth(context.querySelector<HTMLSelectElement>('.selectMaxVideoWidth')!.value as unknown as number);
    appSettings.limitSupportedVideoResolution(context.querySelector<HTMLInputElement>('.chkLimitSupportedVideoResolution')!.checked);
    appSettings.preferredTranscodeVideoCodec(context.querySelector<HTMLSelectElement>('#selectPreferredTranscodeVideoCodec')!.value);
    appSettings.preferredTranscodeVideoAudioCodec(context.querySelector<HTMLSelectElement>('#selectPreferredTranscodeVideoAudioCodec')!.value);

    appSettings.enableDts(context.querySelector<HTMLInputElement>('.chkEnableDts')!.checked);
    appSettings.enableTrueHd(context.querySelector<HTMLInputElement>('.chkEnableTrueHd')!.checked);

    appSettings.enableHi10p(context.querySelector<HTMLInputElement>('.chkEnableHi10p')!.checked);
    appSettings.disableVbrAudio(context.querySelector<HTMLInputElement>('.chkDisableVbrAudioEncoding')!.checked);
    appSettings.alwaysRemuxFlac(context.querySelector<HTMLInputElement>('.chkAlwaysRemuxFlac')!.checked);
    appSettings.alwaysRemuxMp3(context.querySelector<HTMLInputElement>('.chkAlwaysRemuxMp3')!.checked);

    setMaxBitrateFromField(context.querySelector<HTMLSelectElement>('.selectVideoInNetworkQuality')!, true, 'Video');
    setMaxBitrateFromField(context.querySelector<HTMLSelectElement>('.selectVideoInternetQuality')!, false, 'Video');
    setMaxBitrateFromField(context.querySelector<HTMLSelectElement>('.selectMusicInternetQuality')!, false, 'Audio');

    userSettingsInstance.allowedAudioChannels(context.querySelector<HTMLSelectElement>('#selectAllowedAudioChannels')!.value);
    userSettingsInstance.stillWatchingPrompt(context.querySelector<HTMLSelectElement>('.selectStillWatchingOption')!.value);
    userSettingsInstance.preferFmp4HlsContainer(context.querySelector<HTMLInputElement>('.chkPreferFmp4HlsContainer')!.checked);
    userSettingsInstance.limitSegmentLength(context.querySelector<HTMLInputElement>('.chkLimitSegmentLength')!.checked);
    userSettingsInstance.enableCinemaMode(context.querySelector<HTMLInputElement>('.chkEnableCinemaMode')!.checked);
    userSettingsInstance.selectAudioNormalization(context.querySelector<HTMLSelectElement>('#selectAudioNormalization')!.value);
    userSettingsInstance.enableNextVideoInfoOverlay(context.querySelector<HTMLInputElement>('.chkEnableNextVideoOverlay')!.checked);

    const segmentTypeActions = context.querySelectorAll<HTMLSelectElement>('.segmentTypeAction') || [];
    segmentTypeActions.forEach(actionEl => {
        userSettingsInstance.set(actionEl.id, actionEl.value, false);
    });
}

