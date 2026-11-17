/** Gets a human readable string representing a file size in bytes */
export function getReadableSize(value: number, precision = 1) {
    let d = Math.log(value) / Math.log(1024) | 0;

    return (value / Math.pow(1024, d)).toFixed(precision)
        + ' ' + (d ? 'KMGTPEZY'[--d] + 'iB' : 'Bytes');
}
