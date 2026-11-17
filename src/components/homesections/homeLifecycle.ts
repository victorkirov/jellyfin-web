import type { UserSettings } from 'scripts/settings/userSettings';

export type HomeSettings = Pick<UserSettings, 'get' | 'enableRewatchingInNextUp' | 'maxDaysForNextUp' | 'useEpisodeImagesInNextUpAndResume'>;

export type ResumeOptions = { refresh?: boolean };

export type HomeRow = HTMLElement & {
    fetchData?: (() => unknown) | null;
    getItemsHtml?: ((items: unknown[]) => unknown) | null;
    parentContainer?: HTMLElement | null;
    needsRefresh?: boolean;
    pause: () => void;
    resume: (options: ResumeOptions) => Promise<unknown>;
};

export type HomeContainer = HTMLElement & { deferredSections?: (() => void)[] };
