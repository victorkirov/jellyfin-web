import { LayoutMode } from 'constants/layoutMode';

import appSettings from '../scripts/settings/appSettings';
import Events from '../utils/events.ts';

const layoutManager = {
    tv: true,
    mobile: false,
    desktop: false,
    modern: false
};

document.documentElement.classList.remove('layout-mobile', 'layout-desktop', 'layout-modern');
document.documentElement.classList.add('layout-tv');
appSettings.set('layout', LayoutMode.Tv);
Events.trigger(layoutManager, 'modechange');

export default layoutManager;
