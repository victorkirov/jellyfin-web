import type ScrollerFactory from 'lib/scroller';

export type Tabs = HTMLDivElement & {
    scroller?: InstanceType<typeof ScrollerFactory> | null;
    selectedTabIndex?: number;
    readyFired?: boolean;
    selectedIndex(selected?: number, triggerEvent?: boolean): number | undefined;
};
export type TabsPrototype = Tabs & {
    createdCallback(this: Tabs): void;
    attachedCallback(this: Tabs): void;
    detachedCallback(this: Tabs): void;
    refresh(this: Tabs): void;
    selectNext(this: Tabs): void;
    selectPrevious(this: Tabs): void;
    triggerBeforeTabChange(this: Tabs): void;
    triggerTabChange(this: Tabs): void;
    setTabEnabled(this: Tabs, index: number, enabled: boolean): void;
};
