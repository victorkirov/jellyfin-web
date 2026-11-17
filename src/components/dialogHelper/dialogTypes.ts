export type DialogOptions = {
    id?: string; lockScroll?: boolean; size?: string; enableHistory?: boolean; modal?: boolean; autoFocus?: boolean;
    scrollX?: boolean; scrollY?: boolean; removeOnClose?: boolean;
};
export type DialogElement = HTMLDivElement & {
    dialogContainer?: HTMLDivElement | null;
    backdrop?: HTMLDivElement | null;
};
