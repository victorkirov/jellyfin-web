import type { AlphaPicker, AlphaPickerOptions } from './alphaPicker';
import focusManager from '../../lib/focusManager';
import layoutManager from '../../lib/layoutManager';
import dom from '../../utils/dom';
import globalize from '../../lib/globalize';
const selectedButtonClass = 'alphaPickerButton-selected';

function focus(this: HTMLElement) {
    const selected = this.querySelector(`.${selectedButtonClass}`);

    if (selected) {
        focusManager.focus(selected);
    } else {
        focusManager.autoFocus(this, true);
    }
}

function getAlphaPickerButtonClassName() {
    let alphaPickerButtonClassName = 'alphaPickerButton';

    if (layoutManager.tv) {
        alphaPickerButtonClassName += ' alphaPickerButton-tv';
    }

    return alphaPickerButtonClassName;
}

export function getLetterButton(l: string) {
    return `<button data-value="${l}" class="${getAlphaPickerButtonClassName()}">${l}</button>`;
}

export function mapLetters(letters: string[]) {
    return letters.map(l => {
        return getLetterButton(l);
    });
}

function render(element: HTMLElement, options: AlphaPickerOptions) {
    element.classList.add('alphaPicker');

    if (layoutManager.tv) {
        element.classList.add('alphaPicker-tv');
    }

    element.classList.add('focuscontainer-x');

    let html = '';
    let letters;

    const alphaPickerButtonClassName = getAlphaPickerButtonClassName();

    const rowClassName = 'alphaPickerRow';

    html += `<div class="${rowClassName}">`;
    if (options.mode === 'keyboard') {
        html += `<button data-value=" " is="paper-icon-button-light" class="${alphaPickerButtonClassName}" aria-label="${globalize.translate('ButtonSpace')}"><span class="material-icons alphaPickerButtonIcon space_bar" aria-hidden="true"></span></button>`;
    } else {
        letters = ['#'];
        html += mapLetters(letters).join('');
    }

    letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
    html += mapLetters(letters).join('');

    if (options.mode === 'keyboard') {
        html += `<button data-value="backspace" is="paper-icon-button-light" class="${alphaPickerButtonClassName}" aria-label="${globalize.translate('ButtonBackspace')}"><span class="material-icons alphaPickerButtonIcon backspace" aria-hidden="true"></span></button>`;
        html += '</div>';

        letters = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        html += `<div class="${rowClassName}">`;
        html += '<br/>';
        html += mapLetters(letters).join('');
        html += '</div>';
    } else {
        html += '</div>';
    }

    element.innerHTML = html;

    element.classList.add('focusable');
    element.focus = focus;
}

export function setupKeyboard(picker: AlphaPicker, options: AlphaPickerOptions) {
    const self = picker;
    const element = options.element;
    const itemsContainer = options.itemsContainer;
    const itemClass = options.itemClass;

    let itemFocusValue: string | null;
    let itemFocusTimeout: ReturnType<typeof setTimeout> | null;

    function onItemFocusTimeout() {
        itemFocusTimeout = null;
        self.value(itemFocusValue);
    }

    let alphaFocusedElement: HTMLElement;
    let alphaFocusTimeout: ReturnType<typeof setTimeout> | null;

    function onAlphaFocusTimeout() {
        alphaFocusTimeout = null;

        if (document.activeElement === alphaFocusedElement) {
            const value = alphaFocusedElement.getAttribute('data-value');
            self.value(value, true);
        }
    }

    function onAlphaPickerInKeyboardModeClick(e: Event) {
        const alphaPickerButton = dom.parentWithClass(e.target as HTMLElement, 'alphaPickerButton');

        if (alphaPickerButton) {
            const value = alphaPickerButton.getAttribute('data-value');

            element.dispatchEvent(new CustomEvent('alphavalueclicked', {
                cancelable: false,
                detail: {
                    value
                }
            }));
        }
    }

    function onAlphaPickerClick(this: AlphaPicker, e: Event) {
        const alphaPickerButton = dom.parentWithClass(e.target as HTMLElement, 'alphaPickerButton');

        if (alphaPickerButton) {
            const value = alphaPickerButton.getAttribute('data-value');
            if ((picker._currentValue || '').toUpperCase() === (value || '').toUpperCase()) {
                picker.value(null, true);
            } else {
                picker.value(value, true);
            }
        }
    }

    function onAlphaPickerFocusIn(e: Event) {
        if (alphaFocusTimeout) {
            clearTimeout(alphaFocusTimeout);
            alphaFocusTimeout = null;
        }

        const alphaPickerButton = dom.parentWithClass(e.target as HTMLElement, 'alphaPickerButton');

        if (alphaPickerButton) {
            alphaFocusedElement = alphaPickerButton;
            alphaFocusTimeout = setTimeout(onAlphaFocusTimeout, 600);
        }
    }

    function onItemsFocusIn(e: Event) {
        const item = dom.parentWithClass(e.target as HTMLElement, itemClass || '');

        if (item) {
            const prefix = item.getAttribute('data-prefix');
            if (prefix?.length) {
                itemFocusValue = prefix[0];
                if (itemFocusTimeout) {
                    clearTimeout(itemFocusTimeout);
                }
                itemFocusTimeout = setTimeout(onItemFocusTimeout, 100);
            }
        }
    }

    const boundOnAlphaPickerClick = onAlphaPickerClick.bind(picker);

    picker.enabled = function (enabled: boolean) {
        if (enabled) {
            if (itemsContainer) {
                itemsContainer.addEventListener('focus', onItemsFocusIn, true);
            }

            if (options.mode === 'keyboard') {
                element.addEventListener('click', onAlphaPickerInKeyboardModeClick);
            }

            if (options.valueChangeEvent !== 'click') {
                element.addEventListener('focus', onAlphaPickerFocusIn, true);
            } else {
                element.addEventListener('click', boundOnAlphaPickerClick);
            }
        } else {
            if (itemsContainer) {
                itemsContainer.removeEventListener('focus', onItemsFocusIn, true);
            }

            element.removeEventListener('click', onAlphaPickerInKeyboardModeClick);
            element.removeEventListener('focus', onAlphaPickerFocusIn, true);
            element.removeEventListener('click', boundOnAlphaPickerClick);
        }
    };

    render(element, options);

    picker.enabled(true);
    picker.visible(true);
}
