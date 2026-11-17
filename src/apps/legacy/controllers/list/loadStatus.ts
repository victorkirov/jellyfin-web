import globalize from 'lib/globalize';

export function clearListLoadStatus(view: HTMLElement) {
    view.querySelector('.listLoadStatus')?.remove();
}

export function showListLoadStatus(view: HTMLElement, retry: () => void) {
    clearListLoadStatus(view);
    const status = document.createElement('div');
    status.className = 'listLoadStatus padded-left padded-right padded-bottom';
    const message = document.createElement('p');
    message.setAttribute('role', 'status');
    message.textContent = globalize.translate('MessageUnableToConnectToServer');
    status.appendChild(message);
    const button = document.createElement('button');
    button.setAttribute('is', 'emby-button');
    button.type = 'button';
    button.className = 'raised button-submit emby-button show-focus';
    button.textContent = globalize.translate('Retry');
    button.addEventListener('click', retry);
    status.appendChild(button);
    view.appendChild(status);
    return button;
}
