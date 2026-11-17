// Swiper exposes these paths through package exports; legacy moduleResolution
// needs declarations that forward to the same installed API.
declare module 'swiper/bundle' {
    export { Swiper } from 'swiper';
}
declare module 'swiper/css/bundle';
