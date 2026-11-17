export type DialogOptions = {
    id?: string; lockScroll?: boolean; size?: string; enableHistory?: boolean; modal?: boolean; autoFocus?: boolean;
    entryAnimation?: string; exitAnimation?: string; entryAnimationDuration?: number; exitAnimationDuration?: number;
    scrollX?: boolean; scrollY?: boolean; removeOnClose?: boolean;
};
export type DialogElement = HTMLDivElement & {
    dialogContainer?: HTMLDivElement | null;
    backdrop?: HTMLDivElement | null;
    animationConfig?: { entry: { name: string; timing: { duration: number; easing: string } }; exit: { name: string; timing: { duration: number; easing: string; fill: string } } };
};
