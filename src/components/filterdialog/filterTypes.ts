export type FilterQuery = Record<string, unknown> & {
    Filters?: string | null; VideoTypes?: string | null; SeriesStatus?: string | null;
    Genres?: string | null; Tags?: string | null; Years?: string | null; OfficialRatings?: string | null;
};
export type FilterOptions = { query: FilterQuery; mode: string; serverId: string; hasFilters?: boolean };
