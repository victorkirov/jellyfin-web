import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type { AutoplayOptions } from 'swiper/types';
import type { UserDto } from '@jellyfin/sdk/lib/generated-client/models/user-dto';

export type Slide = {
    originalImage: string | null | undefined;
    Id?: string;
    ServerId?: string | null;
    title?: string;
    subtitle?: string;
    description?: string;
};

export type SlideshowOptions = {
    interactive?: boolean;
    showTitle?: boolean;
    cover?: boolean;
    interval?: number;
    autoplay?: boolean | (AutoplayOptions & { enabled?: boolean });
    startIndex?: number;
    slides?: Slide[];
    items?: BaseItemDto[] | null;
    user?: UserDto;
    onClose?(): void;
};
