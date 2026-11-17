export const FALLBACK_THEME_ID = 'dark';

export function useUserTheme() {
    return {
        theme: FALLBACK_THEME_ID,
        dashboardTheme: FALLBACK_THEME_ID
    };
}
