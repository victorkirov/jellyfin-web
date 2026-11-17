import React, { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ItemDetailsMetadataGroup from 'components/itemDetails/ItemDetailsMetadataGroup';
import { renderComponent } from './renderComponent';

const subscriptions = vi.hoisted(() => ({ api: vi.fn(), settings: vi.fn(), query: vi.fn() }));
vi.mock('hooks/useApi', () => ({ ApiProvider: ({ children }: React.PropsWithChildren) => {
    subscriptions.api();
    return <div>{children}</div>;
} }));
vi.mock('hooks/useUserSettings', () => ({ UserSettingsProvider: ({ children }: React.PropsWithChildren) => {
    subscriptions.settings();
    return <div>{children}</div>;
} }));
vi.mock('utils/query/queryClient', () => ({ queryClient: {} }));
vi.mock('@tanstack/react-query', () => ({ QueryClientProvider: ({ children }: React.PropsWithChildren) => {
    subscriptions.query();
    return <div>{children}</div>;
} }));
vi.mock('components/router/appRouter', () => ({ appRouter: { getRouteUrl: (item: { Id: string }) => '#/details?id=' + item.Id } }));
vi.mock('components/buttons/LinkButton', () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
let language = 'en';
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => language + ':' + key } }));

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
    language = 'en';
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

it('renders metadata through repeated details navigation, version and language refresh without application subscriptions', async () => {
    const container = document.createElement('div');
    container.dir = 'rtl';
    for (let index = 0; index < 3; index++) {
        language = index ? 'bg' : 'en';
        let unmount!: () => ReturnType<typeof setTimeout>;
        act(() => {
            unmount = renderComponent(ItemDetailsMetadataGroup, { item: { GenreItems: [{ Id: String(index), Name: 'Drama' }] }, context: 'movies' }, container);
        });
        expect(container.querySelector('a')?.getAttribute('href')).toBe('#/details?id=' + index);
        expect(container.querySelector('.label')?.textContent).toBe(language + ':Genre');
        expect(container.querySelector('.focuscontainer-x .button-link')).not.toBeNull();
        expect(container.dir).toBe('rtl');
        unmount();
        await act(async () => {
            await vi.runAllTimersAsync();
        });
        expect(container.childNodes).toHaveLength(0);
    }
    expect(subscriptions.api).not.toHaveBeenCalled();
    expect(subscriptions.settings).not.toHaveBeenCalled();
    expect(subscriptions.query).not.toHaveBeenCalled();
});
