/**
 * App types represented in src/apps.
 * Used in route definitions to determine where to load relevant components from.
 */
export enum AppType {
    /** The legacy app. */
    Legacy = 'legacy',
    /** The modern React app. */
    Modern = 'modern'
}
