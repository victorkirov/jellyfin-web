import escapeHtml from 'escape-html';
import datetime from 'scripts/datetime';
import { TICKS_PER_MILLISECOND } from 'constants/time';
import type { ApiClient } from 'jellyfin-apiclient';
import type { ChapterInfo, TrickplayInfoDto } from '@jellyfin/sdk/lib/generated-client';
import type { PlaybackItem } from 'lib/playback/types';
import type { PlaybackPlayer } from 'types/plugin';

export function updateTrickplayBubbleHtml(apiClient: ApiClient, trickplayInfo: TrickplayInfoDto, item: PlaybackItem, mediaSourceId: string, bubble: HTMLElement, positionTicks: number) {
    let doFullUpdate = false;
    let chapterThumbContainer = bubble.querySelector<HTMLElement>('.chapterThumbContainer')!;
    let chapterThumb;
    let chapterThumbText;
    let chapterThumbName;

    // Create bubble elements if they don't already exist
    if (chapterThumbContainer) {
        chapterThumb = chapterThumbContainer.querySelector<HTMLElement>('.chapterThumbWrapper')!;
        chapterThumbText = chapterThumbContainer.querySelector<HTMLElement>('h2.chapterThumbText')!;
        chapterThumbName = chapterThumbContainer.querySelector<HTMLElement>('div.chapterThumbText')!;
    } else {
        doFullUpdate = true;

        chapterThumbContainer = document.createElement('div');
        chapterThumbContainer.classList.add('chapterThumbContainer');
        chapterThumbContainer.style.overflow = 'hidden';

        chapterThumb = document.createElement('div');
        chapterThumb.classList.add('chapterThumbWrapper');
        chapterThumb.style.overflow = 'hidden';
        chapterThumb.style.width = trickplayInfo.Width! + 'px';
        chapterThumb.style.height = trickplayInfo.Height! + 'px';
        chapterThumbContainer.appendChild(chapterThumb);

        const chapterThumbTextContainer = document.createElement('div');
        chapterThumbTextContainer.classList.add('chapterThumbTextContainer');
        chapterThumbContainer.appendChild(chapterThumbTextContainer);

        chapterThumbName = document.createElement('div');
        chapterThumbName.classList.add('chapterThumbText', 'chapterThumbText-dim');
        chapterThumbTextContainer.appendChild(chapterThumbName);

        chapterThumbText = document.createElement('h2');
        chapterThumbText.classList.add('chapterThumbText');
        chapterThumbTextContainer.appendChild(chapterThumbText);
    }

    let chapter;
    for (const currentChapter of item.Chapters || []) {
        if (positionTicks < currentChapter.StartPositionTicks!) {
            break;
        }

        chapter = currentChapter;
    }

    // Update trickplay values
    const currentTimeMs = positionTicks / TICKS_PER_MILLISECOND;
    const currentTile = Math.floor(currentTimeMs / trickplayInfo.Interval!);

    const tileSize = trickplayInfo.TileWidth! * trickplayInfo.TileHeight!;
    const tileOffset = currentTile % tileSize;
    const index = Math.floor(currentTile / tileSize);

    const tileOffsetX = tileOffset % trickplayInfo.TileWidth!;
    const tileOffsetY = Math.floor(tileOffset / trickplayInfo.TileWidth!);
    const offsetX = -(tileOffsetX * trickplayInfo.Width!);
    const offsetY = -(tileOffsetY * trickplayInfo.Height!);

    const imgSrc = apiClient.getUrl('Videos/' + item.Id + '/Trickplay/' + trickplayInfo.Width! + '/' + index + '.jpg', {
        ApiKey: apiClient.accessToken(),
        MediaSourceId: mediaSourceId
    });

    chapterThumb.style.backgroundImage = `url('${imgSrc}')`;
    chapterThumb.style.backgroundPositionX = offsetX + 'px';
    chapterThumb.style.backgroundPositionY = offsetY + 'px';

    chapterThumbText.textContent = datetime.getDisplayRunningTime(positionTicks);
    chapterThumbName.textContent = chapter?.Name || '';

    // Set bubble innerHTML if container isn't part of DOM
    if (doFullUpdate) {
        bubble.innerHTML = chapterThumbContainer.outerHTML;
    }

    return true;
}

function getImgUrl(item: PlaybackItem, chapter: ChapterInfo, index: number, maxWidth: number, apiClient: ApiClient, currentPlayer: PlaybackPlayer | null | undefined) {
    if (chapter.ImageTag) {
        const chapterItemId = currentPlayer?.streamInfo?.mediaSource?.Id || item.Id;

        return apiClient.getScaledImageUrl(chapterItemId!, {
            maxWidth: maxWidth,
            tag: chapter.ImageTag,
            type: 'Chapter',
            index: index
        });
    }

    return null;
}

export function getChapterBubbleHtml(apiClient: ApiClient, item: PlaybackItem, chapters: ChapterInfo[], positionTicks: number, currentPlayer: PlaybackPlayer | null | undefined) {
    let chapter;
    let index = -1;

    for (let i = 0, length = chapters.length; i < length; i++) {
        const currentChapter = chapters[i];

        if (positionTicks >= currentChapter.StartPositionTicks!) {
            chapter = currentChapter;
            index = i;
        }
    }

    if (!chapter) {
        return null;
    }

    const src = getImgUrl(item, chapter, index, 400, apiClient, currentPlayer);
    let html = '<div class="chapterThumbContainer chapterBubblePosition">';

    if (src) {
        html += '<img class="chapterThumb" src="' + src + '" />';
        html += '<div class="chapterThumbTextContainer">';
    } else {
        html += '<div class="chapterThumbTextContainer chapterBubblePosition">';
    }

    html += '<div class="chapterThumbText chapterThumbText-dim">';
    html += escapeHtml(chapter.Name!);
    html += '</div>';
    html += '<h2 class="chapterThumbText">';
    html += datetime.getDisplayRunningTime(positionTicks);
    html += '</h2>';
    html += '</div>';

    return html + '</div>';
}

export function getTrickplayResolution(item: PlaybackItem, mediaSourceId: string): TrickplayInfoDto | null {
    const resolutions = item.Trickplay?.[mediaSourceId];
    if (!resolutions) return null;

    let bestWidth: number | undefined;
    const maxWidth = window.screen.width * window.devicePixelRatio * 0.2;
    for (const [, info] of Object.entries(resolutions)) {
        if (!bestWidth
            || (info.Width! < bestWidth && bestWidth > maxWidth)
            || (info.Width! > bestWidth && info.Width! <= maxWidth)) {
            bestWidth = info.Width;
        }
    }
    return bestWidth ? resolutions[bestWidth] : null;
}
