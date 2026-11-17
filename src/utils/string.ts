/**
 * Checks if two string are equal ignoring case.
 * @param str1 The first string.
 * @param str2 The second string.
 * @returns True if the strings are equal ignoring case.
 */
export const equalsIgnoreCase = (str1 = '', str2 = '') => str1.toLowerCase() === str2.toLowerCase();

/**
 * Gets the value of a string as boolean.
 * @param {string} name The value as a string.
 * @param {boolean} defaultValue The default value if the string is invalid.
 * @returns {boolean} The value.
 */
export function toBoolean(value: string | undefined | null, defaultValue = false) {
    if (value !== 'true' && value !== 'false') {
        return defaultValue;
    } else {
        return value !== 'false';
    }
}
