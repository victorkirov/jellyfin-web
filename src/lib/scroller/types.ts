import type ResizeObserver from 'resize-observer-polyfill';

export type ScrollerOptions = {
    slidee?: HTMLElement | null;
    horizontal?: boolean | number;
    mouseWheel?: boolean;
    scrollBy?: number;
    dragSource?: HTMLElement | null;
    mouseDragging?: number | boolean;
    dragThreshold?: number;
    intervactive?: string | null;
    allowNativeScroll?: boolean;
    allowNativeSmoothScroll?: boolean;
    enableNativeScroll?: boolean;
    skipSlideToWhenVisible?: boolean;
    dispatchScrollEvent?: boolean;
    centerOffset?: number;
    scrollWidth?: number;
    forceHideScrollbars?: boolean;
};

export type ItemPosition = {
    start: number;
    center: number;
    end: number;
    size: number;
    isVisible: boolean;
};

export type DragState = {
    released: number | boolean;
    init: number;
    source: EventTarget;
    initX: number;
    initY: number;
    initPos: number;
    start: number;
    time: number;
    path: number;
    delta: number;
    locked: number;
    pathToLock: number;
    pathX: number;
    pathY: number;
};

export type Scroller = {
    options: ScrollerOptions;
    _pos: { start: number; center: number; end: number; cur: number; dest: number };
    initialized: number;
    slidee: HTMLElement;
    dragging: DragState;
    frameResizeObserver?: ResizeObserver | null;
    reload(): void;
    getScrollEventName(): string;
    getScrollSlider(): HTMLElement;
    getScrollFrame(): HTMLElement;
    slideTo(newPos: number, immediate?: boolean | number, fullItemPos?: ItemPosition): void;
    getPos(item: HTMLElement): ItemPosition;
    getCenterPosition(item: HTMLElement): number;
    destroy(): Scroller;
    getScrollPosition(): number;
    getScrollSize(): number;
    init(): Scroller | undefined;
    slideBy(delta: number, immediate?: boolean): void;
    to(location: 'start' | 'center' | 'end', item?: HTMLElement | boolean, immediate?: boolean): void;
    toStart(item?: HTMLElement | boolean, immediate?: boolean): void;
    toEnd(item?: HTMLElement | boolean, immediate?: boolean): void;
    toCenter(item?: HTMLElement | boolean, immediate?: boolean): void;
};

export type ScrollerConstructor = {
    new (frame: HTMLElement, options: ScrollerOptions): Scroller;
    prototype: Scroller;
    create(frame: HTMLElement, options: ScrollerOptions): Promise<Scroller>;
};
