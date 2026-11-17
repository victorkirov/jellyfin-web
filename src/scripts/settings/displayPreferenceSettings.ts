import type { DisplayPreferencesDto } from '@jellyfin/sdk/lib/generated-client/models/display-preferences-dto';
import type { QueryKey } from '@tanstack/react-query';
import type { ApiClient } from 'jellyfin-apiclient';

import { getDisplayPreferencesQuery } from 'lib/queries/displayPreferences';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import Events from 'utils/events';
import { queryClient } from 'utils/query/queryClient';

import appSettings from './appSettings';

type SettingValue = string | number | boolean | null | undefined;
type DisplayPreferences = Omit<DisplayPreferencesDto, 'CustomPrefs'> & {
    CustomPrefs: Record<string, string | null | undefined>;
};

const DISPLAY_PREFERENCES_ID = 'usersettings';
const CLIENT_ID = 'emby';

function onSaveTimeout(this: DisplayPreferenceSettings) {
    this.saveTimeout = null;
    const apiClient = this.currentApiClient;
    const userId = this.currentUserId;
    const binding = this.binding;
    const displayPrefs = Object.assign({}, this.displayPrefs, {
        CustomPrefs: Object.assign({}, this.displayPrefs!.CustomPrefs)
    });
    // JSON serialization omits undefined legacy preference values.
    void Promise.resolve()
        .then(() => apiClient!.updateDisplayPreferences(DISPLAY_PREFERENCES_ID, displayPrefs as DisplayPreferencesDto, userId!, CLIENT_ID))
        .catch(error => {
            // The local copy remains available; another change can retry the save.
            if (this.binding === binding) Events.trigger(this, 'saveerror', [error]);
        });
}

function saveServerPreferences(instance: DisplayPreferenceSettings) {
    if (instance.saveTimeout) {
        clearTimeout(instance.saveTimeout);
    }

    instance.saveTimeout = setTimeout(onSaveTimeout.bind(instance), 50);
}

export class DisplayPreferenceSettings {
    saveTimeout: ReturnType<typeof setTimeout> | null = null;
    currentApiClient?: ApiClient | null;
    currentUserId?: string | null;
    binding?: { queryKey?: QueryKey };
    displayPrefs: DisplayPreferences | null = null;

    setUserInfo(userId: string | null | undefined, apiClient: ApiClient | null) {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        const binding: { queryKey?: QueryKey } = {};
        this.binding = binding;
        this.saveTimeout = null;
        this.currentUserId = userId;
        this.currentApiClient = apiClient;
        this.displayPrefs = null;

        if (!userId) {
            return Promise.resolve();
        }

        const api = ServerConnections.getApi(apiClient!.serverId());
        const query = getDisplayPreferencesQuery(api, {
            displayPreferencesId: DISPLAY_PREFERENCES_ID,
            client: CLIENT_ID,
            userId
        });
        binding.queryKey = query.queryKey;
        return queryClient
            .fetchQuery(query)
            .then(result => {
                if (this.binding !== binding) return;
                this.displayPrefs = Object.assign({}, result, {
                    CustomPrefs: Object.assign({}, result.CustomPrefs)
                });
            });
    }

    // Compatibility wrappers retain the existing default display-preference path.
    set(name: string, value: SettingValue, enableOnServer?: boolean) {
        return enableOnServer === false ?
            this.setLocalSetting(name, value) :
            this.setDisplayPreference(name, value);
    }

    get(name: string, enableOnServer?: boolean) {
        return enableOnServer === false ?
            this.getLocalSetting(name) :
            this.getDisplayPreference(name);
    }

    getLocalSetting(name: string): string | null | undefined {
        return appSettings.get(name, this.currentUserId);
    }

    setLocalSetting(name: string, value: SettingValue) {
        const currentValue = this.getLocalSetting(name);
        const result = appSettings.set(name, value, this.currentUserId);
        if (currentValue !== value) {
            Events.trigger(this, 'change', [name]);
        }
        return result;
    }

    getDisplayPreference(name: string): string | null | undefined {
        return this.displayPrefs ? this.displayPrefs.CustomPrefs[name] : this.getLocalSetting(name);
    }

    setDisplayPreference(name: string, value: SettingValue) {
        const currentValue = this.getDisplayPreference(name);
        // Display preferences keep their legacy local backup and server serialization.
        const result = appSettings.set(name, value, this.currentUserId);
        if (this.displayPrefs) {
            const customPrefs = Object.assign({}, this.displayPrefs.CustomPrefs);
            customPrefs[name] = value == null ? value : value.toString();
            this.displayPrefs = Object.assign({}, this.displayPrefs, { CustomPrefs: customPrefs });
            if (this.binding?.queryKey) {
                queryClient.setQueryData(this.binding.queryKey, this.displayPrefs);
            }
            saveServerPreferences(this);
        }
        if (currentValue !== value) {
            Events.trigger(this, 'change', [name]);
        }
        return result;
    }
}
