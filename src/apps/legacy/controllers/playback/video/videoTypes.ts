/** Legacy emby-slider permits numeric assignment and coerces through its input setter. */
export type VideoSlider = Omit<HTMLInputElement, 'value'> & {
    value: string | number;
    dragging?: boolean;
    enableKeyboardDragging(): void;
    setIsClear(clear: boolean | null | undefined): void;
    setKeyboardSteps(backward: number, forward: number): void;
    setBufferedRanges(ranges: { start: number; end: number }[], runtimeTicks?: number | null, positionTicks?: number | null): void;
    updateBubbleHtml?: (bubble: HTMLElement, value: number) => boolean;
    getBubbleHtml?: (value: number) => string;
    getMarkerInfo?: () => { name?: string | null; progress: number }[];
};
