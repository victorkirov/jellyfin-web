import { configureLocalization, updateCurrentCulture } from 'lib/globalize';
import { currentSettings } from 'scripts/settings/userSettings';
import Events from 'utils/events';

configureLocalization(currentSettings);

Events.on(currentSettings, 'change', (_event, name: string) => {
    if (name === 'language' || name === 'datetimelocale') updateCurrentCulture();
});
