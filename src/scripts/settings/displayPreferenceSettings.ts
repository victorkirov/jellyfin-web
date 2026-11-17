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

type PreferenceValues = DisplayPreferences['CustomPrefs'];
type SaveState = {
    identity: string;
    storageKey: string;
    userId: string;
    dirty: PreferenceValues;
    edits: PreferenceValues;
    revision: number;
    saving: boolean;
    owner?: DisplayPreferenceSettings;
};

const saveStates = new Map<string, SaveState>();

function readDirtyPreferences(storageKey: string, userId: string): PreferenceValues {
    try {
        const entries: unknown = JSON.parse(appSettings.get(storageKey, userId) || '[]');
        if (!Array.isArray(entries)) return {};
        return entries.reduce<PreferenceValues>((preferences, entry: unknown) => {
            if (entry && typeof entry === 'object' && 'name' in entry && 'value' in entry) {
                const { name, value } = entry;
                if (typeof name === 'string' && (typeof value === 'string' || value === null)) {
                    preferences[name] = value;
                }
            } else if (entry && typeof entry === 'object' && 'name' in entry && typeof entry.name === 'string') {
                preferences[entry.name] = undefined;
            }
            return preferences;
        }, {});
    } catch {
        // A malformed journal cannot replace the server preference document.
        return {};
    }
}

function persistDirtyPreferences(state: SaveState) {
    const entries = Object.keys(state.dirty).map(name => ({ name, value: state.dirty[name] }));
    appSettings.set(state.storageKey, JSON.stringify(entries), state.userId);
}

export class DisplayPreferenceSettings {
    saveTimeout: ReturnType<typeof setTimeout> | null = null;
    currentApiClient?: ApiClient | null;
    currentUserId?: string | null;
    binding?: { queryKey?: QueryKey };
    displayPrefs: DisplayPreferences | null = null;
    private activeSaveState?: SaveState;

    private getSaveState() {
        if (!this.currentUserId || !this.currentApiClient) return;
        const serverId = this.currentApiClient.serverId?.() || '';
        const identity = JSON.stringify([serverId, this.currentUserId]);
        let state = saveStates.get(identity);
        if (!state) {
            const storageKey = 'displayPreferencesDirty-' + serverId;
            const dirty = readDirtyPreferences(storageKey, this.currentUserId);
            state = {
                identity, storageKey, userId: this.currentUserId,
                dirty, edits: Object.assign({}, dirty), revision: 0, saving: false
            };
        }
        saveStates.set(identity, state);
        state.owner = this;
        this.activeSaveState = state;
        return state;
    }

    private scheduleSave() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            void this.savePreferences();
        }, 50);
    }

    private async savePreferences() {
        this.saveTimeout = null;
        const state = this.activeSaveState;
        const apiClient = this.currentApiClient;
        if (!state || state.owner !== this || state.saving || !apiClient || !this.displayPrefs || !Object.keys(state.dirty).length) return;
        const binding = this.binding;
        const revision = state.revision;
        const sent = Object.assign({}, state.dirty);
        const document = Object.assign({}, this.displayPrefs, {
            CustomPrefs: Object.assign({}, this.displayPrefs.CustomPrefs, state.edits)
        });
        state.saving = true;
        let saved = false;
        try {
            // JSON serialization omits undefined legacy preference values.
            await apiClient.updateDisplayPreferences(DISPLAY_PREFERENCES_ID, document as DisplayPreferencesDto, state.userId, CLIENT_ID);
            saved = true;
            Object.keys(sent).forEach(name => {
                if (state.dirty[name] === sent[name]) delete state.dirty[name];
            });
            persistDirtyPreferences(state);
        } catch (error) {
            if (this.binding === binding) Events.trigger(this, 'saveerror', [error]);
        } finally {
            state.saving = false;
            const owner = state.owner;
            if (!Object.keys(state.dirty).length || !owner) {
                saveStates.delete(state.identity);
            } else if (saved || revision !== state.revision || owner !== this) {
                // Failed snapshots retry only after another edit or binding, never on a loop.
                owner.scheduleSave();
            } else {
                saveStates.delete(state.identity);
            }
        }
    }

    setUserInfo(userId: string | null | undefined, apiClient: ApiClient | null) {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        const previousState = this.activeSaveState;
        const binding: { queryKey?: QueryKey } = {};
        this.binding = binding;
        this.saveTimeout = null;
        this.currentUserId = userId;
        this.currentApiClient = apiClient;
        this.displayPrefs = null;
        const saveState = this.getSaveState();
        this.activeSaveState = saveState;
        if (previousState && previousState !== saveState && previousState.owner === this) {
            previousState.owner = undefined;
            if (!previousState.saving) saveStates.delete(previousState.identity);
        }

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
                const currentState = saveState && (saveStates.get(saveState.identity) || this.activeSaveState);
                this.displayPrefs = Object.assign({}, result, {
                    CustomPrefs: Object.assign({}, result.CustomPrefs, saveState?.edits, currentState?.edits)
                });
                queryClient.setQueryData(binding.queryKey!, this.displayPrefs);
                if (currentState && Object.keys(currentState.dirty).length) {
                    currentState.owner?.scheduleSave();
                } else if (currentState && !currentState.saving && saveStates.get(currentState.identity) === currentState) {
                    saveStates.delete(currentState.identity);
                }
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
        const saveState = this.getSaveState();
        if (saveState) {
            const serialized = value == null ? value : value.toString();
            saveState.dirty[name] = serialized;
            saveState.edits[name] = serialized;
            saveState.revision++;
            persistDirtyPreferences(saveState);
        }
        if (this.displayPrefs) {
            const customPrefs = Object.assign({}, this.displayPrefs.CustomPrefs, saveState?.edits);
            customPrefs[name] = value == null ? value : value.toString();
            this.displayPrefs = Object.assign({}, this.displayPrefs, { CustomPrefs: customPrefs });
            if (this.binding?.queryKey) {
                queryClient.setQueryData(this.binding.queryKey, this.displayPrefs);
            }
            this.scheduleSave();
        }
        if (currentValue !== value) {
            Events.trigger(this, 'change', [name]);
        }
        return result;
    }
}
