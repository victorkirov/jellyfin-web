type PendingImage = { target: HTMLElement; url: string; requireLoadZone: boolean };

const loadZone = new WeakSet<HTMLElement>();
const pendingImages = new WeakMap<HTMLElement, PendingImage>();
const readyImages: PendingImage[] = [];
let framePending = false;
let nextImage = 0;
const MAX_INSPECTIONS_PER_FRAME = 32;

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

function hidePlaceholder(target: HTMLElement) {
    const canvas = target.previousElementSibling;
    if (canvas?.tagName === 'CANVAS') {
        canvas.classList.add('lazy-hidden');
    }
    target.parentElement?.querySelector('.cardPadder')?.classList.add('lazy-hidden-children');
}

function applyNextImage() {
    framePending = false;
    let inspected = 0;
    while (nextImage < readyImages.length && inspected < MAX_INSPECTIONS_PER_FRAME) {
        const request = readyImages[nextImage++];
        inspected++;
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
        // Applied posters stay until their markup is replaced, so scrolling back never reloads them. Memory is bounded
        // by the library page size (100 by default) and the views viewContainer keeps cached.
        target.removeAttribute('data-src');
        target.classList.remove('lazy-hidden');
        hidePlaceholder(target);
        break;
    }
    if (nextImage < readyImages.length) {
        scheduleFrame();
    } else {
        readyImages.length = 0;
        nextImage = 0;
    }
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
