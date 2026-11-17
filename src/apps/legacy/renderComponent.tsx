import { QueryClientProvider } from '@tanstack/react-query';
import React, { type FC, type PropsWithChildren } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import { ApiProvider } from 'hooks/useApi';
import { UserSettingsProvider } from 'hooks/useUserSettings';
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

/** Component that provides a root context that matches the application root. */
const RootContext: FC<PropsWithChildren> = ({ children }) => {
    return (
        <QueryClientProvider client={queryClient}>
            <ApiProvider>
                <UserSettingsProvider>
                    {children}
                </UserSettingsProvider>
            </ApiProvider>
        </QueryClientProvider>
    );
};
