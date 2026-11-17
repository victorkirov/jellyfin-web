import globalize from '../../lib/globalize';

export default function getHtml() {
    let html = '';

    html += '<div class="flex flex-direction-column flex-grow">';

    html += '<h2 class="upNextDialog-nextVideoText" style="margin:.25em 0;">&nbsp;</h2>';

    html += '<h3 class="upNextDialog-title" style="margin:.25em 0 .5em;"></h3>';

    html += '<div class="flex flex-direction-row upNextDialog-mediainfo">';
    html += '</div>';

    html += '<div class="flex flex-direction-row upNextDialog-buttons" style="margin-top:1em;">';

    html += '<button type="button" is="emby-button" class="raised raised-mini btnStartNow upNextDialog-button">';
    html += globalize.translate('HeaderStartNow');
    html += '</button>';

    html += '<button type="button" is="emby-button" class="raised raised-mini btnHide upNextDialog-button">';
    html += globalize.translate('Hide');
    html += '</button>';

    // buttons
    html += '</div>';

    // main
    html += '</div>';

    return html;
}

