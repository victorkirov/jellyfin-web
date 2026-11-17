import focusManager from 'lib/focusManager';
import { LazyLoader } from 'components/lazyLoader/lazyLoaderIntersectionObserver';

export function deferSection(section: HTMLElement, load: () => unknown) {
    let placeholder: HTMLElement | null = null;
    let started = false;
    let destroyed = false;

    if (section.classList.contains('hide')) {
        // Hidden sections have no intersection area or TV focus target.
        placeholder = document.createElement('div');
        placeholder.className = 'verticalSection focusable';
        placeholder.tabIndex = 0;
        placeholder.style.minHeight = '15em';
        const title = section.querySelector('h2');
        if (title) {
            const heading = document.createElement('h2');
            heading.className = title.className;
            heading.textContent = title.textContent;
            placeholder.appendChild(heading);
        }
        section.parentNode!.insertBefore(placeholder, section);
    }

    const target = placeholder || section;
    const loader = new LazyLoader({
        callback: (entry: IntersectionObserverEntry) => {
            if (entry.isIntersecting) start();
        }
    });

    function removePlaceholder() {
        if (!placeholder) return;
        const wasFocused = placeholder === document.activeElement;
        let fallback: HTMLElement | undefined;
        if (wasFocused) {
            const candidates = focusManager.getFocusableElements();
            const next = candidates.find((candidate: HTMLElement) => (
                placeholder!.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING
            ));
            fallback = next || candidates[candidates.indexOf(placeholder) - 1];
        }
        placeholder.parentNode?.removeChild(placeholder);
        placeholder = null;
        if (wasFocused && !focusManager.autoFocus(section) && fallback) focusManager.focus(fallback);
    }

    function start() {
        if (started || destroyed) return;
        started = true;
        loader.destroy();
        Promise.resolve().then(() => {
            if (!destroyed) return load();
        }).catch(error => {
            console.error('[DeferredSection] failed to load section', error);
        }).then(() => {
            if (!destroyed) {
                target.removeEventListener('focusin', start);
                removePlaceholder();
            }
        });
    }

    target.addEventListener('focusin', start);
    loader.addElements([target]);

    return () => {
        destroyed = true;
        loader.destroy();
        target.removeEventListener('focusin', start);
        // Pausing a view must not move focus into its other sections.
        placeholder?.parentNode?.removeChild(placeholder);
        placeholder = null;
    };
}
