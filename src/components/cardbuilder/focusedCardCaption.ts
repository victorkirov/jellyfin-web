function captionElement() {
    return document.querySelector<HTMLElement>('.focusedCardCaption');
}

export function clearFocusedCardCaption(container?: HTMLElement) {
    if (container && !container.contains(document.activeElement)) return;
    const caption = captionElement();
    if (caption) caption.textContent = '';
}

function showFocusedCardCaption(target: EventTarget | null) {
    const card = target instanceof Element ? target.closest<HTMLElement>('.card') : null;
    const title = card?.getAttribute('aria-label') || card?.querySelector('.cardText-first')?.textContent || '';
    if (!title) {
        clearFocusedCardCaption();
        return;
    }
    let caption = captionElement();
    if (!caption) {
        caption = document.createElement('div');
        caption.className = 'focusedCardCaption';
        // The card already exposes its full accessible name.
        caption.setAttribute('aria-hidden', 'true');
        document.body.appendChild(caption);
    }
    caption.textContent = title;
}

// Delegation keeps focus work independent of the number of cards.
document.addEventListener('focusin', event => showFocusedCardCaption(event.target));
document.addEventListener('focusout', event => showFocusedCardCaption(event.relatedTarget));
function onPageHide(event: Event) {
    clearFocusedCardCaption(event.target instanceof HTMLElement ? event.target : undefined);
}
document.addEventListener('viewbeforehide', onPageHide, true);
document.addEventListener('pagehide', onPageHide, true);
