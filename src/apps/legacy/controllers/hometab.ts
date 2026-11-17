import type { ApiClient } from 'jellyfin-apiclient';

import * as userSettings from 'scripts/settings/userSettings';
import focusManager from 'lib/focusManager';
import homeSections from 'components/homesections/homesections';
import { ServerConnections } from 'lib/jellyfin-apiclient';

import 'components/itemscontainer/emby-itemscontainer';

type ResumeOptions = { autoFocus?: boolean; refresh?: boolean };

class HomeTab {
    view: HTMLElement | null;
    params: unknown;
    apiClient: ApiClient | null;
    sectionsContainer: HTMLElement | null;
    sectionsRendered = false;
    paused = false;
    constructor(view: HTMLElement, params: unknown) {
        this.view = view;
        this.params = params;
        this.apiClient = ServerConnections.currentApiClient() || null;
        this.sectionsContainer = view.querySelector('.sections');
        view.querySelector('.sections')!.addEventListener('settingschange', onHomeScreenSettingsChanged.bind(this));
    }
    onResume(options: ResumeOptions) {
        if (this.sectionsRendered) {
            const sectionsContainer = this.sectionsContainer;

            if (sectionsContainer) {
                return homeSections.resume(sectionsContainer, options);
            }

            return Promise.resolve();
        }

        const view = this.view!;
        const apiClient = this.apiClient!;
        this.destroyHomeSections();
        this.sectionsRendered = true;
        return apiClient.getCurrentUser()
            .then(user => homeSections.loadSections(view.querySelector<HTMLElement>('.sections')!, apiClient, user, userSettings))
            .then(() => {
                if (options.autoFocus) {
                    focusManager.autoFocus(view);
                }
            }).catch(err => {
                console.error(err);
            });
    }
    onPause() {
        const sectionsContainer = this.sectionsContainer;

        if (sectionsContainer) {
            homeSections.pause(sectionsContainer);
        }
    }
    destroy() {
        this.view = null;
        this.params = null;
        this.apiClient = null;
        this.destroyHomeSections();
        this.sectionsContainer = null;
    }
    destroyHomeSections() {
        const sectionsContainer = this.sectionsContainer;

        if (sectionsContainer) {
            homeSections.destroySections(sectionsContainer);
        }
    }
}

function onHomeScreenSettingsChanged(this: HomeTab) {
    this.sectionsRendered = false;

    if (!this.paused) {
        void this.onResume({
            refresh: true
        });
    }
}

export default HomeTab;
