import { useEffect, useState } from 'react';

import { EventType } from 'constants/eventType';
import Events, { type Event } from 'utils/events';

const getDocumentColorScheme = () => document.documentElement.getAttribute('data-theme') ?? undefined;

/** Returns the color scheme that the theme manager set on the document. */
export function useDocumentColorScheme() {
    const [ colorScheme, setColorScheme ] = useState(getDocumentColorScheme);

    useEffect(() => {
        const onThemeChange = (_e: Event, id: string) => setColorScheme(id);
        Events.on(document, EventType.THEME_CHANGE, onThemeChange);
        // Catch a change that happened before the listener was added
        setColorScheme(getDocumentColorScheme());
        return () => Events.off(document, EventType.THEME_CHANGE, onThemeChange);
    }, []);

    return colorScheme;
}
