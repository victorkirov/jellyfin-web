import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

export type LibraryQuery = { StartIndex: number; Limit?: number; SortBy?: string; ParentId?: string; NameLessThan?: string; NameStartsWith?: string; [key: string]: string | number | boolean | undefined };
export type LibraryPageData = { query: LibraryQuery; view?: string };
export type LibraryResult = { Items: BaseItemDto[]; TotalRecordCount: number };
export type LibraryController = { alphaPicker?: { updateControls(query: LibraryQuery): void }; getCurrentViewStyle(): string | undefined; renderTab(): void; showFilterMenu(): void };
