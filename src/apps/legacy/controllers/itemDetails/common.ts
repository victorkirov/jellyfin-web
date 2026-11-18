import { type DetailsPage, type DetailsController, queryAll } from './types';

export function autoFocus(container: HTMLElement, isCurrent: () => boolean = () => true) {
    void import('components/autoFocuser').then(({ default: autoFocuser }) => {
        if (isCurrent()) autoFocuser.autoFocus(container);
    });
}

export function unmount(instance: DetailsController) {
    for (const unmountMethod of instance._unmount) {
        unmountMethod();
    }

    instance._unmount = [];
}

export function hideAll(page: DetailsPage, className: string, show: boolean = false) {
    for (const elem of queryAll(page, '.' + className)) {
        if (show) {
            elem.classList.remove('hide');
        } else {
            elem.classList.add('hide');
        }
    }
}
