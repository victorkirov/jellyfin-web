import type { UserSettings } from 'scripts/settings/userSettings';

import { ServerConnections } from 'lib/jellyfin-apiclient';

import focusManager from '../../lib/focusManager';
import globalize from '../../lib/globalize';
import loading from '../loading/loading';
import Events from '../../utils/events';
import toast from '../toast/toast';
import template from './playbackSettings.template.html';

import '../select/emby-select';
import '../../elements/emby-checkbox/emby-checkbox';
import '../../elements/emby-collapse/emby-collapse.scss';

import { loadForm, saveUser } from './playbackSettingsForm';
export type Options = { element: HTMLElement; serverId?: string; userId: string; userSettings: UserSettings; enableSaveButton?: boolean; enableSaveConfirmation?: boolean; autoFocus?: boolean };
function save(instance: PlaybackSettings, context: HTMLElement, userSettings: UserSettings, enableSaveConfirmation?: boolean) {
    loading.show();
    saveUser(context, userSettings);
    loading.hide();
    if (enableSaveConfirmation) {
        toast(globalize.translate('SettingsSaved'));
    }
    Events.trigger(instance, 'saved');
}

function onSubmit(this: PlaybackSettings, e?: Event) {
    const apiClient = ServerConnections.getApiClient(this.options.serverId);
    const userId = this.options.userId;
    const userSettings = this.options.userSettings;

    void userSettings.setUserInfo(userId, apiClient!).then(() => {
        const enableSaveConfirmation = this.options.enableSaveConfirmation;
        save(this, this.options.element, userSettings, enableSaveConfirmation);
    });

    // Disable default form submission
    if (e) {
        e.preventDefault();
    }
    return false;
}

function embed(options: Options, self: PlaybackSettings) {
    options.element.innerHTML = globalize.translateHtml(template, 'core');

    const advancedButton = options.element.querySelector<HTMLElement>('.btnSettingsAdvanced')!;
    advancedButton.addEventListener('click', () => {
        const content = options.element.querySelector<HTMLElement>('.settingsAdvanced')!;
        const expanded = content.classList.contains('hide');
        content.classList.toggle('hide', !expanded);
        advancedButton.setAttribute('aria-expanded', expanded.toString());
        advancedButton.querySelector<HTMLElement>('.emby-collapse-expandIcon')!.classList.toggle('emby-collapse-expandIconExpanded', expanded);
    });

    options.element.querySelector<HTMLElement>('form')!.addEventListener('submit', onSubmit.bind(self));

    if (options.enableSaveButton) {
        options.element.querySelector<HTMLElement>('.btnSave')!.classList.remove('hide');
    }

    void self.loadData(options.autoFocus);
}

class PlaybackSettings {
    options: Options;
    dataLoaded?: boolean;
    constructor(options: Options) {
        this.options = options;
        embed(options, this);
    }

    async loadData(focusWhenReady = false) {
        const options = this.options;
        const context = options.element;
        let moved = false;
        const onFocus = () => {
            moved = true;
        };
        document.addEventListener('focusin', onFocus);
        loading.show();
        try {
            const apiClient = ServerConnections.getApiClient(options.serverId)!;
            const user = await apiClient.getUser(options.userId);
            await options.userSettings.setUserInfo(options.userId, apiClient);
            if (this.options !== options || !document.body.contains(context)) return;
            this.dataLoaded = true;
            await loadForm(context, user, options.userSettings, apiClient);
            if (focusWhenReady && !moved && this.options === options
                && document.body.contains(context) && !context.closest('.hide')) {
                const first = Array.from(context.querySelectorAll<HTMLElement>('select, input, button, textarea'))
                    .find(control => focusManager.isCurrentlyFocusable(control));
                if (first) focusManager.focus(first);
            }
        } catch (error) {
            console.error(error);
        } finally {
            loading.hide();
            document.removeEventListener('focusin', onFocus);
        }
    }

    submit() {
        onSubmit.call(this);
    }

    destroy() {
        this.options = null!;
    }
}

export default PlaybackSettings;
