import Events from '../../utils/events';

export default class AppSettingsStorage {
    // Denied/quota-limited storage keeps failed writes available for this session.
    private storageFallback = new Map<string, string>();

    private getKey(name: string, userId?: string | null) {
        if (userId) {
            name = userId + '-' + name;
        }

        return name;
    }

    set(name: string, value: string | number | boolean | null | undefined, userId?: string | null) {
        const currentValue = this.get(name, userId);
        const key = this.getKey(name, userId);
        let persisted = true;
        try {
            localStorage.setItem(key, String(value));
            this.storageFallback.delete(key);
        } catch {
            persisted = false;
            this.storageFallback.set(key, String(value));
            Events.trigger(this, 'storageerror', [name, 'write']);
        }

        if (currentValue !== value) {
            Events.trigger(this, 'change', [name]);
        }
        return persisted;
    }

    get(name: string, userId?: string | null): string | null {
        const key = this.getKey(name, userId);
        if (this.storageFallback.has(key)) {
            return this.storageFallback.get(key)!;
        }
        try {
            return localStorage.getItem(key);
        } catch {
            Events.trigger(this, 'storageerror', [name, 'read']);
            return null;
        }
    }
}
