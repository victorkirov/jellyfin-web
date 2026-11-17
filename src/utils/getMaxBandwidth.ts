/** Browser downlinkMax is decimal Mbps; return whole bits/second with 30% headroom. */
export const getMaxBandwidth = (): number | null => {
    const connection = (navigator as Navigator & { connection?: { downlinkMax?: number } }).connection;
    const downlinkMbps = connection?.downlinkMax;
    if (typeof downlinkMbps !== 'number' || !Number.isFinite(downlinkMbps) || downlinkMbps <= 0) return null;
    return Math.floor(downlinkMbps * 1_000_000 * 0.7);
};
