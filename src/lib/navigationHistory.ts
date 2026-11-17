/* eslint-disable @typescript-eslint/no-explicit-any */
import { Action, parsePath, type Router, type RouterState } from '@remix-run/router';
import type { History, Listener, To } from 'history';

import Events, { type Event } from 'utils/events';

const HISTORY_UPDATE_EVENT = 'HISTORY_UPDATE';

export class RouterHistory implements History {
    private router?: Router;

    attach(router: Router) {
        if (this.router) throw new Error('Navigation router is already attached');
        this.router = router;

        router.subscribe(state => {
            console.debug('[RouterHistory] history update', state);
            Events.trigger(document, HISTORY_UPDATE_EVENT, [ state ]);
        });
    }

    private getRouter() {
        if (!this.router) throw new Error('Navigation router is not attached');
        return this.router;
    }

    createHref(to: any) {
        return this.getRouter().createHref(to);
    }

    get action() {
        return this.router?.state.historyAction || Action.Pop;
    }

    get location() {
        if (this.router) return this.router.state.location;

        // Shared modules initialize before the concrete hash router is created.
        const path = parsePath(window.location.hash.substring(1));
        let pathname = path.pathname || '/';
        if (!pathname.startsWith('/') && !pathname.startsWith('.')) pathname = '/' + pathname;
        return {
            pathname,
            search: path.search || '',
            hash: path.hash || '',
            state: window.history.state?.usr || null,
            key: window.history.state?.key || 'default'
        };
    }

    back() {
        void this.getRouter().navigate(-1);
    }

    forward() {
        void this.getRouter().navigate(1);
    }

    go(delta: number) {
        void this.getRouter().navigate(delta);
    }

    push(to: To, state?: any) {
        void this.getRouter().navigate(to, { state });
    }

    replace(to: To, state?: any): void {
        void this.getRouter().navigate(to, { state, replace: true });
    }

    block() {
        // NOTE: We don't seem to use this functionality, so leaving it unimplemented.
        throw new Error('`history.block()` is not implemented');
        return () => undefined;
    }

    listen(listener: Listener) {
        const compatListener = (_e: Event, state: RouterState) => {
            return listener({ action: state.historyAction, location: state.location });
        };

        Events.on(document, HISTORY_UPDATE_EVENT, compatListener);

        return () => Events.off(document, HISTORY_UPDATE_EVENT, compatListener);
    }
}

export const history = new RouterHistory();

export const attachRouter = (router: Router) => history.attach(router);

/* eslint-enable @typescript-eslint/no-explicit-any */
