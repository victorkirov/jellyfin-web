export type YoutubePlayOptions = { url: string; fullscreen?: boolean };

export type YoutubeApiPlayer = {
    setSize(width: number, height: number): void;
    destroy(): void;
    playVideo(): void;
    stopVideo(): void;
    pauseVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): number;
    setVolume(volume: number): void;
    getVolume(): number;
    mute(): void;
    unMute(): void;
    isMuted(): boolean;
};

type YoutubePlayerOptions = {
    height: number;
    width: number;
    videoId: string | null;
    events: {
        onReady(event: { target: YoutubeApiPlayer }): void;
        onStateChange(event: { data: number }): void;
        onError(event: { data: number }): void;
    };
    playerVars: Record<string, number>;
};

export type YoutubeWindow = Window & {
    YT: {
        Player: new (id: string, options: YoutubePlayerOptions) => YoutubeApiPlayer;
        PlayerState: { PLAYING: number; ENDED: number; PAUSED: number };
    };
    onYouTubeIframeAPIReady(): void;
};
