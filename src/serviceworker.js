function openClient() {
    return clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windows) {
        return windows.length ? windows[0].focus() : clients.openWindow('/');
    });
}

function executeAction(action, data) {
    if (action !== 'cancel-install' && action !== 'restart') {
        return openClient();
    }

    if (!data?.serverAddress || !data.headers?.Authorization || (action === 'cancel-install' && !data.id)) {
        return Promise.reject(new Error('Missing notification action data'));
    }

    const path = action === 'cancel-install' ?
        'Packages/Installing/' + encodeURIComponent(data.id) :
        'System/Restart';
    return fetch(data.serverAddress.replace(/\/$/, '') + '/' + path, {
        method: action === 'cancel-install' ? 'DELETE' : 'POST',
        headers: data.headers
    }).then(function (response) {
        if (!response.ok) {
            throw new Error('Notification action failed: ' + response.status);
        }
    });
}

/* eslint-disable-next-line no-restricted-globals -- self is valid in a serviceworker environment */
self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    event.waitUntil(executeAction(event.action, event.notification.data));
}, false);

/* eslint-disable-next-line no-restricted-globals -- self is valid in a serviceworker environment */
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

export {};
