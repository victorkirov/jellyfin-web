export function getMimeType(type: string, container: string | null | undefined) {
    const normalizedContainer = (container || '').toLowerCase();
    switch (type + ':' + normalizedContainer) {
        case 'audio:opus': return 'audio/ogg';
        case 'audio:webma': return 'audio/webm';
        case 'audio:m4a': return 'audio/mp4';
        case 'video:mkv': return 'video/x-matroska';
        case 'video:m4v': return 'video/mp4';
        case 'video:mov': return 'video/quicktime';
        case 'video:mpg': return 'video/mpeg';
        case 'video:flv': return 'video/x-flv';
        default: return type + '/' + normalizedContainer;
    }
}

export function getParam(name: string, url: string) {
    name = name.replace(/\[/, '\\[').replace(/\]/, '\\]');
    const regexS = '[\\?&]' + name + '=([^&#]*)';
    const regex = new RegExp(regexS, 'i');

    const results = regex.exec(url);
    if (results == null) {
        return '';
    } else {
        return decodeURIComponent(results[1].replace(/\+/g, ' '));
    }
}
