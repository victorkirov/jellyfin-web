import isEmpty from 'lodash-es/isEmpty';

import { EventType } from 'constants/eventType';
import { currentSettings as userSettings } from 'scripts/settings/userSettings';
import Events from 'utils/events';

import { defaultModule, ensureTranslations, FALLBACK_CULTURE, getDictionary, loadStringsForLocale, normalizeLocaleName, register, type TranslationOptions } from './dictionaries';

export { FALLBACK_CULTURE, defaultModule, normalizeLocaleName, register } from './dictionaries';

const Direction = {
    rtl: 'rtl',
    ltr: 'ltr'
};

const RTL_LANGS = ['ar', 'fa', 'ur', 'he'];

let currentCulture: string;
let currentDateTimeCulture: string | undefined;
let numberFormatter: Intl.NumberFormat | null | undefined;
let isRTL = false;

export function getCurrentLocale() {
    return currentCulture;
}

export function getLanguages() {
    const culture = currentCulture || FALLBACK_CULTURE;

    const [ baseLang ] = culture.split('-');
    if (baseLang && baseLang !== culture) {
        return [ culture, baseLang ];
    }
    return [ culture ];
}

export function getCurrentDateTimeLocale() {
    return currentDateTimeCulture;
}

export function getDefaultLanguage() {
    const culture = document.documentElement.getAttribute('data-culture');
    if (culture) {
        return culture;
    }

    if (navigator.language) {
        return navigator.language;
    }
    if ((navigator as Navigator & { userLanguage?: string }).userLanguage) {
        return (navigator as Navigator & { userLanguage: string }).userLanguage;
    }
    if (navigator.languages?.length) {
        return navigator.languages[0];
    }

    return FALLBACK_CULTURE;
}

export function getIsRTL() {
    return isRTL;
}

function checkAndProcessDir(culture: string) {
    isRTL = false;
    for (const lang of RTL_LANGS) {
        if (culture.includes(lang)) {
            isRTL = true;
            break;
        }
    }

    setDocumentDirection(isRTL ? Direction.rtl : Direction.ltr);
}

function setDocumentDirection(direction: string) {
    document.getElementsByTagName('body')[0].setAttribute('dir', direction);
    document.getElementsByTagName('html')[0].setAttribute('dir', direction);
    if (direction === Direction.rtl) {
        void import('../../styles/rtl.scss');
    }
}

export function getIsElementRTL(element: Element & { currentStyle?: { direction: string } }) {
    if (window.getComputedStyle) { // all browsers
        return window.getComputedStyle(element, null).getPropertyValue('direction') == 'rtl';
    }
    return element.currentStyle?.direction === 'rtl';
}

export function updateCurrentCulture() {
    const lastCulture = currentCulture;
    let culture;
    try {
        culture = userSettings.language();
    } catch {
        console.error('no language set in user settings');
    }
    culture = culture || getDefaultLanguage();
    checkAndProcessDir(culture);

    currentCulture = normalizeLocaleName(culture);

    if (lastCulture !== currentCulture) {
        numberFormatter = null;
        document.documentElement.setAttribute('lang', currentCulture);
        Events.trigger(document, EventType.LANGUAGE_CHANGE, [ currentCulture ]);
    }

    let dateTimeCulture;
    try {
        dateTimeCulture = userSettings.dateTimeLocale();
    } catch {
        console.error('no date format set in user settings');
    }

    if (dateTimeCulture) {
        currentDateTimeCulture = normalizeLocaleName(dateTimeCulture);
    } else {
        currentDateTimeCulture = currentCulture;
    }

    ensureTranslations(currentCulture);
}

function translateKey(key: string) {
    const parts = key.split('#');
    let module;

    if (parts.length > 1) {
        module = parts[0];
        key = parts[1];
    }

    return translateKeyFromModule(key, module);
}

function translateKeyFromModule(key: string, module?: string) {
    let dictionary = getDictionary(module, getCurrentLocale());
    if (dictionary?.[key]) {
        return dictionary[key];
    }

    dictionary = getDictionary(module, FALLBACK_CULTURE);
    if (dictionary?.[key]) {
        return dictionary[key];
    }

    if (!dictionary || isEmpty(dictionary)) {
        console.warn('Translation dictionary is empty.');
    } else {
        console.error(`Translation key is missing from dictionary: ${key}`);
    }

    return key;
}

export function translate(key: string, ...values: Array<{ toLocaleString(locales?: string): string }>) {
    let val = translateKey(key);
    for (let i = 1; i <= values.length; i++) {
        let value: { toLocaleString(locales?: string): string } = values[i - 1];
        if (typeof value === 'number' && typeof Intl !== 'undefined' && Intl.NumberFormat) {
            numberFormatter = numberFormatter || new Intl.NumberFormat(currentCulture);
            value = numberFormatter.format(value);
        } else {
            value = value.toLocaleString(currentCulture);
        }
        // replaceAll is supplied by the legacy core-js bundle.
        val = (val as string & { replaceAll(search: string, replacement: string): string }).replaceAll('{' + (i - 1) + '}', String(value));
    }
    return val;
}

export function translateHtml(input: string | { default: string }, module?: string): string {
    let html = typeof input === 'string' ? input : input.default;

    if (!module) {
        module = defaultModule();
    }
    if (!module) {
        throw new Error('module cannot be null or empty');
    }

    let startIndex = html.indexOf('${');
    if (startIndex === -1) {
        return html;
    }

    startIndex += 2;
    const endIndex = html.indexOf('}', startIndex);
    if (endIndex === -1) {
        return html;
    }

    const key = html.substring(startIndex, endIndex);
    const val = translateKeyFromModule(key, module);

    html = html.replace('${' + key + '}', val);
    return translateHtml(html, module);
}

export function loadStrings(options: string | TranslationOptions) {
    return loadStringsForLocale(options, currentCulture || FALLBACK_CULTURE);
}

updateCurrentCulture();

Events.on(userSettings, 'change', function (e, name) {
    if (name === 'language' || name === 'datetimelocale') {
        updateCurrentCulture();
    }
});

export default {
    translate,
    translateHtml,
    loadStrings,
    defaultModule,
    getCurrentLocale,
    getCurrentDateTimeLocale,
    register,
    updateCurrentCulture,
    getIsRTL,
    getIsElementRTL
};
