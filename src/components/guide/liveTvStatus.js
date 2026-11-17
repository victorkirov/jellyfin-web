import globalize from 'lib/globalize';

// Shared by the programs, channels and guide views. Keep recovery outside item containers.
export function clearLiveTvStatus(context) {
    const status = context.querySelector('.liveTvStatus');
    if (status) {
        status.remove();
    }
}

export function showLiveTvStatus(context, message, retry, channelsLink) {
    clearLiveTvStatus(context);
    const status = document.createElement('div');
    status.className = 'liveTvStatus padded-left padded-right padded-bottom';
    const text = document.createElement('p');
    text.setAttribute('role', 'status');
    text.textContent = globalize.translate(message);
    status.appendChild(text);

    if (retry) {
        const button = document.createElement('button');
        button.setAttribute('is', 'emby-button');
        button.type = 'button';
        button.className = 'raised button-submit emby-button show-focus';
        button.textContent = globalize.translate('Retry');
        button.addEventListener('click', retry);
        status.appendChild(button);
    }

    const link = document.createElement('a');
    link.setAttribute('is', 'emby-linkbutton');
    link.className = 'raised emby-button show-focus';
    link.href = channelsLink ? '#/livetv?tab=2' : '#/home';
    link.textContent = globalize.translate(channelsLink ? 'Channels' : 'GoHome');
    status.appendChild(link);
    context.appendChild(status);
    return status;
}
