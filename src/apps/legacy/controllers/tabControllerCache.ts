type TabController = {
    initTab?(): void;
    preRender?(): void;
    renderTab(): void | Promise<void>;
    isRefreshInterrupted?(): boolean;
    destroy?(): void;
};

export default function createTabControllerCache(loadController: (index: number) => Promise<TabController>) {
    const controllers: TabController[] = [];
    const pending: Array<Promise<TabController | undefined> | null> = [];
    let rendered: number[] = [];
    let rendering: Array<Promise<void> | null> = [];
    let destroyed = false;
    let selectedIndex: number | null | undefined;

    function get(index: number): Promise<TabController | undefined> {
        if (destroyed) return Promise.resolve(undefined);
        if (controllers[index]) return Promise.resolve(controllers[index]);
        if (!pending[index]) {
            pending[index] = Promise.resolve().then(() => loadController(index)).then(controller => {
                if (destroyed) {
                    if (controller.destroy) controller.destroy();
                    return;
                }
                if (controller.initTab) controller.initTab();
                controllers[index] = controller;
                return controller;
            }).then(controller => {
                pending[index] = null;
                return controller;
            }, error => {
                pending[index] = null;
                throw error;
            });
        }
        return pending[index]!;
    }

    function reportError(error: unknown) {
        console.error('Failed to load library tab', error);
    }

    return {
        preload(index: number) {
            return get(index).then(controller => {
                if (!destroyed && controller && rendered.indexOf(index) === -1 && controller.preRender) {
                    controller.preRender();
                }
            }).catch(reportError);
        },
        render(index: number) {
            selectedIndex = index;
            const currentRendered = rendered;
            const currentRendering = rendering;
            if (!currentRendering[index]) {
                currentRendering[index] = get(index).then(controller => {
                    if (!destroyed && currentRendering === rendering && currentRendered === rendered && selectedIndex === index && controller && (currentRendered.indexOf(index) === -1 || controller.isRefreshInterrupted?.())) {
                        return Promise.resolve(controller.renderTab()).then(() => {
                            if (!destroyed && currentRendering === rendering && selectedIndex === index && currentRendered === rendered && currentRendered.indexOf(index) === -1) currentRendered.push(index);
                        });
                    }
                }).catch(reportError).then(() => {
                    currentRendering[index] = null;
                });
            }
            return currentRendering[index]!;
        },
        pause() {
            selectedIndex = null;
            rendering = [];
        },
        reset() {
            rendered = [];
            rendering = [];
        },
        destroy() {
            destroyed = true;
            controllers.forEach(controller => {
                if (controller.destroy) controller.destroy();
            });
        }
    };
}
