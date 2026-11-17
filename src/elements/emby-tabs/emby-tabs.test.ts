import { afterEach, expect, it, vi } from 'vitest';
vi.mock('webcomponents.js/webcomponents-lite', () => ({}));
vi.mock('lib/scroller', () => ({ default: vi.fn() }));
vi.mock('../../scripts/browser', () => ({ default: {} }));
vi.mock('../../lib/layoutManager', () => ({ default: { tv: true } }));
vi.mock('../../lib/focusManager', () => ({ default: { focus: vi.fn(), autoFocus: vi.fn() } }));
vi.mock('../../utils/dom', () => ({ default: {
    parentWithClass: (element: HTMLElement, className: string) => element.classList.contains(className) ? element : null,
    addEventListener: (element: Element, type: string, handler: EventListener) => element.addEventListener(type, handler),
    removeEventListener: (element: Element, type: string, handler: EventListener) => element.removeEventListener(type, handler)
} }));

type Tabs = HTMLDivElement & { createdCallback(): void; attachedCallback(): void; detachedCallback(): void; selectedIndex(index?: number, trigger?: boolean): number };
afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
});

it('preserves selected-tab events and overflow classes without panel animation', async () => {
    vi.useFakeTimers();
    let prototype: object = {};
    Object.defineProperty(document, 'registerElement', { configurable: true, value: (_name: string, options: { prototype: object }) => {
        prototype = options.prototype;
    } });
    await import('./emby-tabs');
    const tabs = document.createElement('div') as Tabs;
    Object.setPrototypeOf(tabs, prototype);
    tabs.innerHTML = '<button class="emby-tab-button" data-index="0">One</button><button class="emby-tab-button" data-index="1">Two</button>';
    document.body.appendChild(tabs);
    tabs.createdCallback();
    tabs.attachedCallback();
    expect(tabs.selectedIndex()).toBe(0);
    expect(tabs.classList.contains('smoothScrollX')).toBe(true);
    const before = vi.fn();
    const change = vi.fn();
    tabs.addEventListener('beforetabchange', before);
    tabs.addEventListener('tabchange', change);
    tabs.querySelectorAll('button')[1].click();
    expect(before).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(120);
    expect(change).toHaveBeenCalledOnce();
    expect(tabs.selectedIndex()).toBe(1);
    const buttons = tabs.querySelectorAll('button');
    buttons[0].classList.add('lastFocused');
    const { default: focusManager } = await import('../../lib/focusManager');
    vi.mocked(focusManager.focus).mockClear();
    tabs.focus();
    expect(focusManager.focus).toHaveBeenLastCalledWith(buttons[1]);
    tabs.detachedCallback();
});
