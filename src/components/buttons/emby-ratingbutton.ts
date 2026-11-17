import type { ConnectionClient } from 'lib/jellyfin-apiclient/connectionTypes';
import type { UserDataChangedMessage } from '@jellyfin/sdk/lib/generated-client';
import type { ItemDto } from 'types/base/models/item-dto';
import globalize from '../../lib/globalize/index';
import { ServerConnections } from 'lib/jellyfin-apiclient/index';
import { OutboundWebSocketMessageType } from '@jellyfin/sdk/lib/websocket';
import EmbyButtonPrototype from './emby-button';
import serverNotifications from 'scripts/serverNotifications';
import Events from 'utils/events';
import { queryClient } from 'utils/query/queryClient';
import { userLibraryQueryKeys } from 'utils/query/queryKeys';

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
    const isFavorite = this.getAttribute('data-isfavorite') === 'true';
    const userId = apiClient.getCurrentUserId();

    void apiClient.updateFavoriteStatus(userId, id, !isFavorite)
        .then(userData => {
            setState(this, userData.Likes, userData.IsFavorite);
            userLibraryQueryKeys(ServerConnections.getApi(serverId), userId).forEach(queryKey => {
                void queryClient.invalidateQueries({ queryKey });
            });
        });
}

function onUserDataChanged({ MessageType, Data }: UserDataChangedMessage, apiClient: ConnectionClient, button: StateButton) {
    const itemId = button.dataset.id;
    const userData = (Data?.UserDataList ?? []).find(u => u.ItemId === itemId);
    if (userData) {
        setState(button, userData.Likes, userData.IsFavorite);
    }
    Events.trigger(serverNotifications, MessageType!, [apiClient, Data]);
}

function setState(button: StateButton, likes?: boolean | null, isFavorite?: boolean, updateAttribute?: boolean) {
    const icon = button.querySelector('.material-icons');

    if (isFavorite) {
        if (icon) {
            icon.classList.add('favorite');
            icon.classList.add('ratingbutton-icon-withrating');
        }

        button.classList.add('ratingbutton-withrating');
    } else {
        if (icon) {
            icon.classList.add('favorite');
            icon.classList.remove('ratingbutton-icon-withrating');
        }
        button.classList.remove('ratingbutton-withrating');
    }

    if (updateAttribute !== false) {
        button.setAttribute('data-isfavorite', String(isFavorite));

        button.setAttribute('data-likes', (likes === null ? '' : String(likes)));
    }

    setTitle(button, isFavorite);
}

function setTitle(button: StateButton, isFavorite?: boolean) {
    button.title = isFavorite ? globalize.translate('Favorite') : globalize.translate('AddToFavorites');

    const text = button.querySelector<HTMLElement>('.button-text');
    if (text) {
        text.textContent = button.title;
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
        (message) => onUserDataChanged(message, apiClient, button)
    );
}

const EmbyRatingButtonPrototype = Object.create(EmbyButtonPrototype) as StateButton;

EmbyRatingButtonPrototype.createdCallback = function () {
    // base method
    if (EmbyButtonPrototype.createdCallback) {
        EmbyButtonPrototype.createdCallback.call(this);
    }
};

EmbyRatingButtonPrototype.attachedCallback = function () {
    // base method
    if (EmbyButtonPrototype.attachedCallback) {
        EmbyButtonPrototype.attachedCallback.call(this);
    }

    const itemId = this.getAttribute('data-id');
    const serverId = this.getAttribute('data-serverid');
    if (itemId && serverId) {
        const likesAttribute = this.getAttribute('data-likes');
        let likes: boolean | null;
        const isFavorite = this.getAttribute('data-isfavorite') === 'true';
        if (likesAttribute === 'true') {
            likes = true;
        } else if (likesAttribute === 'false') {
            likes = false;
        } else {
            likes = null;
        }

        setState(this, likes, isFavorite, false);
        bindEvents(this);
    } else {
        setTitle(this);
    }
};

EmbyRatingButtonPrototype.detachedCallback = function () {
    // base method
    if (EmbyButtonPrototype.detachedCallback) {
        EmbyButtonPrototype.detachedCallback.call(this);
    }

    clearEvents(this);
};

EmbyRatingButtonPrototype.setItem = function (item: ItemDto | null) {
    if (item) {
        this.setAttribute('data-id', item.Id!);
        this.setAttribute('data-serverid', item.ServerId!);

        const userData: Pick<NonNullable<ItemDto['UserData']>, 'Likes' | 'IsFavorite'> = item.UserData || {};
        setState(this, userData.Likes, userData.IsFavorite);
        bindEvents(this);
    } else {
        this.removeAttribute('data-id');
        this.removeAttribute('data-serverid');
        this.removeAttribute('data-likes');
        this.removeAttribute('data-isfavorite');
        clearEvents(this);
    }
};

(document as Document & { registerElement(name: string, options: { prototype: StateButton; extends: string }): void }).registerElement('emby-ratingbutton', {
    prototype: EmbyRatingButtonPrototype,
    extends: 'button'
});
