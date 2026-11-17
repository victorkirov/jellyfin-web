import icon from '@jellyfin/ux-web/icon-transparent.png';
import { PluginType } from 'constants/pluginType';

export default class LogoScreensaver {
    name = 'LogoScreensaver';
    type = PluginType.Screensaver;
    id = 'logoscreensaver';
    supportsAnonymous = true;

    show() {
        void import('./style.scss').then(() => {
            if (!document.querySelector('.logoScreenSaver')) {
                const elem = document.createElement('div');
                elem.classList.add('logoScreenSaver');
                elem.innerHTML = `<img class="logoScreenSaverImage" src="${icon}" />`;
                document.body.appendChild(elem);
            }
        });
    }

    hide() {
        const elem = document.querySelector('.logoScreenSaver');
        if (elem) elem.parentNode!.removeChild(elem);
        return Promise.resolve();
    }
}
