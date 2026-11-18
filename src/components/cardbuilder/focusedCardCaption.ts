function captionElement() {
    return document.querySelector<HTMLElement>('.focusedCardCaption');
}

let generation = 0;

export function clearFocusedCardCaption(container?: HTMLElement) {
    if (container && !container.contains(document.activeElement)) return;
    generation++;
    const caption = captionElement();
    if (caption) caption.textContent = '';
}

function showFocusedCardCaption(target: EventTarget | null, retry = true) {
    clearFocusedCardCaption();
    const card = target instanceof Element ? target.closest<HTMLElement>('.card') : null;
    if (!card) return;
    const titles = Array.from(card.querySelectorAll<HTMLElement>(
        '.cardText-first > bdi' + (card.dataset.type === 'Episode' ? ',.cardText-first + .cardText-secondary > bdi' : '')
    ));
    let hasLayout = false;
    const clipped = titles.some(title => {
        const height = title.clientHeight;
        hasLayout = hasLayout || height > 0;
        return height > 0 && title.scrollHeight > height;
    });
    if (!hasLayout && retry) {
        const request = generation;
        // Newly inserted cards may be focused before their first layout.
        requestAnimationFrame(() => {
            if (request === generation && card.contains(document.activeElement)) showFocusedCardCaption(target, false);
        });
    }
    if (!clipped) return;
    const title = titles.map(element => element.textContent || '').filter(Boolean).join(': ');
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
document.addEventListener('focusout', () => clearFocusedCardCaption());
function onPageHide(event: Event) {
    clearFocusedCardCaption(event.target instanceof HTMLElement ? event.target : undefined);
}
document.addEventListener('viewbeforehide', onPageHide, true);
document.addEventListener('pagehide', onPageHide, true);
