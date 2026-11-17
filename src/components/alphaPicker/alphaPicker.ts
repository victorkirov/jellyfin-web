import { mapLetters, setupKeyboard } from './alphaKeyboard';
/**
 * Module alphaPicker.
 * @module components/alphaPicker/alphaPicker
 */

import dialogHelper from '../dialogHelper/dialogHelper';
import '../buttons/emby-button';
import focusManager from '../../lib/focusManager';
import dom from '../../utils/dom';
import globalize from '../../lib/globalize';
import './style.scss';
import '../../elements/emby-button/paper-icon-button-light';
import 'material-design-icons-iconfont';

const libraryLetters = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

const selectedButtonClass = 'alphaPickerButton-selected';

export type AlphaPickerOptions = {
    element: HTMLElement;
    mode?: string;
    valueChangeEvent?: string;
    itemsContainer?: HTMLElement;
    itemClass?: string;
};

export class AlphaPicker {
    options: AlphaPickerOptions | null;
    dialog: ReturnType<typeof dialogHelper.createDialog> | null = null;
    _currentValue: string | null | undefined;
    enabled!: (enabled: boolean) => void;
    constructor(options: AlphaPickerOptions) {
        this.options = options;

        const element = options.element;
        if (options.mode !== 'keyboard') {
            element.classList.add('alphaPicker-jump');
            element.innerHTML = '<button is="emby-button" class="raised alphaPickerTrigger" aria-label="' + globalize.translate('JumpToLetter') + '" aria-haspopup="dialog" aria-expanded="false">' + 'A–Z</button>';
            const trigger = element.querySelector<HTMLButtonElement>('button')!;
            const openDialog = () => {
                if (this.dialog) return;
                // The helper restores the focused trigger on Back and selection.
                focusManager.focus(trigger);
                const dialog = dialogHelper.createDialog({ scrollY: false });
                this.dialog = dialog;
                trigger.setAttribute('aria-expanded', 'true');
                dialog.classList.add('alphaPickerDialog');
                dialog.setAttribute('role', 'dialog');
                dialog.setAttribute('aria-label', globalize.translate('TitlesStartingWith'));
                dialog.innerHTML = '<h2>' + globalize.translate('TitlesStartingWith') + '</h2><div class="alphaPickerLetters">'
                    + '<button class="alphaPickerButton alphaPickerButton-tv" data-value="">' + globalize.translate('All') + '</button>'
                    + mapLetters(libraryLetters).join('') + '</div>';
                const selectedValue = libraryLetters.indexOf(this._currentValue || '') === -1 ? '' : this._currentValue;
                const selected = dialog.querySelector('[data-value="' + selectedValue + '"]');
                if (selected) {
                    selected.classList.add(selectedButtonClass);
                    selected.setAttribute('autofocus', 'autofocus');
                }
                dialog.addEventListener('click', event => {
                    const button = dom.parentWithClass(event.target as HTMLElement, 'alphaPickerButton');
                    if (!button) return;
                    const value = button.getAttribute('data-value');
                    dialogHelper.close(dialog);
                    if ((value || null) === (this._currentValue || null)) {
                        element.dispatchEvent(new CustomEvent('alphavalueconfirmed', { bubbles: true }));
                    } else {
                        this.value(value || null, true);
                    }
                });
                dialog.addEventListener('close', () => {
                    this.dialog = null;
                    trigger.setAttribute('aria-expanded', 'false');
                });
                void dialogHelper.open(dialog);
            };
            this.enabled = enabled => {
                if (enabled) {
                    trigger.addEventListener('click', openDialog);
                } else {
                    trigger.removeEventListener('click', openDialog);
                    if (this.dialog) dialogHelper.close(this.dialog);
                }
            };
            this.enabled(true);
            this.visible(true);
            return;
        }

        setupKeyboard(this, options);
    }

    value(value?: string | null, applyValue?: boolean) {
        const element = this.options!.element;
        if (value !== undefined) {
            value = value == null ? value : value.toUpperCase();
            this._currentValue = value;
            this.updateSelectedButton(value);
        }

        const trigger = element.querySelector('.alphaPickerTrigger');
        if (trigger) {
            trigger.textContent = this._currentValue || 'A–Z';
        }

        if (applyValue) {
            element.dispatchEvent(new CustomEvent('alphavaluechanged', {
                cancelable: false,
                detail: {
                    value
                }
            }));
        }

        return this._currentValue;
    }

    private updateSelectedButton(value: string | null) {
        const element = this.options!.element;
        const selected = element.querySelector(`.${selectedButtonClass}`);
        if (value === null) {
            selected?.classList.remove(selectedButtonClass);
            return;
        }
        if (this.options!.mode === 'keyboard') return;
        let button: Element | null = null;
        try {
            button = element.querySelector(`.alphaPickerButton[data-value='${value}']`);
        } catch (error) {
            console.error('error in querySelector:', error);
        }
        if (button && button !== selected) button.classList.add(selectedButtonClass);
        if (selected && selected !== button) selected.classList.remove(selectedButtonClass);
    }

    on(name: string, fn: EventListener) {
        const element = this.options!.element;
        element.addEventListener(name, fn);
    }

    off(name: string, fn: EventListener) {
        const element = this.options!.element;
        element.removeEventListener(name, fn);
    }

    updateControls(query: { NameLessThan?: string; NameStartsWith?: string | null; SortBy?: string }) {
        if (query.NameLessThan) {
            this.value('#');
        } else {
            this.value(query.NameStartsWith || null);
        }

        this.visible((query.SortBy || '').indexOf('SortName') !== -1);
    }

    visible(visible: boolean) {
        const element = this.options!.element;
        element.style.visibility = visible ? 'visible' : 'hidden';
        if (this.options!.mode !== 'keyboard') {
            element.style.display = visible ? '' : 'none';
        }
    }

    values() {
        if (this.options!.mode !== 'keyboard') return libraryLetters.slice();
        const element = this.options!.element;
        const elems = element.querySelectorAll('.alphaPickerButton');
        const values = [];
        for (let i = 0, length = elems.length; i < length; i++) {
            values.push(elems[i].getAttribute('data-value'));
        }

        return values;
    }

    focus() {
        const element = this.options!.element;
        focusManager.autoFocus(element, true);
    }

    destroy() {
        const element = this.options!.element;
        this.enabled(false);
        element.classList.remove('focuscontainer-x');
        this.options = null;
    }
}

export default AlphaPicker;
