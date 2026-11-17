import Worker from './blurhash.worker';

const worker = new Worker();
const targetDic: Record<string, HTMLElement[]> = {};
const blurhashTargets = new WeakSet<HTMLElement>();
worker.addEventListener(
    'message',
    ({ data: { pixels, hsh, width, height } }: MessageEvent<{ pixels: Uint8ClampedArray; hsh: string; width: number; height: number }>) => {
        const elems = targetDic[hsh];
        if (elems?.length) {
            for (const elem of elems) {
                drawBlurhash(elem, pixels, width, height);
            }
            delete targetDic[hsh];
        }
    }
);

function drawBlurhash(target: HTMLElement, pixels: Uint8ClampedArray, width: number, height: number) {
    if (!document.documentElement.contains(target)) {
        return;
    }

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(width, height);

    imgData.data.set(pixels);
    ctx.putImageData(imgData, 0, 0);

    requestAnimationFrame(() => {
        if (!document.documentElement.contains(target)) {
            return;
        }

        // This class is just an utility class, so users can customize the canvas using their own CSS.
        canvas.classList.add('blurhash-canvas');
        if (target.classList.contains('lazy-image-fadein') || target.classList.contains('lazy-image-fadein-fast')) {
            canvas.classList.add('lazy-hidden');
        }

        target.parentNode!.insertBefore(canvas, target);
        target.classList.add('blurhashed');
        target.removeAttribute('data-blurhash');
    });
}

export function itemBlurhashing(target: HTMLElement, hash: string) {
    try {
        // Although the default values recommended by Blurhash developers is 32x32, a size of 20x20 seems to be the sweet spot for us,
        // improving the performance and reducing the memory usage, while retaining almost full blur quality.
        // Lower values had more visible pixelation
        const width = 20;
        const height = 20;
        if (blurhashTargets.has(target)) {
            return;
        }
        blurhashTargets.add(target);

        if (targetDic[hash]) {
            targetDic[hash].push(target);
            return;
        }
        targetDic[hash] = [target];

        worker.postMessage({
            hash,
            width,
            height
        });
    } catch (err) {
        console.error(err);
        target.classList.add('non-blurhashable');
        return;
    }
}

