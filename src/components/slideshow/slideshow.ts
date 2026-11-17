/**
 * Image viewer component
 * @module components/slideshow/slideshow
 */
import screenfull from 'screenfull';

import dialogHelper from '../dialogHelper/dialogHelper';
import inputManager from '../../scripts/inputManager';
import browser from '../../scripts/browser';
import { appHost } from '../apphost';
import dom from '../../utils/dom';

import './style.scss';
import type Swiper from 'swiper';
import type { SwiperOptions } from 'swiper/types';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type { Slide, SlideshowOptions } from './slideshowTypes';
import { getImgUrl } from './slideshowImages';
import { getSwiperSlideHtmlFromSlide } from './slideshowMarkup';

/**
 * Name of transition event.
 */
const transitionEndEventName = dom.whichTransitionEvent();

/**
 * Flag to use fake image to fix blurry zoomed image.
 * At least WebKit doesn't restore quality for zoomed images.
 */
const useFakeZoomImage = !!browser.safari;

/**
 * Sets the viewport meta tag to enable or disable scaling by the user.
 * @param {boolean} scalable - Flag to set the scalability of the viewport.
 */
function setUserScalable(scalable: boolean) {
    try {
        appHost.setUserScalable(scalable);
    } catch (err) {
        console.error('error in appHost.setUserScalable: ' + err);
    }
}

export default class Slideshow {
    show!: () => void;
    hide!: () => void;

