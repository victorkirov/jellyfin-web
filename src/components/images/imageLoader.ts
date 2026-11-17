import * as lazyLoader from '../lazyLoader/lazyLoaderIntersectionObserver';
import * as userSettings from '../../scripts/settings/userSettings';
import './style.scss';

import { itemBlurhashing } from './blurhash';
import { preloadImage, setInLoadZone } from './imageQueue';

type ImageEntry = { target: Element; isIntersecting: boolean };
const imageOptions = new WeakMap<Element, { enableBlurhash: boolean }>();

export function lazyImage(elem: HTMLElement, source = elem.getAttribute('data-src')) {
    if (!source) {
        return;
    }

    preloadImage(elem, source);
}

export function fillImage(entry: ImageEntry) {
    if (!entry) {
        throw new Error('entry cannot be null');
    }
    const target = entry.target as HTMLElement;
    setInLoadZone(target, entry.isIntersecting);
    if (!entry.isIntersecting) return;
    if (imageOptions.get(target)?.enableBlurhash) {
        blurhashImage(target);
    }
    const source = target.getAttribute('data-src');
    if (source) preloadImage(target, source, true);
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

export function lazyChildren(elem: Element) {
    const options = {
        enableBlurhash: userSettings.enableBlurhash()
    };
    for (const lazyElem of elem.querySelectorAll<HTMLElement>('.lazy')) {
        imageOptions.set(lazyElem, options);
    }

    lazyLoader.lazyChildren(elem, fillImage, '150% 0px');
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
