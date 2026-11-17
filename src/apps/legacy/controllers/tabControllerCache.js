export default function createTabControllerCache(loadController) {
    const controllers = [];
    const pending = [];
    let rendered = [];
    let rendering = [];
    let destroyed = false;
    let selectedIndex;

    function get(index) {
        if (destroyed) return Promise.resolve();
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
        return pending[index];
    }

    function reportError(error) {
        console.error('Failed to load library tab', error);
    }

    return {
        preload(index) {
            return get(index).then(controller => {
                if (!destroyed && controller && rendered.indexOf(index) === -1 && controller.preRender) {
                    controller.preRender();
                }
            }).catch(reportError);
        },
        render(index) {
            selectedIndex = index;
            const currentRendered = rendered;
            const currentRendering = rendering;
            if (!currentRendering[index]) {
                currentRendering[index] = get(index).then(controller => {
                    if (!destroyed && selectedIndex === index && controller && currentRendered.indexOf(index) === -1) {
                        return Promise.resolve(controller.renderTab()).then(() => {
                            if (!destroyed && selectedIndex === index && currentRendered === rendered) currentRendered.push(index);
                        });
                    }
                }).catch(reportError).then(() => {
                    currentRendering[index] = null;
                });
            }
            return currentRendering[index];
        },
        pause() {
            selectedIndex = null;
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
