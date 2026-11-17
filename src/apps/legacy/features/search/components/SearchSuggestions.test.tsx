import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import SearchSuggestions from './SearchSuggestions';

vi.mock('../api/useSearchSuggestions', () => ({ useSearchSuggestions: () => ({ isPending: false, data: Array.from({ length: 12 }, (_, index) => ({ Id: String(index), Name: 'Title ' + index })) }) }));
vi.mock('components/buttons/emby-button', () => ({}));
vi.mock('components/buttons/LinkButton', () => ({ default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{props.children}</a> }));
vi.mock('components/router/appRouter', () => ({ appRouter: { getRouteUrl: ({ Id }: { Id: string }) => '#/details?id=' + Id } }));
vi.mock('lib/globalize', () => ({ default: { translate: (label: string) => label } }));

it('limits cached suggestions to eight full-row navigation links', () => {
    const element = document.createElement('main');
    element.innerHTML = renderToStaticMarkup(<SearchSuggestions />);
    const links = element.querySelectorAll('a.searchSuggestion');
    expect(links).toHaveLength(8);
    expect(links[0].textContent).toBe('Title 0');
    expect(links[7].getAttribute('href')).toBe('#/details?id=7');
    expect(element.querySelector('[style]')).toBeNull();
});
