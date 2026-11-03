import { ThemeProvider } from '@mui/material/styles';
import { QueryClientProvider } from '@tanstack/react-query';
import React, { type FC, type PropsWithChildren } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import ColorSchemeSync from 'components/ColorSchemeSync';
import { ApiProvider } from 'hooks/useApi';
import { UserSettingsProvider } from 'hooks/useUserSettings';
import { useUserTheme } from 'hooks/useUserTheme';
import { WebConfigProvider } from 'hooks/useWebConfig';
import { getTheme } from 'themes';
import { queryClient } from 'utils/query/queryClient';

/**
 * Render a React component outside of the main React app context
 * i.e. within a legacy view/controller page.
 */
export const renderComponent = <P extends object> (
    Component: FC<P>,
    props: P,
    element: HTMLElement
) => {
    const root = createRoot(element);

    flushSync(() => {
        root.render(
            <RootContext>
                <Component {...props} />
            </RootContext>
        );
    });

    // NOTE: We need to wrap the unmount in a setTimeout to workaround this issue with nested roots:
    // https://github.com/facebook/react/issues/25675
    return () => setTimeout(() => root.unmount());
};

/** Theme provider for the user's selected theme. */
const UserThemeProvider: FC<PropsWithChildren> = ({ children }) => {
    const { theme } = useUserTheme();
    const muiTheme = getTheme(theme);

    return (
        <ThemeProvider
            theme={muiTheme}
            // Disable color scheme management since we're handling it manually
            colorSchemeNode={null}
            storageManager={null}
            disableStyleSheetGeneration
        >
            <ColorSchemeSync colorScheme={muiTheme.defaultColorScheme} />
            {children}
        </ThemeProvider>
    );
};

/** Component that provides a root context that matches the application root. */
const RootContext: FC<PropsWithChildren> = ({ children }) => {
    return (
        <QueryClientProvider client={queryClient}>
            <ApiProvider>
                <UserSettingsProvider>
                    <WebConfigProvider>
                        <UserThemeProvider>
                            {children}
                        </UserThemeProvider>
                    </WebConfigProvider>
                </UserSettingsProvider>
            </ApiProvider>
        </QueryClientProvider>
    );
};
