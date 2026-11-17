import { type MediaSourceInfo, type MediaStream } from '@jellyfin/sdk/lib/generated-client';
import { type ItemDto } from 'types/base/models/item-dto';
import { playbackManager } from 'components/playback/playbackmanager';
import { type DetailsPage, type DetailsController, getElement } from './types';
import escapeHtml from 'escape-html';

import itemHelper from 'components/itemHelper';
import mediaInfo from 'components/mediainfo/mediainfo';
import globalize from 'lib/globalize';

export function getSelectedMediaSource(page: DetailsPage, mediaSources: MediaSourceInfo[]) {
    const mediaSourceId = getElement(page, '.selectSource').value;
    return mediaSources.filter(m => m.Id === mediaSourceId)[0];
}

export function renderTrackSelections(page: DetailsPage, instance: DetailsController, item: ItemDto, forceReload: boolean = false) {
    const select = getElement(page, '.selectSource');

    if (!item.MediaSources || !itemHelper.supportsMediaSourceSelection(item) || playbackManager.getSupportedCommands()!.indexOf('PlayMediaSource') === -1 || !playbackManager.canPlay(item)) {
        getElement(page, '.trackSelections').classList.add('hide');
        select.innerHTML = '';
        getElement(page, '.selectVideo').innerHTML = '';
        getElement(page, '.selectAudio').innerHTML = '';
        getElement(page, '.selectSubtitles').innerHTML = '';
        return;
    }

    const mediaSources = item.MediaSources;
    instance._currentPlaybackMediaSources = mediaSources;

    getElement(page, '.trackSelections').classList.remove('hide');
    select.setLabel(globalize.translate('LabelVersion'));

    const currentValue = select.value;

    const selectedId = mediaSources.some(m => m.Id === currentValue) ? currentValue : mediaSources[0].Id!;
    select.innerHTML = mediaSources.map(function (v) {
        const selected = v.Id === selectedId ? ' selected' : '';
        return '<option value="' + v.Id + '"' + selected + '>' + escapeHtml(v.Name) + '</option>';
    }).join('');

    if (mediaSources.length > 1) {
        getElement(page, '.selectSourceContainer').classList.remove('hide');
    } else {
        getElement(page, '.selectSourceContainer').classList.add('hide');
    }

    if (select.value !== currentValue || forceReload) {
        renderVideoSelections(page, mediaSources);
        renderAudioSelections(page, mediaSources);
        renderSubtitleSelections(page, mediaSources);
    }
}

export function getTrackLabel(stream: MediaStream, mediaSource: MediaSourceInfo) {
    const parts = [];
    const resolution = stream.Type === 'Video' ? mediaInfo.getResolutionText(stream) : null;
    if (resolution) parts.push(resolution);
    const language = stream.LocalizedLanguage || stream.Language;
    if (language) parts.push(language);
    if (stream.Codec) parts.push(stream.Codec.toUpperCase());
    if (stream.Type === 'Video' && stream.VideoRangeType && stream.VideoRangeType !== 'SDR') {
        parts.push(stream.VideoRangeType);
    }
    if (stream.ChannelLayout) {
        parts.push(stream.ChannelLayout);
    } else if (stream.Channels) {
        parts.push(stream.Channels + ' ' + globalize.translate('MediaInfoChannels'));
    }
    appendTrackFlags(parts, stream);

    if (!parts.length) {
        parts.push(globalize.translate(stream.Type === 'Subtitle' ? 'Subtitles' : stream.Type!)
            + (stream.Index == null ? '' : ' ' + (stream.Index + 1)));
    }

    // DisplayTitle may contain a release name. Only a short, distinct custom Title
    // supplements the structured fields; never infer track properties from filenames.
    const title = stream.Title?.trim();
    if (title && title.length <= 60 && title !== mediaSource.Name
        && !parts.some(part => part.toLowerCase() === title.toLowerCase())) {
        parts.push(title);
    }
    return parts.join(' · ');
}

