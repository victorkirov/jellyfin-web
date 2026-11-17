import type { UserDataChangedMessage } from '@jellyfin/sdk/lib/generated-client';
import type { ItemDto } from 'types/base/models/item-dto';
import globalize from '../../lib/globalize/index';
import { ServerConnections } from 'lib/jellyfin-apiclient/index';
import { OutboundWebSocketMessageType } from '@jellyfin/sdk/lib/websocket';
import EmbyButtonPrototype from './emby-button';

type StateButton = HTMLButtonElement & {
    iconElement?: Element | null;
    _unsubscribeUserData?: (() => void) | null;
    setItem(item: ItemDto | null): void;
    createdCallback(): void;
    attachedCallback(): void;
    detachedCallback(): void;
};

function onClick(this: StateButton) {
    const id = this.getAttribute('data-id')!;
    const serverId = this.getAttribute('data-serverid');
    const apiClient = ServerConnections.getApiClient(serverId)!;

    if (!this.classList.contains('playstatebutton-played')) {
        void apiClient.markPlayed(apiClient.getCurrentUserId(), id, new Date());
        setState(this, true);
    } else {
        void apiClient.markUnplayed(apiClient.getCurrentUserId(), id, new Date());
        setState(this, false);
    }
}

function onUserDataChanged({ Data }: UserDataChangedMessage, button: StateButton) {
    const itemId = button.dataset.id;
    const userData = (Data?.UserDataList ?? []).find(u => u.ItemId === itemId);
    if (userData) {
        setState(button, userData.Played);
    }
}

function setState(button: StateButton, played?: boolean, updateAttribute?: boolean) {
    let icon = button.iconElement;
    if (!icon) {
        button.iconElement = button.querySelector('.material-icons');
        icon = button.iconElement;
    }

    if (played) {
        button.classList.add('playstatebutton-played');
        if (icon) {
            icon.classList.add('playstatebutton-icon-played');
            icon.classList.remove('playstatebutton-icon-unplayed');
        }
    } else {
        button.classList.remove('playstatebutton-played');
        if (icon) {
            icon.classList.remove('playstatebutton-icon-played');
            icon.classList.add('playstatebutton-icon-unplayed');
        }
    }

    if (updateAttribute !== false) {
        button.setAttribute('data-played', String(played));
    }

    setTitle(button, button.getAttribute('data-type'), played);
}

function setTitle(button: StateButton, itemType: string | null, played?: boolean) {
    if (itemType !== 'AudioBook') {
        button.title = played ? globalize.translate('Watched') : globalize.translate('MarkPlayed');
    } else {
        button.title = played ? globalize.translate('Played') : globalize.translate('MarkPlayed');
    }

    const text = button.querySelector<HTMLElement>('.button-text');
    if (text) {
        text.innerText = button.title;
    }
}

function clearEvents(button: StateButton) {
    button.removeEventListener('click', onClick);
    button._unsubscribeUserData?.();
    button._unsubscribeUserData = null;
}

function bindEvents(button: StateButton) {
    clearEvents(button);

    button.addEventListener('click', onClick);
    const serverId = button.dataset.serverid;
    const apiClient = ServerConnections.getApiClient(serverId)!;
    button._unsubscribeUserData = apiClient?.subscribe!(
        [OutboundWebSocketMessageType.UserDataChanged],
        (msg) => onUserDataChanged(msg, button)
    );
}

const EmbyPlaystateButtonPrototype = Object.create(EmbyButtonPrototype) as StateButton;

EmbyPlaystateButtonPrototype.createdCallback = function () {
    // base method
    if (EmbyButtonPrototype.createdCallback) {
        EmbyButtonPrototype.createdCallback.call(this);
    }
};

EmbyPlaystateButtonPrototype.attachedCallback = function () {
    // base method
    if (EmbyButtonPrototype.attachedCallback) {
        EmbyButtonPrototype.attachedCallback.call(this);
    }

    const itemId = this.getAttribute('data-id');
    const serverId = this.getAttribute('data-serverid');
    if (itemId && serverId) {
        setState(this, this.getAttribute('data-played') === 'true', false);
        bindEvents(this);
    }
};

EmbyPlaystateButtonPrototype.detachedCallback = function () {
    // base method
    if (EmbyButtonPrototype.detachedCallback) {
        EmbyButtonPrototype.detachedCallback.call(this);
    }

    clearEvents(this);
    this.iconElement = null;
};

EmbyPlaystateButtonPrototype.setItem = function (item: ItemDto | null) {
    if (item) {
        this.setAttribute('data-id', item.Id!);
        this.setAttribute('data-serverid', item.ServerId!);
        this.setAttribute('data-type', item.Type!);

        const played = item.UserData?.Played;
        setState(this, played);
        bindEvents(this);
    } else {
        this.removeAttribute('data-id');
        this.removeAttribute('data-serverid');
        this.removeAttribute('data-type');
        this.removeAttribute('data-played');
        clearEvents(this);
    }
};

(document as Document & { registerElement(name: string, options: { prototype: StateButton; extends: string }): void }).registerElement('emby-playstatebutton', {
    prototype: EmbyPlaystateButtonPrototype,
    extends: 'button'
});

