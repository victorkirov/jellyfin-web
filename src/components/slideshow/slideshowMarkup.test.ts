import { expect, it } from 'vitest';
import { getSwiperSlideHtmlFromSlide } from './slideshowMarkup';

it('keeps zoom transforms instant even when Swiper writes a duration', () => {
    const container = document.createElement('div');
    container.innerHTML = getSwiperSlideHtmlFromSlide({ originalImage: 'photo.jpg' }, false);
    const zoom = container.querySelector<HTMLElement>('.swiper-zoom-container')!;
    const image = container.querySelector<HTMLImageElement>('img')!;
    for (const element of [zoom, image]) {
        // Double-tap zoom writes 300ms directly, independently of Swiper.speed.
        element.style.transitionDuration = '300ms';
        element.style.transform = 'scale(3)';
        expect(element.style.transitionProperty).toBe('none');
        expect(element.style.transform).toBe('scale(3)');
    }
});
