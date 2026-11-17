import type { WindowsMediaAdapter } from 'lib/playback/types/htmlMedia';

type ApplicationView = {
    isViewModeSupported: (mode: string) => boolean;
    tryEnterViewModeAsync: (mode: string) => Promise<boolean>;
};
type WindowsPresentation = {
    UI: { ViewManagement: {
        ApplicationView: { getForCurrentView: () => ApplicationView };
        ApplicationViewMode: { compactOverlay: string; default: string };
    } };
};

declare global {
    interface Window {
        appMode?: string;
        Windows?: WindowsMediaAdapter & WindowsPresentation;
        webkitAudioContext: typeof AudioContext;
    }
    const Windows: WindowsMediaAdapter & WindowsPresentation;
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
