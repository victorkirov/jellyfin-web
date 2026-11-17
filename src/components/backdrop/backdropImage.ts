export default class Backdrop {
    isDestroyed = false;

    constructor(private onLoaded: (enabled: boolean) => void) {}
    load(url: string, slot: number) {
        const img = new Image();

        img.onload = () => {
            if (this.isDestroyed) {
                return;
            }

            const backdropImage = document.getElementById(`backdropImage${slot}`)!;
            backdropImage.style.backgroundImage = `url('${url}')`;
            backdropImage.setAttribute('data-url', url);
            backdropImage.classList.add('displayingBackdropImage');

            document.getElementById(`backdropImage${1 - slot}`)?.classList.remove('displayingBackdropImage');

            this.onLoaded(true);
        };

        img.src = url;
    }

    destroy() {
        this.isDestroyed = true;
    }
}

