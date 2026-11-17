export type BrowserFlag = 'edge' | 'edg' | 'edga' | 'edgios' | 'edgeChromium' | 'firefox' | 'safari' | 'chrome' | 'opera' | 'osx' | 'ipad' | 'iphone' | 'ipod' | 'ps4' | 'tv' | 'mobile' | 'xboxOne' | 'animate' | 'hisense' | 'tizen' | 'vega' | 'vidaa' | 'web0s' | 'titanos' | 'edgeUwp' | 'orsay' | 'operaTv' | 'slow' | 'touch' | 'keyboard' | 'iOS' | 'windows' | 'android';

export type Browser = Partial<Record<BrowserFlag, boolean>> & {
    version?: string;
    versionMajor?: number;
    web0sVersion?: number;
    tizenVersion?: number;
    iOSVersion?: number | number[];
    supportsCssAnimation(allowPrefix?: boolean): boolean;
};
