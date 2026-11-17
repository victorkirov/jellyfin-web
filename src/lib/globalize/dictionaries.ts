export const FALLBACK_CULTURE = 'en-us';

type Translation = { lang: string; path: string };
type Dictionary = Record<string, string>;
export type TranslationOptions = { name: string; strings?: Translation[]; translations?: Translation[] };
type TranslationInfo = { translations: Translation[]; dictionaries: Record<string, Dictionary | undefined> };
const allTranslations: Record<string, TranslationInfo> = {};

export function ensureTranslations(culture: string) {
    for (const i in allTranslations) {
        void ensureTranslation(allTranslations[i], culture);
    }
    if (culture !== FALLBACK_CULTURE) {
        for (const i in allTranslations) {
            void ensureTranslation(allTranslations[i], FALLBACK_CULTURE);
        }
    }
}

function ensureTranslation(translationInfo: TranslationInfo, culture: string) {
    if (translationInfo.dictionaries[culture]) {
        return Promise.resolve();
    }

    return loadTranslation(translationInfo.translations, culture).then(function (dictionary) {
        translationInfo.dictionaries[culture] = dictionary;
    });
}

export function normalizeLocaleName(culture: string) {
    return culture.replace('_', '-').toLowerCase();
}

export function getDictionary(module: string | undefined, locale: string | undefined) {
    if (!module) {
        module = defaultModule();
    }

    const translations = module ? allTranslations[module] : undefined;
    if (!translations) {
        return {};
    }

    return translations.dictionaries[locale || FALLBACK_CULTURE];
}

export function register(options: TranslationOptions) {
    allTranslations[options.name] = {
        translations: options.strings || options.translations || [],
        dictionaries: {}
    };
}

export function loadStringsForLocale(options: string | TranslationOptions, locale: string) {
    const promises = [];
    let optionsName;
    if (typeof options === 'string') {
        optionsName = options;
    } else {
        optionsName = options.name;
        register(options);
    }
    promises.push(ensureTranslation(allTranslations[optionsName], locale));
    promises.push(ensureTranslation(allTranslations[optionsName], FALLBACK_CULTURE));
    return Promise.all(promises);
}

function loadTranslation(translations: Translation[], lang: string) {
    lang = normalizeLocaleName(lang);

    let filtered = translations.filter(function (t) {
        return normalizeLocaleName(t.lang) === lang;
    });

    if (!filtered.length) {
        lang = lang.replace(/-.*/, '');

        filtered = translations.filter(function (t) {
            return normalizeLocaleName(t.lang) === lang;
        });

        if (!filtered.length) {
            filtered = translations.filter(function (t) {
                return normalizeLocaleName(t.lang) === FALLBACK_CULTURE;
            });
        }
    }

    return new Promise<Dictionary | undefined>(function (resolve) {
        if (!filtered.length) {
            resolve(undefined);
            return;
        }

        const url = filtered[0].path;

        void import(/* webpackChunkName: "[request]" */ `../../strings/${url}`).then((fileContent) => {
            resolve(fileContent);
        }).catch(() => {
            resolve({});
        });
    });
}

let _defaultModule: string | undefined;
export function defaultModule(val?: string) {
    if (val) {
        _defaultModule = val;
    }
    return _defaultModule;
}

