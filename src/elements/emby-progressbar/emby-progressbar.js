
const ProgressBarPrototype = Object.create(HTMLDivElement.prototype);

function onAutoTimeProgress() {
    if (this.closest('.hide')) {
        return;
    }

    const start = parseInt(this.getAttribute('data-starttime'), 10);
    const end = parseInt(this.getAttribute('data-endtime'), 10);

    const now = new Date().getTime();
    const total = end - start;
    let pct = 100 * ((now - start) / total);

    pct = Math.min(100, pct);
    pct = Math.max(0, pct);

    const itemProgressBarForeground = this.querySelector('.itemProgressBarForeground');
    itemProgressBarForeground.style.width = pct + '%';
}

ProgressBarPrototype.attachedCallback = function () {
    ProgressBarPrototype.detachedCallback.call(this);

    if (this.getAttribute('data-automode') === 'time') {
        this.onTimeProgress = onAutoTimeProgress.bind(this);
        this.progressView = this.closest('.mainAnimatedPage');
        if (this.progressView) {
            this.progressView.addEventListener('viewshow', this.onTimeProgress);
        }
        this.timeInterval = setInterval(this.onTimeProgress, 60000);
    }
};

ProgressBarPrototype.detachedCallback = function () {
    if (this.progressView) {
        this.progressView.removeEventListener('viewshow', this.onTimeProgress);
        this.progressView = null;
    }
    this.onTimeProgress = null;
    if (this.timeInterval) {
        clearInterval(this.timeInterval);
        this.timeInterval = null;
    }
};

document.registerElement('emby-progressbar', {
    prototype: ProgressBarPrototype,
    extends: 'div'
});

export {};
