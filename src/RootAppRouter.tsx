import React from 'react';
import {
    RouterProvider,
    createHashRouter,
    Outlet
} from 'react-router-dom';

import { APP_ROUTES as LEGACY_APP_ROUTES } from 'apps/legacy/routes/routes';
import AppHeader from 'components/AppHeader';
import Backdrop from 'components/Backdrop';
import BangRedirect from 'components/router/BangRedirect';
import { attachRouter } from 'lib/navigationHistory';

const router = createHashRouter([
    {
        element: <RootAppLayout />,
        children: [
            ...LEGACY_APP_ROUTES,
            {
                path: '!/*',
                Component: BangRedirect
            }
        ]
    }
]);

attachRouter(router);

export default function RootAppRouter() {
    return <RouterProvider router={router} />;
}

/**
 * Layout component that renders legacy components required on all pages.
 * NOTE: The app will crash if these get removed from the DOM.
 */
function RootAppLayout() {
    return (
        <>
            <Backdrop />
            <AppHeader />

            <Outlet />
        </>
    );
}
