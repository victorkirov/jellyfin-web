import browser from '../../scripts/browser';
import dom from '../../utils/dom';

function enableAnimation() {
    return !browser.slow;
}

function enableRotation() {
    return !browser.tv;
}

export default class Backdrop {
    isDestroyed = false;
    currentAnimatingElement: HTMLElement | null = null;

    constructor(private onLoaded: (enabled: boolean) => void) {}
    load(url: string, slot: number) {
        const img = new Image();
        const self = this;

        img.onload = () => {
            if (self.isDestroyed) {
                return;
            }

            const backdropImage = document.getElementById(`backdropImage${slot}`)!;
            backdropImage.style.backgroundImage = `url('${url}')`;
            backdropImage.setAttribute('data-url', url);
            backdropImage.classList.add('displayingBackdropImage', 'backdropImageFadeIn');
            self.currentAnimatingElement = backdropImage;

            document.getElementById(`backdropImage${1 - slot}`)?.classList.remove('displayingBackdropImage');

            if (!enableAnimation()) {
                self.onLoaded(true);
                return;
            }

            const onAnimationComplete = () => {
                dom.removeEventListener(backdropImage, dom.whichAnimationEvent(), onAnimationComplete, {
                    once: true
                });
                if (backdropImage === self.currentAnimatingElement) {
                    self.currentAnimatingElement = null;
                }

                backdropImage?.classList.remove('backdropImageFadeIn');
            };

            dom.addEventListener(backdropImage, dom.whichAnimationEvent(), onAnimationComplete, {
                once: true
            });

            self.onLoaded(true);
        };

        img.src = url;
    }

    cancelAnimation() {
        const elem = this.currentAnimatingElement;
        if (elem) {
            elem.classList.remove('backdropImageFadeIn');
            this.currentAnimatingElement = null;
        }
    }

    destroy() {
        this.isDestroyed = true;
        this.cancelAnimation();
    }
}

