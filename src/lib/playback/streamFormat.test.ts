import { describe, expect, it } from 'vitest';
import { getMimeType, getParam } from './streamFormat';

describe('stream URL formats', () => {
    it.each([
        ['audio', 'opus', 'audio/ogg'], ['audio', 'm4a', 'audio/mp4'],
        ['audio', 'webma', 'audio/webm'], ['video', 'mkv', 'video/x-matroska'],
        ['video', 'm4v', 'video/mp4'], ['video', 'mov', 'video/quicktime'],
        ['video', 'mpg', 'video/mpeg'], ['video', 'flv', 'video/x-flv'],
        ['video', 'MP4', 'video/mp4'], ['audio', '', 'audio/']
    ])('maps %s %s to %s', (type, container, expected) => {
        expect(getMimeType(type, container)).toBe(expected);
    });

    it('reads case-insensitive stream parameters and decodes spaces', () => {
        expect(getParam('playSessionId', 'https://server/stream?PlaySessionId=session%2Fone+two&Other=1')).toBe('session/one two');
        expect(getParam('playSessionId', 'https://server/stream?Other=1')).toBe('');
    });
});
