import { type SupportedColorScheme, ThemeProvider, useColorScheme } from '@mui/material/styles';
import React, { useEffect } from 'react';
import {
    RouterProvider,
    createHashRouter,
    Outlet,
    useLocation
} from 'react-router-dom';

import { DASHBOARD_APP_PATHS, DASHBOARD_APP_ROUTES } from 'apps/dashboard/routes/routes';
import { APP_ROUTES as MODERN_APP_ROUTES } from 'apps/modern/routes/routes';
import { APP_ROUTES as LEGACY_APP_ROUTES } from 'apps/legacy/routes/routes';
import { WIZARD_APP_ROUTES } from 'apps/wizard/routes/routes';
import AppHeader from 'components/AppHeader';
import Backdrop from 'components/Backdrop';
import layoutManager from 'components/layoutManager';
import BangRedirect from 'components/router/BangRedirect';
import { createRouterHistory } from 'components/router/routerHistory';
import { getTheme } from 'themes';
import { useDocumentColorScheme } from 'themes/useDocumentColorScheme';

const router = createHashRouter([
    {
        element: <RootAppLayout />,
        children: [
            ...(layoutManager.modern ? MODERN_APP_ROUTES : LEGACY_APP_ROUTES),
            ...DASHBOARD_APP_ROUTES,
            ...WIZARD_APP_ROUTES,
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

/** Switches MUI to the color scheme of the current theme. */
function ColorSchemeSync({ colorScheme }: { colorScheme: SupportedColorScheme }) {
    const { setColorScheme } = useColorScheme();

    useEffect(() => {
        setColorScheme(colorScheme);
    }, [ colorScheme, setColorScheme ]);

    return null;
}

/**
 * Layout component that renders legacy components required on all pages.
 * NOTE: The app will crash if these get removed from the DOM.
 */
function RootAppLayout() {
    const location = useLocation();
    const theme = getTheme(useDocumentColorScheme());
    const isNewLayoutPath = Object.values(DASHBOARD_APP_PATHS)
        .some(path => location.pathname.startsWith(`/${path}`));

    return (
        <ThemeProvider
            theme={theme}
            defaultMode='dark'
            storageManager={null}
        >
            <ColorSchemeSync colorScheme={theme.defaultColorScheme} />
            <Backdrop />
            <AppHeader isHidden={layoutManager.modern || isNewLayoutPath} />

            <Outlet />
        </ThemeProvider>
    );
}
