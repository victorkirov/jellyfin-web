import { Api } from '@jellyfin/sdk/lib/api';
import { ImageType } from '@jellyfin/sdk/lib/generated-client/models/image-type';
import { getImageApi } from '@jellyfin/sdk/lib/utils/api/image-api';
import { describe, expect, it } from 'vitest';

import { getItemImageUrl } from './image-urls';

const api = new Api(
    'https://server:8096',
    { name: 'test', version: '1.0.0' },
    { name: 'test device', id: 'test-device' }
);

describe('getItemImageUrl', () => {
    it('matches the SDK url', () => {
        const params = { fillHeight: 450, fillWidth: 300, quality: 96, tag: '0a1b2c' };

        expect(getItemImageUrl(api, 'abc123', ImageType.Primary, params))
            .toBe(getImageApi(api).getItemImageUrlById('abc123', ImageType.Primary, params));
    });

    it('skips empty params', () => {
        expect(getItemImageUrl(api, 'abc123', ImageType.Logo, { height: undefined, tag: 'xyz' }))
            .toBe('https://server:8096/Items/abc123/Images/Logo?tag=xyz');
    });

    it('omits the query string without params', () => {
        expect(getItemImageUrl(api, 'abc123', ImageType.Backdrop))
            .toBe('https://server:8096/Items/abc123/Images/Backdrop');
    });
});
