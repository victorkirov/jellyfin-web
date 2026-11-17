/**
 * Image viewer component
 * @module components/slideshow/slideshow
 */
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import screenfull from 'screenfull';

import { ServerConnections } from 'lib/jellyfin-apiclient';
import { randomInt } from 'utils/number';

import dialogHelper from '../dialogHelper/dialogHelper';
import inputManager from '../../scripts/inputManager';
import browser from '../../scripts/browser';
import { appHost } from '../apphost';
import dom from '../../utils/dom';

import './style.scss';

/**
 * Name of transition event.
 */
const transitionEndEventName = dom.whichTransitionEvent();

/**
 * Flag to use fake image to fix blurry zoomed image.
 * At least WebKit doesn't restore quality for zoomed images.
 */
const useFakeZoomImage = browser.safari;

/**
 * Retrieves an item's image URL from the API.
 * @param {object|string} item - Item used to generate the image URL.
 * @param {object} options - Options of the image.
 * @param {object} apiClient - API client instance used to retrieve the image.
 * @returns {null|string} URL of the item's image.
 */
function getImageUrl(item, options, apiClient) {
    options = options || {};
    options.type = options.type || 'Primary';

    if (typeof (item) === 'string') {
        return apiClient.getScaledImageUrl(item, options);
    }

    if (item.ImageTags?.[options.type]) {
        options.tag = item.ImageTags[options.type];
        return apiClient.getScaledImageUrl(item.Id, options);
    }

    if (options.type === 'Primary' && item.AlbumId && item.AlbumPrimaryImageTag) {
        options.tag = item.AlbumPrimaryImageTag;
        return apiClient.getScaledImageUrl(item.AlbumId, options);
    }

    return null;
}

/**
 * Retrieves a backdrop's image URL from the API.
 * @param {object} item - Item used to generate the image URL.
 * @param {object} options - Options of the image.
 * @param {object} apiClient - API client instance used to retrieve the image.
 * @returns {null|string} URL of the item's backdrop.
 */
function getBackdropImageUrl(item, options, apiClient) {
    options = options || {};
    options.type = options.type || 'Backdrop';

    // If not resizing, get the original image
    if (!options.maxWidth && !options.width && !options.maxHeight && !options.height && !options.fillWidth && !options.fillHeight) {
        options.quality = 100;
    }

    if (item.BackdropImageTags?.length) {
        options.index = randomInt(0, item.BackdropImageTags.length - 1);
        options.tag = item.BackdropImageTags[options.index];
        return apiClient.getScaledImageUrl(item.Id, options);
    }

    return null;
}

/**
 * Dispatches a request for an item's image to its respective handler.
 * @param {object} item - Item used to generate the image URL.
 * @returns {string} URL of the item's image.
 */
function getImgUrl(item, user) {
    const api = ServerConnections.getApi(item.ServerId);
    const apiClient = ServerConnections.getApiClient(item);
    const imageOptions = {};

    if (item.BackdropImageTags?.length) {
        return getBackdropImageUrl(item, imageOptions, apiClient);
    } else {
        if (api && item.MediaType === 'Photo' && user?.Policy.EnableContentDownloading) {
            return getLibraryApi(api).getDownloadUrl({ itemId: item.Id });
        }
        imageOptions.type = 'Primary';
        return getImageUrl(item, imageOptions, apiClient);
    }
}

/**
 * Sets the viewport meta tag to enable or disable scaling by the user.
 * @param {boolean} scalable - Flag to set the scalability of the viewport.
 */
function setUserScalable(scalable) {
    try {
        appHost.setUserScalable(scalable);
    } catch (err) {
        console.error('error in appHost.setUserScalable: ' + err);
    }
}

export default function (options) {
    const self = this;
    /** Initialized instance of Swiper. */
    let swiperInstance;
    /** Initialized instance of the dialog containing the Swiper instance. */
    let dialog;
    /** Options of the slideshow components */
    let currentOptions;

    /**
     * Creates the HTML markup for the dialog and images.
     * @param {Object} options - Options used to create the dialog and slideshow.
     */
    function createElements(slideshowOptions) {
        currentOptions = slideshowOptions;

        dialog = dialogHelper.createDialog({
            exitAnimationDuration: slideshowOptions.interactive ? 400 : 800,
            size: 'fullscreen',
            autoFocus: false,
            scrollY: false,
            exitAnimation: 'fadeout',
            removeOnClose: true
        });

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
    function onZoomChange(swiper, scale, imageEl, slideEl) {
        const zoomImage = slideEl.querySelector('.swiper-zoom-fakeimg');

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
    function loadSwiper(dialogElement, swiperOptions) {
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
            swiperInstance = new Swiper(dialogElement.querySelector('.slideshowSwiperContainer'), {
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
                    slides: slides,
                    cache: true,
                    renderSlide: getSwiperSlideHtml,
                    addSlidesBefore: 1,
                    addSlidesAfter: 1
                }
            });

            if (useFakeZoomImage) {
                swiperInstance.on('zoomChange', onZoomChange);
            }
        });
    }

    /**
     * Renders the HTML markup of a slide for an item or a slide.
     * @param {Object} item - The item used to render the slide.
     * @returns {string} The HTML markup of the slide.
     */
    function getSwiperSlideHtml(item) {
        if (currentOptions.slides) {
            return getSwiperSlideHtmlFromSlide(item);
        } else {
            return getSwiperSlideHtmlFromItem(item);
        }
    }

    /**
     * Renders the HTML markup of a slide for an item.
     * @param {Object} item - Item used to generate the slide.
     * @returns {string} The HTML markup of the slide.
     */
    function getSwiperSlideHtmlFromItem(item) {
        return getSwiperSlideHtmlFromSlide({
            originalImage: getImgUrl(item, currentOptions.user),
            Id: item.Id,
            ServerId: item.ServerId
        });
    }

    /**
     * Renders the HTML markup of a slide for a slide object.
     * @param {Object} item - Slide object used to generate the slide.
     * @returns {string} The HTML markup of the slide.
     */
    function getSwiperSlideHtmlFromSlide(item) {
        let html = '';
        html += '<div class="swiper-slide" data-original="' + item.originalImage + '" data-itemid="' + item.Id + '" data-serverid="' + item.ServerId + '">';
        html += '<div class="swiper-zoom-container">';
        if (useFakeZoomImage) {
            html += `<div class="swiper-zoom-fakeimg swiper-zoom-fakeimg-hidden" style="background-image: url('${item.originalImage}')"></div>`;
        }
        html += '<img src="' + item.originalImage + '" class="swiper-slide-img">';
        html += '</div>';
        if (item.title || item.subtitle) {
            html += '<div class="slideText">';
            html += '<div class="slideTextInner">';
            if (item.title) {
                html += '<h1 class="slideTitle">';
                html += item.title;
                html += '</h1>';
            }
            if (item.description) {
                html += '<div class="slideSubtitle">';
                html += item.description;
                html += '</div>';
            }
            html += '</div>';
            html += '</div>';
        }
        html += '</div>';

        return html;
    }

    /**
     * Starts the autoplay feature of the Swiper instance.
     */
    function play() {
        if (swiperInstance.autoplay) {
            swiperInstance.autoplay.start();
        }
    }

    /**
     * Pauses the autoplay feature of the Swiper instance;
     */
    function pause() {
        if (swiperInstance.autoplay) {
            swiperInstance.autoplay.stop();
        }
    }

    /**
     * Toggles the autoplay feature of the Swiper instance.
     */
    function playPause() {
        const paused = !swiperInstance.autoplay?.running;
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
    function onInputCommand(event) {
        switch (event.detail.command) {
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
