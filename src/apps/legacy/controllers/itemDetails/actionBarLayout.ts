import type { DetailsPage } from './types';

const collapseOrder = ['.btnShuffle', '.btnInstantMix', '.btnPlayTrailer', '.btnUserRating', '.btnPlaystate', '.btnReplay'];
const pending = new WeakSet<HTMLElement>();

/** One batch of measurements, followed by class changes using the measured savings. */
export function fitActionBar(view: HTMLElement) {
    const bar = view.querySelector<HTMLElement>('.mainDetailButtons');
    const available = bar?.clientWidth || 0;
    if (!bar || !available) return;
    const candidates = collapseOrder.map(selector => bar.querySelector<HTMLElement>(selector));
    for (const button of candidates) button?.classList.remove('detailButton-iconOnly');

    const measurements = Array.from(bar.querySelectorAll<HTMLElement>('button')).map(button => {
        const bounds = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        button.setAttribute('aria-label', button.title);
        return { button, width: bounds.width, iconWidth: bounds.height, margin: parseFloat(style.marginLeft) + parseFloat(style.marginRight) };
    }).filter(measurement => measurement.width > 0);
    let occupied = measurements.reduce((total, measurement) => total + measurement.width + measurement.margin, 0);
    for (const button of candidates) {
        if (occupied <= available + 1) break;
        const measurement = measurements.find(entry => entry.button === button);
        if (measurement && measurement.width > measurement.iconWidth) {
            button!.classList.add('detailButton-iconOnly');
            occupied -= measurement.width - measurement.iconWidth;
        }
    }
}

export function requestActionBarLayout(view: HTMLElement) {
    if (pending.has(view)) return;
    pending.add(view);
    const isCurrent = (view as DetailsPage).detailsIsCurrent;
    void Promise.resolve().then(() => {
        pending.delete(view);
        if ((!isCurrent || isCurrent()) && document.documentElement.contains(view)) fitActionBar(view);
    });
}
