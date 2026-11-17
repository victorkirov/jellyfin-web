import browser from '../../scripts/browser';
import './emby-checkbox.scss';
import 'webcomponents.js/webcomponents-lite';

type CheckboxPrototype = HTMLInputElement & { attachedCallback(): void; detachedCallback?(): void };
const EmbyCheckboxPrototype: CheckboxPrototype = Object.create(HTMLInputElement.prototype);

function onKeyDown(this: HTMLInputElement, e: KeyboardEvent) {
    // Don't submit form on enter
    // Real (non-emulator) Tizen does nothing on Space
    if (e.keyCode === 13 || (e.keyCode === 32 && browser.tizen)) {
        e.preventDefault();

        this.checked = !this.checked;

        this.dispatchEvent(new CustomEvent('change', {
            bubbles: true
        }));

        return false;
    }
}

function onFocus(this: HTMLInputElement) {
    this.parentElement!.classList.add('input-focused');
}

function onBlur(this: HTMLInputElement) {
    this.parentElement?.classList.remove('input-focused');
}

EmbyCheckboxPrototype.attachedCallback = function () {
    this.addEventListener('keydown', onKeyDown);
    this.addEventListener('focus', onFocus);
    this.addEventListener('blur', onBlur);

    if (this.getAttribute('data-embycheckbox') === 'true') {
        return;
    }

    this.setAttribute('data-embycheckbox', 'true');

    this.classList.add('emby-checkbox');

    const labelElement = this.parentElement!;
    labelElement.classList.add('emby-checkbox-label');

    const labelTextElement = labelElement.querySelector('span')!;

    let outlineClass = 'checkboxOutline';

    const customClass = this.getAttribute('data-outlineclass');
    if (customClass) {
        outlineClass += ' ' + customClass;
    }

    const checkedIcon = this.getAttribute('data-checkedicon') || 'check';
    const uncheckedIcon = this.getAttribute('data-uncheckedicon') || '';
    const checkHtml = '<span class="material-icons checkboxIcon checkboxIcon-checked ' + checkedIcon + '" aria-hidden="true"></span>';
    const uncheckedHtml = '<span class="material-icons checkboxIcon checkboxIcon-unchecked ' + uncheckedIcon + '" aria-hidden="true"></span>';
    labelElement.insertAdjacentHTML('beforeend', '<span class="' + outlineClass + '">' + checkHtml + uncheckedHtml + '</span>');

    labelTextElement.classList.add('checkboxLabel');
};

EmbyCheckboxPrototype.detachedCallback = function () {
    this.removeEventListener('keydown', onKeyDown);
    this.removeEventListener('focus', onFocus);
    this.removeEventListener('blur', onBlur);
    onBlur.call(this);
};

(document as Document & { registerElement(name: string, options: { prototype: CheckboxPrototype; extends: string }): void }).registerElement('emby-checkbox', {
    prototype: EmbyCheckboxPrototype,
    extends: 'input'
});

