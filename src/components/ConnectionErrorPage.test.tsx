import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const selectServer = vi.hoisted(() => vi.fn());
const retry = vi.hoisted(() => ({ current: undefined as (() => void) | undefined }));
vi.mock('components/apphost', () => ({ appHost: { supports: () => true } }));
vi.mock('components/Page', () => ({ default: ({ children }: React.PropsWithChildren) => <div>{children}</div> }));
vi.mock('components/toast/toast', () => ({ default: vi.fn() }));
vi.mock('utils/dashboard', () => ({ selectServer }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('lib/jellyfin-apiclient', () => ({ ConnectionState: {}, ServerConnections: {} }));
vi.mock('elements/emby-button/LinkButton', () => ({
    default: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) => {
        if (children === 'Retry') retry.current = onClick;
        return <button type='button' onClick={onClick}>{children}</button>;
    }
}));

import ConnectionErrorPage from './ConnectionErrorPage';

afterEach(() => vi.unstubAllGlobals());

describe('Setup recovery controls', () => {
    it('offers setup guidance, retry and native-aware server selection', () => {
        const reload = vi.fn();
        const originalWindow = window;
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        const container = document.createElement('div');
        const root = createRoot(container);
        try {
            act(() => root.render(<ConnectionErrorPage state='SetupRequired' />));
            expect(container.textContent).toContain('MessageServerSetupRequired');
            const buttons = container.querySelectorAll('button');
            expect(buttons[0].textContent).toBe('ButtonChangeServer');
            expect(buttons[1].textContent).toBe('Retry');
            act(() => buttons[0].click());
            expect(selectServer).toHaveBeenCalledOnce();
            vi.stubGlobal('window', { location: { reload } });
            retry.current?.();
            expect(reload).toHaveBeenCalledOnce();
        } finally {
            vi.stubGlobal('window', originalWindow);
            act(() => root.unmount());
        }
    });
});