export function renderVideoSelections(page: DetailsPage, mediaSources: MediaSourceInfo[]) {
    const mediaSource = getSelectedMediaSource(page, mediaSources);

    const tracks = mediaSource.MediaStreams!.filter(function (m) {
        return m.Type === 'Video';
    });

    const select = getElement(page, '.selectVideo');
    select.setLabel(globalize.translate('Video'));
    const selectedId = tracks.length ? tracks[0].Index : -1;
    select.innerHTML = tracks.map(function (v) {
        const selected = v.Index === selectedId ? ' selected' : '';
        return `<option value="${v.Index}" ${selected}>${escapeHtml(getTrackLabel(v, mediaSource))}</option>`;
    }).join('');
    select.setAttribute('disabled', 'disabled');

    if (tracks.length) {
        getElement(page, '.selectVideoContainer').classList.remove('hide');
    } else {
        getElement(page, '.selectVideoContainer').classList.add('hide');
    }
}

export function renderAudioSelections(page: DetailsPage, mediaSources: MediaSourceInfo[]) {
    const mediaSource = getSelectedMediaSource(page, mediaSources);

    const tracks = mediaSource.MediaStreams!.filter(function (m) {
        return m.Type === 'Audio';
    });
    tracks.sort(itemHelper.sortTracks);
    const select = getElement(page, '.selectAudio');
    select.setLabel(globalize.translate('Audio'));
    const selectedId = mediaSource.DefaultAudioStreamIndex;
    select.innerHTML = tracks.map(function (v) {
        const selected = v.Index === selectedId ? ' selected' : '';
        return `<option value="${v.Index}" ${selected}>${escapeHtml(getTrackLabel(v, mediaSource))}</option>`;
    }).join('');

    if (tracks.length > 1) {
        select.removeAttribute('disabled');
    } else {
        select.setAttribute('disabled', 'disabled');
    }

    if (tracks.length) {
        getElement(page, '.selectAudioContainer').classList.remove('hide');
    } else {
        getElement(page, '.selectAudioContainer').classList.add('hide');
    }
}

export function renderSubtitleSelections(page: DetailsPage, mediaSources: MediaSourceInfo[]) {
    const mediaSource = getSelectedMediaSource(page, mediaSources);

    const tracks = mediaSource.MediaStreams!.filter(function (m) {
        return m.Type === 'Subtitle';
    });
    tracks.sort(itemHelper.sortTracks);
    const select = getElement(page, '.selectSubtitles');
    select.setLabel(globalize.translate('Subtitles'));
    const selectedId = mediaSource.DefaultSubtitleStreamIndex == null ? -1 : mediaSource.DefaultSubtitleStreamIndex;

    let selected = selectedId === -1 ? ' selected' : '';
    select.innerHTML = '<option value="-1">' + globalize.translate('Off') + '</option>' + tracks.map(function (v) {
        selected = v.Index === selectedId ? ' selected' : '';
        return `<option value="${v.Index}" ${selected}>${escapeHtml(getTrackLabel(v, mediaSource))}</option>`;
    }).join('');

    if (tracks.length > 0) {
        select.removeAttribute('disabled');
    } else {
        select.setAttribute('disabled', 'disabled');
    }

    if (tracks.length) {
        getElement(page, '.selectSubtitlesContainer').classList.remove('hide');
    } else {
        getElement(page, '.selectSubtitlesContainer').classList.add('hide');
    }
}

function appendTrackFlags(parts: string[], stream: MediaStream) {
    if (stream.IsDefault) parts.push(globalize.translate('Default'));
    if (stream.IsForced) parts.push(globalize.translate('LabelIsForced'));
    if (stream.IsHearingImpaired) parts.push(globalize.translate('HearingImpairedShort'));
    if (stream.IsExternal) parts.push(stream.LocalizedExternal || globalize.translate('MediaInfoExternal'));
}
