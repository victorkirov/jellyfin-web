import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const selectServer = vi.hoisted(() => vi.fn());
const forceConnect = vi.hoisted(() => ({ current: undefined as (() => Promise<void>) | undefined }));
const connection = vi.hoisted(() => ({ getLastUsedServer: vi.fn(), updateSavedServerId: vi.fn() }));
const retry = vi.hoisted(() => ({ current: undefined as (() => void) | undefined }));
vi.mock('components/apphost', () => ({ appHost: { supports: () => true } }));
vi.mock('components/Page', () => ({ default: ({ children }: React.PropsWithChildren) => <div>{children}</div> }));
vi.mock('components/toast/toast', () => ({ default: vi.fn() }));
vi.mock('components/dashboard', () => ({ selectServer }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('lib/jellyfin-apiclient', () => ({ ConnectionState: { ServerMismatch: 'ServerMismatch' }, ServerConnections: connection }));
vi.mock('components/buttons/LinkButton', () => ({
    default: ({ children, onClick, style }: React.PropsWithChildren<{ onClick?: () => void | Promise<void>; style?: React.CSSProperties }>) => {
        if (children === 'Retry') retry.current = onClick;
        if (children === 'ConnectAnyway') forceConnect.current = onClick as () => Promise<void>;
        return <button type='button' style={style} onClick={onClick}>{children}</button>;
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

describe('force-connect recovery', () => {
    it.each([null, { Id: 'server' }])('releases its disabled control after missing/invalid saved addresses', async server => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        connection.getLastUsedServer.mockReturnValue(server);
        connection.updateSavedServerId.mockRejectedValue(new Error('No eligible server address'));
        const container = document.createElement('div');
        const root = createRoot(container);
        try {
            await act(async () => root.render(<ConnectionErrorPage state={'ServerMismatch' as React.ComponentProps<typeof ConnectionErrorPage>['state']} />));
            await act(async () => forceConnect.current?.());
            const connect = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'ConnectAnyway');
            expect(connect).toBeDefined();
            expect(connect?.style.pointerEvents).not.toBe('none');
        } finally {
            act(() => root.unmount());
        }
    });
});
