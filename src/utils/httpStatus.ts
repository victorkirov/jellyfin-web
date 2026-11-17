/** Read HTTP status from SDK/Axios errors, fetch responses and legacy errors. */
export function getHttpStatus(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') return undefined;
    const requestError = error as {
        response?: { status?: unknown };
        status?: unknown;
        statusCode?: unknown;
    };
    const status = requestError.response?.status ?? requestError.status ?? requestError.statusCode;
    return typeof status === 'number' ? status : undefined;
}
