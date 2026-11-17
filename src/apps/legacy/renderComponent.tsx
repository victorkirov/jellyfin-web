import React, { type FC } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

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
            <Component {...props} />
        );
    });

    // NOTE: We need to wrap the unmount in a setTimeout to workaround this issue with nested roots:
    // https://github.com/facebook/react/issues/25675
    return () => setTimeout(() => root.unmount());
};
