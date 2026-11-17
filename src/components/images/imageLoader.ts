import * as lazyLoader from '../lazyLoader/lazyLoaderIntersectionObserver';
import * as userSettings from '../../scripts/settings/userSettings';
import './style.scss';

import { itemBlurhashing } from './blurhash';

type ImageEntry = { target: Element; isIntersecting: boolean };
const imageOptions = new WeakMap<Element, { enableBlurhash: boolean; enableFastFadein: boolean }>();

export function lazyImage(elem: HTMLElement, source = elem.getAttribute('data-src')) {
    if (!source) {
        return;
    }

    fillImageElement(elem, source);
}

export function fillImage(entry: ImageEntry) {
    if (!entry) {
        throw new Error('entry cannot be null');
    }
    const target = entry.target as HTMLElement;
    let source;

    if (target) {
        source = target.getAttribute('data-src');
    } else {
        source = entry;
    }

    if (entry.isIntersecting) {
        const options = imageOptions.get(target);
        if (options?.enableBlurhash) {
            blurhashImage(target);
        }
        if (source) {
            fillImageElement(target, source as string, options?.enableFastFadein);
        }
    } else if (!source) {
        emptyImageElement(target);
    }
}

function blurhashImage(target: HTMLElement) {
    const hash = target.getAttribute('data-blurhash');
    if (!target.classList.contains('blurhashed') && !target.classList.contains('non-blurhashable')) {
        if (hash) {
            itemBlurhashing(target, hash);
        } else {
            target.classList.add('non-blurhashable');
        }
    }
}

function onAnimationEnd(event: Event) {
    const elem = event.target as HTMLElement;
    requestAnimationFrame(() => {
        const canvas = elem.previousSibling as HTMLElement | null;
        if (elem.classList.contains('blurhashed') && canvas?.tagName === 'CANVAS') {
            canvas.classList.add('lazy-hidden');
        }

        // HACK: Hide the content of the card padder
        elem.parentNode?.querySelector('.cardPadder')?.classList.add('lazy-hidden-children');
    });
    elem.removeEventListener('animationend', onAnimationEnd);
}

function fillImageElement(elem: HTMLElement, url: string | undefined, enableFastFadein = userSettings.enableFastFadein()) {
    if (url === undefined) {
        throw new TypeError('url cannot be undefined');
    }

    const preloaderImg = new Image();
    preloaderImg.src = url;

    elem.classList.add('lazy-hidden');
    elem.addEventListener('animationend', onAnimationEnd);

    preloaderImg.addEventListener('load', () => {
        requestAnimationFrame(() => {
            if (elem.tagName !== 'IMG') {
                elem.style.backgroundImage = "url('" + url + "')";
            } else {
                elem.setAttribute('src', url);
            }
            elem.removeAttribute('data-src');

            if (enableFastFadein) {
                elem.classList.add('lazy-image-fadein-fast');
            } else {
                elem.classList.add('lazy-image-fadein');
            }
            elem.classList.remove('lazy-hidden');
        });
    });
}

function emptyImageElement(elem: HTMLElement) {
    elem.removeEventListener('animationend', onAnimationEnd);
    const canvas = elem.previousSibling as HTMLElement | null;
    if (canvas?.tagName === 'CANVAS') {
        canvas.classList.remove('lazy-hidden');
    }

    // HACK: Unhide the content of the card padder
    elem.parentNode?.querySelector('.cardPadder')?.classList.remove('lazy-hidden-children');

    let url;

    if (elem.tagName !== 'IMG') {
        url = elem.style.backgroundImage.slice(4, -1).replace(/"/g, '');
        elem.style.backgroundImage = 'none';
    } else {
        url = elem.getAttribute('src');
        elem.setAttribute('src', '');
    }
    elem.setAttribute('data-src', url!);

    elem.classList.remove('lazy-image-fadein-fast', 'lazy-image-fadein');
    elem.classList.add('lazy-hidden');
}

export function lazyChildren(elem: Element) {
    const options = {
        enableBlurhash: userSettings.enableBlurhash(),
        enableFastFadein: userSettings.enableFastFadein()
    };
    for (const lazyElem of elem.querySelectorAll<HTMLElement>('.lazy')) {
        imageOptions.set(lazyElem, options);
    }

    lazyLoader.lazyChildren(elem, fillImage);
}

export function getPrimaryImageAspectRatio(items: { PrimaryImageAspectRatio?: number | null }[]) {
    const values = [];

    for (let i = 0, length = items.length; i < length; i++) {
        const ratio = items[i].PrimaryImageAspectRatio || 0;

        if (!ratio) {
            continue;
        }

        values[values.length] = ratio;
    }

    if (!values.length) {
        return null;
    }

    // Use the median
    values.sort(function (a, b) {
        return a - b;
    });

    const half = Math.floor(values.length / 2);

    let result;

    if (values.length % 2) {
        result = values[half];
    } else {
        result = (values[half - 1] + values[half]) / 2.0;
    }

    // If really close to 2:3 (poster image), just return 2:3
    const aspect2x3 = 2 / 3;
    if (Math.abs(aspect2x3 - result) <= 0.15) {
        return aspect2x3;
    }

    // If really close to 16:9 (episode image), just return 16:9
    const aspect16x9 = 16 / 9;
    if (Math.abs(aspect16x9 - result) <= 0.2) {
        return aspect16x9;
    }

    // If really close to 1 (square image), just return 1
    if (Math.abs(1 - result) <= 0.15) {
        return 1;
    }

    // If really close to 4:3 (poster image), just return 2:3
    const aspect4x3 = 4 / 3;
    if (Math.abs(aspect4x3 - result) <= 0.15) {
        return aspect4x3;
    }

    return result;
}

export function fillImages(elems: ArrayLike<ImageEntry>) {
    for (let i = 0, length = elems.length; i < length; i++) {
        const elem = elems[0];
        fillImage(elem);
    }
}

export function setLazyImage(element: HTMLElement, url: string) {
    element.classList.add('lazy');
    element.setAttribute('data-src', url);
    lazyImage(element);
}

export default {
    setLazyImage: setLazyImage,
    fillImages: fillImages,
    fillImage: fillImage,
    lazyImage: lazyImage,
    lazyChildren: lazyChildren,
    getPrimaryImageAspectRatio: getPrimaryImageAspectRatio
};
