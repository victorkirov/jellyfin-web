type PendingImage = { target: HTMLElement; url: string; requireLoadZone: boolean };

const loadZone = new WeakSet<HTMLElement>();
const pendingImages = new WeakMap<HTMLElement, PendingImage>();
const filledSources = new WeakMap<HTMLElement, string>();
const readyImages: PendingImage[] = [];
let framePending = false;

export function setInLoadZone(target: HTMLElement, inside: boolean) {
    if (inside) {
        loadZone.add(target);
    } else {
        loadZone.delete(target);
        if (pendingImages.get(target)?.requireLoadZone) {
            pendingImages.delete(target);
        }
    }
}

function setPlaceholderVisible(target: HTMLElement, visible: boolean) {
    const canvas = target.previousElementSibling;
    if (canvas?.tagName === 'CANVAS') {
        canvas.classList.toggle('lazy-hidden', !visible);
    }
    target.parentElement?.querySelector('.cardPadder')?.classList.toggle('lazy-hidden-children', !visible);
}

function applyNextImage() {
    framePending = false;
    while (readyImages.length) {
        const request = readyImages.shift()!;
        const { target, url, requireLoadZone } = request;
        if (pendingImages.get(target) !== request) {
            continue;
        }
        pendingImages.delete(target);
        if (!document.documentElement.contains(target) || (requireLoadZone && !loadZone.has(target)) || (requireLoadZone && target.getAttribute('data-src') !== url)) {
            continue;
        }
        if (target.tagName === 'IMG') {
            target.setAttribute('src', url);
        } else {
            target.style.backgroundImage = "url('" + url + "')";
        }
        filledSources.set(target, url);
        target.removeAttribute('data-src');
        target.classList.remove('lazy-hidden');
        setPlaceholderVisible(target, false);
        break;
    }
    if (readyImages.length) scheduleFrame();
}

function scheduleFrame() {
    if (!framePending) {
        framePending = true;
        requestAnimationFrame(applyNextImage);
    }
}

export function preloadImage(target: HTMLElement, url: string, requireLoadZone = false) {
    if (pendingImages.get(target)?.url === url) return;
    const request = { target, url, requireLoadZone };
    pendingImages.set(target, request);
    const image = new Image();
    target.classList.add('lazy-hidden');
    image.addEventListener('load', () => {
        if (pendingImages.get(target) !== request) return;
        readyImages.push(request);
        scheduleFrame();
    });
    image.addEventListener('error', () => {
        if (pendingImages.get(target) === request) pendingImages.delete(target);
    });
    image.src = url;
}

export function emptyImage(target: HTMLElement) {
    setInLoadZone(target, false);
    const url = filledSources.get(target);
    if (!url) return;
    filledSources.delete(target);
    setPlaceholderVisible(target, true);
    if (target.tagName === 'IMG') {
        target.setAttribute('src', '');
    } else {
        target.style.backgroundImage = 'none';
    }
    target.setAttribute('data-src', target.getAttribute('data-src') || url);
    target.classList.add('lazy-hidden');
}
