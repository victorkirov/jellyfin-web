export type BrowserFlag = 'edge' | 'edg' | 'edga' | 'edgios' | 'edgeChromium' | 'firefox' | 'safari' | 'chrome' | 'opera' | 'osx' | 'ipad' | 'iphone' | 'ipod' | 'ps4' | 'tv' | 'mobile' | 'xboxOne' | 'hisense' | 'tizen' | 'vega' | 'vidaa' | 'web0s' | 'titanos' | 'edgeUwp' | 'orsay' | 'operaTv' | 'slow' | 'touch' | 'keyboard' | 'iOS' | 'windows' | 'android' | 'mozilla';

export type Browser = Partial<Record<BrowserFlag, boolean>> & {
    version?: string;
    versionMajor?: number;
    web0sVersion?: number;
    tizenVersion?: number;
    iOSVersion?: number | number[];
};
