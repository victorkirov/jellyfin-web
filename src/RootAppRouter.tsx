import { ThemeProvider } from '@mui/material/styles';
import React from 'react';
import {
    RouterProvider,
    createHashRouter,
    Outlet
} from 'react-router-dom';

import { APP_ROUTES as LEGACY_APP_ROUTES } from 'apps/legacy/routes/routes';
import AppHeader from 'components/AppHeader';
import Backdrop from 'components/Backdrop';
import ColorSchemeSync from 'components/ColorSchemeSync';
import BangRedirect from 'components/router/BangRedirect';
import { createRouterHistory } from 'components/router/routerHistory';
import { getTheme } from 'themes';
import { useDocumentColorScheme } from 'themes/useDocumentColorScheme';

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

export const history = createRouterHistory(router);

export default function RootAppRouter() {
    return <RouterProvider router={router} />;
}

/**
 * Layout component that renders legacy components required on all pages.
 * NOTE: The app will crash if these get removed from the DOM.
 */
function RootAppLayout() {
    const theme = getTheme(useDocumentColorScheme());

    return (
        <ThemeProvider
            theme={theme}
            defaultMode='dark'
            storageManager={null}
        >
            <ColorSchemeSync colorScheme={theme.defaultColorScheme} />
            <Backdrop />
            <AppHeader />

            <Outlet />
        </ThemeProvider>
    );
}
