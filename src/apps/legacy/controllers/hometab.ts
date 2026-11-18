import { bindLibraryRail } from './libraryRail';
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
    private generation = 0;
    private initialization?: Promise<void>;
    private needsInitialRefresh = false;
    constructor(view: HTMLElement, params: unknown) {
        bindLibraryRail(view.closest<HTMLElement>('.page') || view, true);
        this.view = view;
        this.params = params;
        this.apiClient = ServerConnections.currentApiClient() || null;
        this.sectionsContainer = view.querySelector('.sections');
    }
    onResume(options: ResumeOptions) {
        this.paused = false;
        if (!this.view || !this.apiClient) return Promise.resolve();
        if (this.initialization) return this.initialization;
        if (this.sectionsRendered) {
            return this.resumeHomeSections(options);
        }

        const view = this.view!;
        const apiClient = this.apiClient!;
        this.destroyHomeSections();
        const generation = ++this.generation;
        const isActive = () => generation === this.generation && !this.paused && this.view === view;
        const initialization = apiClient.getCurrentUser()
            .then(user => {
                if (isActive()) {
                    return homeSections.loadSections(this.sectionsContainer!, apiClient, user, userSettings, isActive);
                }
            })
            .then(() => {
                if (!isActive()) return;
                this.sectionsRendered = true;
                this.needsInitialRefresh = true;
                // Let polyfilled custom elements attach before resuming their rows.
                return new Promise<void>(resolve => setTimeout(resolve, 0)).then(() => {
                    if (isActive()) return this.resumeHomeSections(options);
                });
            }).then(() => {
                if (isActive() && options.autoFocus) {
                    focusManager.autoFocus(view);
                }
            }).catch(err => {
                console.error(err);
            }).finally(() => {
                if (this.initialization === initialization) this.initialization = undefined;
            });
        this.initialization = initialization;
        return initialization;
    }
    onPause() {
        this.paused = true;
        this.invalidateInitialization();
        const sectionsContainer = this.sectionsContainer;

        if (sectionsContainer) {
            homeSections.pause(sectionsContainer);
        }
    }
    destroy() {
        this.invalidateInitialization();
        this.view = null;
        this.params = null;
        this.apiClient = null;
        this.destroyHomeSections();
        this.sectionsContainer = null;
    }
    private invalidateInitialization() {
        this.generation++;
        this.initialization = undefined;
    }
    private resumeHomeSections(options: ResumeOptions): Promise<unknown> {
        if (!this.sectionsContainer) return Promise.resolve();
        const resumeOptions = this.needsInitialRefresh ? { ...options, refresh: true } : options;
        this.needsInitialRefresh = false;
        return homeSections.resume(this.sectionsContainer, resumeOptions);
    }
    destroyHomeSections() {
        this.invalidateInitialization();
        this.sectionsRendered = false;
        this.needsInitialRefresh = false;
        const sectionsContainer = this.sectionsContainer;

        if (sectionsContainer) {
            homeSections.destroySections(sectionsContainer);
        }
    }
}

export default HomeTab;
