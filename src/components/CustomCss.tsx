import React, { type FC } from 'react';

import { useUserSettings } from 'hooks/useUserSettings';
import { useBrandingOptions } from 'hooks/useBrandingOptions';

const CustomCss: FC = () => {
    const { data: brandingOptions } = useBrandingOptions();
    const { customCss: userCustomCss, disableCustomCss } = useUserSettings();

    return (
        <>
            {!disableCustomCss && brandingOptions?.CustomCss && (
                <style>
                    {brandingOptions.CustomCss}
                </style>
            )}
            {userCustomCss && (
                <style>
                    {userCustomCss}
                </style>
            )}
        </>
    );
};

export default CustomCss;
