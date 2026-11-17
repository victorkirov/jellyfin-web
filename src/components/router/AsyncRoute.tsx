import type { RouteObject } from 'react-router-dom';

export interface AsyncRoute {
    /** The URL path for this route. */
    path: string
    /**
     * The relative path to the page component in the routes directory.
     * Will fallback to using the `path` value if not specified.
     */
    page?: string
}

const importRoute = (page: string) => (
    import(/* webpackChunkName: "[request]" */ `../../apps/legacy/routes/${page}`)
);

export const toAsyncPageRoute = ({
    path,
    page
}: AsyncRoute): RouteObject => {
    return {
        path,
        lazy: async () => {
            const {
                // If there is a default export, use it as the Component for compatibility
                default: Component,
                ...route
            } = await importRoute(page ?? path);

            return {
                Component,
                ...route
            };
        }
    };
};
