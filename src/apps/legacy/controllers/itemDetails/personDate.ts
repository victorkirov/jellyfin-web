import { intervalToDuration } from 'date-fns';
import globalize from 'lib/globalize';
import datetime from 'scripts/datetime';

function parsePersonDate(value: string): Date {
    const calendarDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    // A date without a time denotes a calendar day in every timezone.
    const date = calendarDate ? new Date(Number(calendarDate[1]), Number(calendarDate[2]) - 1, Number(calendarDate[3])) :
        datetime.parseISO8601Date(value, true);
    if (isNaN(date.getTime()) || (calendarDate && (date.getMonth() !== Number(calendarDate[2]) - 1 || date.getDate() !== Number(calendarDate[3])))) {
        throw new Error('Invalid person date');
    }
    return date;
}

export function formatPersonDate(value: string, label: 'BirthDateValue' | 'DeathDateValue', ageStart?: string, ageEnd: string | number = Date.now()) {
    const caption = globalize.translate(label, datetime.toLocaleDateString(parsePersonDate(value)));
    if (!ageStart) return caption;
    const duration = intervalToDuration({ start: parsePersonDate(ageStart), end: typeof ageEnd === 'string' ? parsePersonDate(ageEnd) : ageEnd });
    return `${caption} ${globalize.translate('AgeValue', duration.years!)}`;
}
