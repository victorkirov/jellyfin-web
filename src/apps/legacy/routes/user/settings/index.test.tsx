import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import UserSettingsPage from './index';

vi.mock('react-router-dom', () => ({ useSearchParams: () => [new URLSearchParams()] }));
const user = { Id: 'user', Name: 'vic' };
vi.mock('hooks/useApi', () => ({ useApi: () => ({ user }) }));
vi.mock('hooks/useUsers', () => ({ useUsers: () => ({ data: [] }) }));
vi.mock('hooks/useQuickConnect', () => ({ useQuickConnectEnabled: () => ({ data: true, isPending: false }) }));
vi.mock('components/apphost', () => ({ appHost: { supports: () => true } }));
vi.mock('components/dashboard', () => ({ default: {} }));
vi.mock('scripts/shell', () => ({ default: {} }));
vi.mock('components/loading/LoadingComponent', () => ({ default: () => null }));
vi.mock('components/Page', () => ({ default: ({ children }: React.PropsWithChildren) => <div className='page'>{children}</div> }));
vi.mock('components/buttons/LinkButton', () => ({ default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{props.children}</a> }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string, value: string) => ({ SettingsThisTV: 'This TV', SettingsAccount: `Account (${value})` }[key] || key) } }));

it('focuses the first menu row on view show and groups TV and account settings inside a horizontal boundary', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<UserSettingsPage />));
    const page = container.querySelector<HTMLElement>('.page')!;
    act(() => {
        page.dispatchEvent(new Event('viewshow'));
    });
    expect(document.activeElement).toBe(container.querySelector('.lnkPlaybackPreferences'));
    expect(container.querySelector('.focuscontainer-x')).not.toBeNull();
    expect(Array.from(container.querySelectorAll('h2')).map(heading => heading.textContent)).toEqual(['This TV', 'Account (vic)']);
    act(() => root.unmount());
    container.remove();
});
