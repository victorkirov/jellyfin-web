import '../../elements/emby-collapse/emby-collapse.scss';
import 'webcomponents.js/webcomponents-lite';
import '../buttons/emby-button';

type CollapseContent = HTMLElement & { expanded?: boolean };
const EmbyButtonPrototype: HTMLDivElement & { attachedCallback?: () => void } = Object.create(HTMLDivElement.prototype);

function slideDownToShow(button: HTMLButtonElement, elem: CollapseContent) {
    elem.classList.remove('hide');
    elem.classList.add('expanded');
    elem.style.height = 'auto';
    button.querySelector<HTMLElement>('.material-icons')!.classList.add('emby-collapse-expandIconExpanded');
}

function slideUpToHide(button: HTMLButtonElement, elem: CollapseContent) {
    elem.classList.remove('expanded');
    elem.classList.add('hide');
    button.querySelector<HTMLElement>('.material-icons')!.classList.remove('emby-collapse-expandIconExpanded');
}

function onButtonClick(this: HTMLButtonElement) {
    const collapseContent = this.parentElement!.querySelector<CollapseContent>('.collapseContent')!;

    if (collapseContent.expanded) {
        collapseContent.expanded = false;
        slideUpToHide(this, collapseContent);
    } else {
        collapseContent.expanded = true;
        slideDownToShow(this, collapseContent);
    }
}

EmbyButtonPrototype.attachedCallback = function () {
    if (this.classList.contains('emby-collapse')) {
        return;
    }

    this.classList.add('emby-collapse');

    const collapseContent = this.querySelector('.collapseContent');
    if (collapseContent) {
        collapseContent.classList.add('hide');
    }

    const title = this.getAttribute('title');

    const html = '<button is="emby-button" type="button" on-click="toggleExpand" id="expandButton" class="emby-collapsible-button iconRight"><h3 class="emby-collapsible-title" title="' + title + '">' + title + '</h3><span class="material-icons emby-collapse-expandIcon expand_more" aria-hidden="true"></span></button>';

    this.insertAdjacentHTML('afterbegin', html);

    const button = this.querySelector<HTMLButtonElement>('.emby-collapsible-button')!;

    button.addEventListener('click', onButtonClick);

    if (this.getAttribute('data-expanded') === 'true') {
        onButtonClick.call(button);
    }
};

(document as Document & { registerElement: (name: string, options: { prototype: HTMLDivElement; extends: string }) => void }).registerElement('emby-collapse', {
    prototype: EmbyButtonPrototype,
    extends: 'div'
});

