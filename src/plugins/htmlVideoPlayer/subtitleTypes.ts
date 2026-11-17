// libbitsub marks updateCanvasSize protected, though the legacy player calls it
// after layout and resume. Keep that existing integration boundary explicit.
export type BitmapSubtitleRenderer = {
    timeOffset: number;
    dispose: () => void;
    updateCanvasSize?: () => void;
    setDebandEnabled?: (enabled: boolean) => void;
    setDebandThreshold?: (threshold: number) => void;
    setDebandRange?: (range: number) => void;
};
