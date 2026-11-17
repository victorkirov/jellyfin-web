/**
 * Server state values for a connected server used by jellyfin-apiclient.
 */
export const enum ConnectionState {
    SignedIn = 'SignedIn',
    ServerMismatch = 'ServerMismatch',
    ServerSignIn = 'ServerSignIn',
    ServerSelection = 'ServerSelection',
    ServerUpdateNeeded = 'ServerUpdateNeeded',
    /** A newer connection or session action owns the continuation. */
    Superseded = 'Superseded',
    Unavailable = 'Unavailable'
}
