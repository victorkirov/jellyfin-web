import type { Slide } from './slideshowTypes';

export function getSwiperSlideHtmlFromSlide(item: Slide, useFakeZoomImage: boolean) {
    let html = '';
    html += '<div class="swiper-slide" data-original="' + item.originalImage + '" data-itemid="' + item.Id + '" data-serverid="' + item.ServerId + '">';
    // Swiper zoom hardcodes durations; disable interpolation while keeping its transforms.
    html += '<div class="swiper-zoom-container" style="transition-property: none">';
    if (useFakeZoomImage) {
        html += `<div class="swiper-zoom-fakeimg swiper-zoom-fakeimg-hidden" style="background-image: url('${item.originalImage}')"></div>`;
    }
    html += '<img src="' + item.originalImage + '" class="swiper-slide-img" style="transition-property: none">';
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

