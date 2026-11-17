import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

export type LibraryQuery = { StartIndex: number; Limit?: number; SortBy?: string; ParentId?: string; NameLessThan?: string; NameStartsWith?: string | null; [key: string]: string | number | boolean | null | undefined };
export type LibraryPageData = { query: LibraryQuery; view?: string };
export type LibraryResult = { Items: BaseItemDto[]; TotalRecordCount: number };
export type LibraryController = { alphaPicker?: { updateControls(query: LibraryQuery): void }; getCurrentViewStyle(): string | undefined; renderTab(): Promise<void>; showFilterMenu(): void };
