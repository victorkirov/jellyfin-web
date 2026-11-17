import browser from '../../scripts/browser';
import { appRouter } from '../../components/router/appRouter';
import loading from '../../components/loading/loading';
import { setBackdropTransparency, TRANSPARENCY_LEVEL } from '../../components/backdrop/backdrop';
import Events from '../../utils/events';

import type YoutubePlayer from './plugin';
import type { YoutubeApiPlayer, YoutubePlayOptions, YoutubeWindow } from './youtubeTypes';

const youtubeWindow = window as unknown as YoutubeWindow;

const errorCodes: Record<number, string> = {
    2: 'YoutubeBadRequest',
    5: 'YoutubePlaybackError',
    100: 'YoutubeNotFound',
    101: 'YoutubeDenied',
    150: 'YoutubeDenied'
};

function zoomIn(elem: HTMLElement, iterations: number) {
    const keyframes = [
        { transform: 'scale3d(.2, .2, .2)  ', opacity: '.6', offset: 0 },
        { transform: 'none', opacity: '1', offset: 1 }
    ];

    const timing = { duration: 240, iterations: iterations };
    return elem.animate(keyframes, timing);
}

export function createMediaElement(instance: YoutubePlayer, options: YoutubePlayOptions) {
    return new Promise<HTMLElement | null>(function (resolve) {
        const dlg = document.querySelector('.youtubePlayerContainer');

        if (!dlg) {
            import('./style.scss').then(() => {
                loading.show();

                const playerDlg = document.createElement('div');

                playerDlg.classList.add('youtubePlayerContainer');

                if (options.fullscreen) {
                    playerDlg.classList.add('onTop');
                }

                playerDlg.innerHTML = '<div id="player"></div>';
                const videoElement = playerDlg.querySelector<HTMLElement>('#player');

                document.body.insertBefore(playerDlg, document.body.firstChild);
                instance.videoDialog = playerDlg;

                if (options.fullscreen) {
                    document.body.classList.add('hide-scroll');
                }

                if (options.fullscreen && typeof playerDlg.animate === 'function' && !browser.slow) {
                    zoomIn(playerDlg, 1).onfinish = function () {
                        resolve(videoElement);
                    };
                } else {
                    resolve(videoElement);
                }
            });
        } else {
            // we need to hide scrollbar when starting playback from page with animated background
            if (options.fullscreen) {
                document.body.classList.add('hide-scroll');
            }

            resolve(dlg.querySelector<HTMLElement>('#player'));
        }
    });
}

function onVideoResize(this: YoutubePlayer) {
    const instance = this;
    const player = instance.currentYoutubePlayer;
    const dlg = instance.videoDialog;
    if (player && dlg) {
        player.setSize(dlg.offsetWidth, dlg.offsetHeight);
    }
}

function clearTimeUpdateInterval(instance: YoutubePlayer) {
    if (instance.timeUpdateInterval) {
        clearInterval(instance.timeUpdateInterval);
    }
    instance.timeUpdateInterval = null;
}

export function onEndedInternal(instance: YoutubePlayer) {
    clearTimeUpdateInterval(instance);
    const resizeListener = instance.resizeListener;
    if (resizeListener) {
        window.removeEventListener('resize', resizeListener);
        window.removeEventListener('orientationChange', resizeListener);
        instance.resizeListener = null;
    }

    const stopInfo = {
        src: instance._currentSrc
    };

    Events.trigger(instance, 'stopped', [stopInfo]);

    instance._currentSrc = null;
    if (instance.currentYoutubePlayer) {
        instance.currentYoutubePlayer.destroy();
    }
    instance.currentYoutubePlayer = null;
}

// 4. The API will call this function when the video player is ready.
function onPlayerReady(event: { target: YoutubeApiPlayer }) {
    event.target.playVideo();
}

function onTimeUpdate(this: YoutubePlayer) {
    Events.trigger(this, 'timeupdate');
}

function onPlaying(instance: YoutubePlayer, playOptions: YoutubePlayOptions, resolve: () => void) {
    if (!instance.started) {
        instance.started = true;
        resolve();
        clearTimeUpdateInterval(instance);
        instance.timeUpdateInterval = setInterval(onTimeUpdate.bind(instance), 500);

        if (playOptions.fullscreen) {
            appRouter.showVideoOsd().then(function () {
                instance.videoDialog!.classList.remove('onTop');
            });
        } else {
            setBackdropTransparency(TRANSPARENCY_LEVEL.Backdrop);
            instance.videoDialog!.classList.remove('onTop');
        }

        loading.hide();
    }
}

export function setCurrentSrc(instance: YoutubePlayer, elem: HTMLElement | null, options: YoutubePlayOptions) {
    return new Promise<void>(function (resolve, reject) {
        instance._currentSrc = options.url;
        const params = new URLSearchParams(options.url.split('?')[1]);
        // 3. This function creates an <iframe> (and YouTube player)
        //    after the API code downloads.
        youtubeWindow.onYouTubeIframeAPIReady = function () {
            instance.currentYoutubePlayer = new youtubeWindow.YT.Player('player', {
                height: instance.videoDialog!.offsetHeight,
                width: instance.videoDialog!.offsetWidth,
                videoId: params.get('v'),
                events: {
                    'onReady': onPlayerReady,
                    'onStateChange': function (event) {
                        if (event.data === youtubeWindow.YT.PlayerState.PLAYING) {
                            onPlaying(instance, options, resolve);
                        } else if (event.data === youtubeWindow.YT.PlayerState.ENDED) {
                            onEndedInternal(instance);
                        } else if (event.data === youtubeWindow.YT.PlayerState.PAUSED) {
                            Events.trigger(instance, 'pause');
                        }
                    },
                    'onError': (e) => reject(errorCodes[e.data] || 'ErrorDefault')
                },
                playerVars: {
                    controls: 0,
                    enablejsapi: 1,
                    modestbranding: 1,
                    rel: 0,
                    showinfo: 0,
                    fs: 0,
                    playsinline: 1
                }
            });

            let resizeListener = instance.resizeListener;
            if (resizeListener) {
                window.removeEventListener('resize', resizeListener);
                window.addEventListener('resize', resizeListener);
            } else {
                resizeListener = instance.resizeListener = onVideoResize.bind(instance);
                window.addEventListener('resize', resizeListener);
            }
            window.removeEventListener('orientationChange', resizeListener);
            window.addEventListener('orientationChange', resizeListener);
        };

        if (!youtubeWindow.YT) {
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode!.insertBefore(tag, firstScriptTag);
        } else {
            youtubeWindow.onYouTubeIframeAPIReady();
        }
    });
}

