import { expect, it, vi } from 'vitest';
import { useSearchSuggestions } from './useSearchSuggestions';

const mocks = vi.hoisted(() => ({ getItems: vi.fn().mockResolvedValue({ data: { Items: [] } }), useQuery: vi.fn() }));
vi.mock('@jellyfin/sdk/lib/utils/api/library-api', () => ({ getLibraryApi: () => ({ getItems: mocks.getItems }) }));
vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.useQuery }));
vi.mock('hooks/useApi', () => ({ useApi: () => ({ api: { basePath: '/test' }, user: { Id: 'user' } }) }));
vi.mock('utils/query/queryKeys', () => ({ userQueryKey: () => ['suggestions'] }));

it('requests eight suggestions at the API boundary, preserving the parent scope', async () => {
    mocks.getItems.mockResolvedValue({ data: { Items: [] } });
    useSearchSuggestions('library');
    const options = mocks.useQuery.mock.calls[0][0] as { queryFn(context: { signal?: AbortSignal }): Promise<unknown> };
    await options.queryFn({ signal: undefined });
    expect(mocks.getItems).toHaveBeenCalledWith(expect.objectContaining({ limit: 8, parentId: 'library', recursive: true }), { signal: undefined });
});
