import type { BaseItemPerson, MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client';
import type { ItemDto as BaseItem } from 'types/base/models/item-dto';

export type DetailsParams = { id?: string; serverId?: string; genre?: string; musicgenre?: string; musicartist?: string; context?: string };
export type DetailsPage = HTMLElement & { deferredDetails?: (() => void)[] };
export type DetailsController = {
    _unmount: (() => void)[];
    _currentPlaybackMediaSources?: MediaSourceInfo[] | null;
    _unsubscribeUserData?: (() => void) | null;
};
export type CollectionType = { name: string; type?: string; mediaType?: string };
export type DetailPerson = BaseItemPerson & { RoleList?: { Type?: string; Role?: string | null }[] };
export type TrackSelect = HTMLSelectElement & { setLabel: (label: string) => void };
export type StateButton = HTMLButtonElement & { setItem: (item: ItemDto | null) => void };

// These selectors address required nodes in the details template.
export function getElement(root: ParentNode, selector: '.selectSource' | '.selectVideo' | '.selectAudio' | '.selectSubtitles'): TrackSelect;
export function getElement(root: ParentNode, selector: '.emby-scroller'): HTMLElement & { toStart: (target: Node, immediate: boolean) => void };
export function getElement(root: ParentNode, selector: string): HTMLElement;
export function getElement(root: ParentNode, selector: string): HTMLElement {
    return root.querySelector<HTMLElement>(selector)!;
}
export function queryAll(root: ParentNode, selector: '.btnPlaystate' | '.btnUserRating'): NodeListOf<StateButton>;
export function queryAll(root: ParentNode, selector: string): NodeListOf<HTMLElement>;
export function queryAll(root: ParentNode, selector: string): NodeListOf<HTMLElement> {
    return root.querySelectorAll<HTMLElement>(selector);
}

export type ItemDto = BaseItem & { HomePageUrl?: string | null };

// Legacy renderers support these detail-specific flags beyond their shared options.
export type DetailCardOptions = import('components/cardbuilder/cardTypes').CardRenderOptions & {
    displayAsSpecial?: number | false | null;
    playFromHere?: boolean;
};
export type DetailListOptions = import('types/cardOptions').CardOptions & {
    runtime?: boolean;
    moreButton?: boolean;
    playFromHere?: boolean;
    showProgramDateTime?: boolean;
};

export type NextUpCallback = (episode: ItemDto | undefined) => void;
