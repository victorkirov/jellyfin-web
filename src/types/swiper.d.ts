// Forward Swiper's package-exports path for legacy TypeScript resolution.
declare module 'swiper/modules' {
    import type { SwiperModule } from 'swiper/types';
    export const Virtual: SwiperModule;
    export const Keyboard: SwiperModule;
    export const Autoplay: SwiperModule;
    export const Zoom: SwiperModule;
    export const A11y: SwiperModule;
}
