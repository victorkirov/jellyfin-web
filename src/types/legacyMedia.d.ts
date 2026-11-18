export {};

declare global {
    interface Window {
        appMode?: string;
        webkitAudioContext: typeof AudioContext;
    }
    const tizen: { application: { getCurrentApplication: () => { exit: () => void } } };
    const webOS: { platformBack: () => void };
    interface Navigator { audioSession: { type: string } }
    interface Document {
        AirPlayEnabled?: boolean;
        AirplayElement?: HTMLMediaElement;
        exitAirPLay: () => Promise<void>;
        windowState?: string;
        webkitHidden?: boolean;
        webkitIsFullScreen?: boolean;
        webkitCancelFullscreen?: () => void;
    }
    interface HTMLElement {
        mozRequestFullScreen?: () => void;
        webkitRequestFullscreen?: () => void;
        msRequestFullscreen?: () => void;
    }
    interface HTMLMediaElement {
        requestAirPlay: () => Promise<void>;
        webkitShowPlaybackTargetPicker: () => void;
    }
    interface HTMLVideoElement {
        audioTracks?: ArrayLike<{ enabled: boolean }>;
        brightnessValue?: number;
        webkitEnterFullscreen?: () => void;
        webkitSupportsPresentationMode?: (mode: string) => boolean;
        webkitSetPresentationMode?: (mode: string) => void;
        webkitPresentationMode?: string;
        webkitShowPlaybackTargetPicker: () => void;
    }
    interface CSSStyleDeclaration { '-webkit-filter': string; 'object-fit': string }
}