    constructor(options: SlideshowOptions) {
        const self = this;
        /** Initialized instance of Swiper. */
        let swiperInstance: Swiper | null;
        /** Initialized instance of the dialog containing the Swiper instance. */
        let dialog: ReturnType<typeof dialogHelper.createDialog>;
        /** Options of the slideshow components */
        let currentOptions: SlideshowOptions;

        /**
     * Creates the HTML markup for the dialog and images.
     * @param {Object} options - Options used to create the dialog and slideshow.
     */
        function createElements(slideshowOptions: SlideshowOptions) {
            currentOptions = slideshowOptions;

            const dialogOptions = {
                exitAnimationDuration: slideshowOptions.interactive ? 400 : 800,
                size: 'fullscreen',
                autoFocus: false,
                scrollY: false,
                exitAnimation: 'fadeout',
                removeOnClose: true
            };
            dialog = dialogHelper.createDialog(dialogOptions);

            dialog.classList.add('slideshowDialog');

            let html = '';

            html += '<div class="slideshowSwiperContainer"><div class="swiper-wrapper"></div></div>';

            html += '<div class="slideshowImage"></div><h1 class="slideshowImageText"></h1>';

            dialog.innerHTML = html;

            setUserScalable(true);

            dialogHelper.open(dialog).then(function () {
                setUserScalable(false);
            });

            inputManager.on(window, onInputCommand);

            dialog.addEventListener('close', onDialogClosed);

            loadSwiper(dialog, options);
        }

        /**
     * Handles zoom changes.
     */
        function onZoomChange(swiper: Swiper, scale: number, imageEl: HTMLElement, slideEl: HTMLElement) {
            const zoomImage = slideEl.querySelector<HTMLElement>('.swiper-zoom-fakeimg');

            if (zoomImage) {
                zoomImage.style.width = zoomImage.style.height = scale * 100 + '%';

                if (scale > 1) {
                    if (zoomImage.classList.contains('swiper-zoom-fakeimg-hidden')) {
                    // Await for Swiper style changes
                        setTimeout(() => {
                            const callback = () => {
                                imageEl.removeEventListener(transitionEndEventName, callback);
                                zoomImage.classList.remove('swiper-zoom-fakeimg-hidden');
                            };

                            // Swiper set 'transition-duration: 300ms' for auto zoom
                            // and 'transition-duration: 0s' for touch zoom
                            const transitionDuration = parseFloat(imageEl.style.transitionDuration.replace(/[a-z]/i, ''));

                            if (transitionDuration > 0) {
                                imageEl.addEventListener(transitionEndEventName, callback);
                            } else {
                                callback();
                            }
                        }, 0);
                    }
                } else {
                    zoomImage.classList.add('swiper-zoom-fakeimg-hidden');
                }
            }
        }

        /**
     * Initializes the Swiper instance and binds the relevant events.
     * @param {HTMLElement} dialog - Element containing the dialog.
     * @param {Object} options - Options used to initialize the Swiper instance.
     */
        function loadSwiper(dialogElement: HTMLElement, swiperOptions: SlideshowOptions) {
            let slides;
            if (currentOptions.slides) {
                slides = currentOptions.slides;
            } else {
                slides = currentOptions.items;
            }

            //eslint-disable-next-line import/no-unresolved
            import('swiper/css/bundle');

            // eslint-disable-next-line import/no-unresolved
            import('swiper/bundle').then(({ Swiper }) => {
                const config: SwiperOptions & { preloadImages: boolean; slidesPerColumn: number } = {
                    direction: 'horizontal',
                    // Loop is disabled due to the virtual slides option not supporting it.
                    loop: false,
                    zoom: {
                        minRatio: 1,
                        toggle: true
                    },
                    autoplay: swiperOptions.autoplay ?? !swiperOptions.interactive,
                    keyboard: {
                        enabled: true
                    },
                    preloadImages: true,
                    slidesPerView: 1,
                    slidesPerColumn: 1,
                    initialSlide: swiperOptions.startIndex || 0,
                    speed: 240,
                    // Virtual slides reduce memory consumption for large libraries while allowing preloading of images;
                    virtual: {
                        slides: slides || [],
                        cache: true,
                        renderSlide: getSwiperSlideHtml,
                        addSlidesBefore: 1,
                        addSlidesAfter: 1
                    }
                };
                swiperInstance = new Swiper(dialogElement.querySelector<HTMLElement>('.slideshowSwiperContainer')!, config);

                if (useFakeZoomImage) {
                    swiperInstance!.on('zoomChange', onZoomChange);
                }
            });
        }

        /**
     * Renders the HTML markup of a slide for an item or a slide.
     * @param {Object} item - The item used to render the slide.
     * @returns {string} The HTML markup of the slide.
     */
        function getSwiperSlideHtml(item: Slide | BaseItemDto) {
            if (currentOptions.slides) {
                return getSwiperSlideHtmlFromSlide(item as Slide, useFakeZoomImage);
            } else {
                return getSwiperSlideHtmlFromItem(item as BaseItemDto);
            }
        }

        /**
     * Renders the HTML markup of a slide for an item.
     * @param {Object} item - Item used to generate the slide.
     * @returns {string} The HTML markup of the slide.
     */
        function getSwiperSlideHtmlFromItem(item: BaseItemDto) {
            return getSwiperSlideHtmlFromSlide({
                originalImage: getImgUrl(item, currentOptions.user),
                Id: item.Id,
                ServerId: item.ServerId
            }, useFakeZoomImage);
        }

        /**
     * Renders the HTML markup of a slide for a slide object.
     * @param {Object} item - Slide object used to generate the slide.
     * @returns {string} The HTML markup of the slide.
     */
        /**
     * Starts the autoplay feature of the Swiper instance.
     */
        function play() {
            if (swiperInstance?.autoplay) {
                swiperInstance.autoplay.start();
            }
        }

        /**
     * Pauses the autoplay feature of the Swiper instance;
     */
        function pause() {
            if (swiperInstance?.autoplay) {
                swiperInstance.autoplay.stop();
            }
        }

        /**
     * Toggles the autoplay feature of the Swiper instance.
     */
        function playPause() {
            const paused = !swiperInstance?.autoplay?.running;
            if (paused) {
                play();
            } else {
                pause();
            }
        }

        /**
     * Closes the dialog and destroys the Swiper instance.
     */
        function onDialogClosed() {
            if (screenfull.isFullscreen) screenfull.exit();

            const swiper = swiperInstance;
            if (swiper) {
                swiper.destroy(true, true);
                swiperInstance = null;
            }

            inputManager.off(window, onInputCommand);

            currentOptions.onClose?.();
        }

        /**
     * Dispatches keyboard inputs to their proper handlers.
     * @param {Event} event - Keyboard input event.
     */
        function onInputCommand(event: Event) {
            switch ((event as CustomEvent<{ command: string }>).detail.command) {
                case 'play':
                    play();
                    break;
                case 'pause':
                    pause();
                    break;
                case 'playpause':
                    playPause();
                    break;
                default:
                    break;
            }
        }

        /**
     * Shows the slideshow component.
     */
        self.show = function () {
            createElements(options);
        };

        /**
     * Hides the slideshow element.
     */
        self.hide = function () {
            if (dialog) {
                dialogHelper.close(dialog);
            }
        };
    }
}
