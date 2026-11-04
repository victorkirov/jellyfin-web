import { type SupportedColorScheme, useColorScheme } from '@mui/material/styles';
import { type FC, useEffect } from 'react';

interface ColorSchemeSyncProps {
    colorScheme: SupportedColorScheme
}

/** Switches MUI to the given color scheme. */
const ColorSchemeSync: FC<ColorSchemeSyncProps> = ({ colorScheme }) => {
    const { setColorScheme } = useColorScheme();

    useEffect(() => {
        setColorScheme(colorScheme);
    }, [ colorScheme, setColorScheme ]);

    return null;
};

export default ColorSchemeSync;
