declare module '@jellyfin/libass-wasm' {
    export type SubtitlesOctopusOptions = {
        video: HTMLVideoElement;
        subUrl: string;
        fonts: string[];
        workerUrl: string;
        legacyWorkerUrl: string;
        onError: () => void;
        timeOffset: number;
        renderMode: string;
        dropAllAnimations: boolean;
        libassMemoryLimit: number;
        libassGlyphLimit: number;
        targetFps: number;
        prescaleFactor: number;
        prescaleHeightLimit: number;
        maxRenderHeight: number;
        resizeVariation: number;
        renderAhead: number;
    };
    export default class SubtitlesOctopus {
        constructor(options: SubtitlesOctopusOptions);
        timeOffset: number;
        dispose(): void;
        resize(): void;
        resetRenderAheadCache(force: boolean): void;
    }
}
