import isEqual from 'lodash-es/isEqual';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import browser from '../../scripts/browser';
import { playbackManager } from '../playback/playbackmanager';
import dom from '../../utils/dom';
import * as userSettings from '../../scripts/settings/userSettings';

import './backdrop.scss';

import Backdrop from './backdropImage';
import type { ItemDto } from 'types/base/models/item-dto';
import type { ImageOptions } from 'lib/jellyfin-apiclient/connectionTypes';

function enableRotation() {
    return !browser.tv;
}

let backdropContainer: HTMLElement | null;
function getBackdropContainer() {
    if (!backdropContainer) {
        backdropContainer = document.querySelector<HTMLElement>('.backdropContainer');
    }

    if (!backdropContainer) {
        backdropContainer = document.createElement('div');
        backdropContainer.classList.add('backdropContainer');
        document.body.insertBefore(backdropContainer, document.body.firstChild);
    }

    return backdropContainer;
}

export function clearBackdrop(clearAll?: boolean) {
    clearRotation();

    if (currentLoadingBackdrop) {
        currentLoadingBackdrop.destroy();
        currentLoadingBackdrop = null;
    }

    // Remove backdrop images from each slot element
    document.querySelectorAll<HTMLElement>('.backdropImage').forEach(elem => {
        elem.classList.remove('displayingBackdropImage');
        elem.style.backgroundImage = 'none';
        elem.removeAttribute('data-url');
    });

    if (clearAll) {
        hasExternalBackdrop = false;
    }

    internalBackdrop(false);
}

let backgroundContainer: HTMLElement | null;
function getBackgroundContainer() {
    if (!backgroundContainer) {
        backgroundContainer = document.querySelector<HTMLElement>('.backgroundContainer');
    }
    return backgroundContainer!;
}

function setBackgroundContainerBackgroundEnabled() {
    if (hasInternalBackdrop || hasExternalBackdrop) {
        getBackgroundContainer().classList.add('withBackdrop');
    } else {
        getBackgroundContainer().classList.remove('withBackdrop');
    }
}

let hasInternalBackdrop = false;
function internalBackdrop(isEnabled: boolean) {
    hasInternalBackdrop = isEnabled;
    setBackgroundContainerBackgroundEnabled();
}

let hasExternalBackdrop = false;
export function externalBackdrop(isEnabled: boolean) {
    hasExternalBackdrop = isEnabled;
    setBackgroundContainerBackgroundEnabled();
}

let currentLoadingBackdrop: Backdrop | null;
let currentBackdropSlot = 0;
function setBackdropImage(url: string) {
    const elem = getBackdropContainer();
    const existingBackdropImage = elem.querySelector('.displayingBackdropImage');
    // If the current backdrop image is the same as the new one, do nothing
    if (existingBackdropImage && existingBackdropImage.getAttribute('data-url') === url) {
        return;
    }

    const instance = new Backdrop(internalBackdrop);
    instance.load(url, currentBackdropSlot);
    currentLoadingBackdrop = instance;
    currentBackdropSlot = 1 - currentBackdropSlot;
}

function getItemImageUrls(item: ItemDto & { BackdropItemId?: string }, imageOptions?: ImageOptions) {
    imageOptions = imageOptions || {};

    const apiClient = ServerConnections.getApiClient(item.ServerId);
    if (item.BackdropImageTags && item.BackdropImageTags.length > 0) {
        return item.BackdropImageTags.map((imgTag, index) => {
            return apiClient!.getScaledImageUrl(item.BackdropItemId || item.Id!, Object.assign(imageOptions, {
                type: 'Backdrop',
                tag: imgTag,
                maxWidth: dom.getScreenWidth(),
                index: index
            }));
        });
    }

    if (item.ParentBackdropItemId && item.ParentBackdropImageTags?.length) {
        return item.ParentBackdropImageTags.map((imgTag, index) => {
            return apiClient!.getScaledImageUrl(item.ParentBackdropItemId!, Object.assign(imageOptions, {
                type: 'Backdrop',
                tag: imgTag,
                maxWidth: dom.getScreenWidth(),
                index: index
            }));
        });
    }

    return [];
}

function getImageUrls(items: ItemDto[], imageOptions?: ImageOptions) {
    const list: string[] = [];
    const onImg = (img: string) => {
        list.push(img);
    };

    for (let i = 0, length = items.length; i < length; i++) {
        const itemImages = getItemImageUrls(items[i], imageOptions);
        itemImages.forEach(onImg);
    }

    return list;
}

function enabled() {
    return userSettings.enableBackdrops();
}

let rotationInterval: ReturnType<typeof setInterval> | null;
let currentRotatingImages: string[] = [];
let currentRotationIndex = -1;
export function setBackdrops(items: ItemDto[], imageOptions?: ImageOptions, isEnabled = false) {
    if (isEnabled || enabled()) {
        const images = getImageUrls(items, imageOptions);

        if (images.length) {
            setBackdropImages(images);
        } else {
            clearBackdrop();
        }
    }
}

export function setBackdropImages(images: string[]) {
    if (isEqual(images, currentRotatingImages)) {
        return;
    }

    clearRotation();

    currentRotatingImages = images;
    currentRotationIndex = -1;

    if (images.length > 1 && enableRotation()) {
        rotationInterval = setInterval(onRotationInterval, 10000);
    }

    onRotationInterval();
}

function onRotationInterval() {
    if (playbackManager.isPlayingLocally(['Video'])) {
        return;
    }

    let newIndex = currentRotationIndex + 1;
    if (newIndex >= currentRotatingImages.length) {
        newIndex = 0;
    }

    currentRotationIndex = newIndex;
    const currentImage = currentRotatingImages[newIndex];
    setBackdropImage(currentImage);
}

function clearRotation() {
    const interval = rotationInterval;
    if (interval) {
        clearInterval(interval);
    }

    rotationInterval = null;
    currentRotatingImages = [];
    currentRotationIndex = -1;
}

/**
 * @enum TransparencyLevel
 */
export const TRANSPARENCY_LEVEL = {
    Full: 'full',
    Backdrop: 'backdrop',
    None: 'none'
};

/**
 * Sets the backdrop, background, and document transparency
 * @param {TransparencyLevel} level The level of transparency
 */
export function setBackdropTransparency(level: string | number) {
    const backdropElem = getBackdropContainer();
    const backgroundElem = getBackgroundContainer();

    if (level === TRANSPARENCY_LEVEL.Full || level === 2) {
        clearBackdrop(true);
        document.documentElement.classList.add('transparentDocument');
        backgroundElem.classList.add('backgroundContainer-transparent');
        backdropElem.classList.add('hide');
    } else if (level === TRANSPARENCY_LEVEL.Backdrop || level === 1) {
        externalBackdrop(true);
        document.documentElement.classList.add('transparentDocument');
        backgroundElem.classList.add('backgroundContainer-transparent');
        backdropElem.classList.add('hide');
    } else {
        externalBackdrop(false);
        document.documentElement.classList.remove('transparentDocument');
        backgroundElem.classList.remove('backgroundContainer-transparent');
        backdropElem.classList.remove('hide');
    }
}
