import { describe, expect, it, vi } from 'vitest';
import sortPrograms from './sortPrograms';
import datetime from '../../scripts/datetime';

vi.mock('../../scripts/datetime', () => ({
    default: { parseISO8601Date: vi.fn((date: string) => new Date(date)) }
}));

describe('guide program ordering', () => {
    it('preserves channel and start-time ordering while parsing each date once', () => {
        const channels = [{ Id: 'second' }, { Id: 'first' }, { Id: 'second' }];
        const programs = [
            { ChannelId: 'first', StartDate: '2026-11-17T01:00:00Z' },
            { ChannelId: 'second', StartDate: '2026-11-17T03:00:00Z' },
            { ChannelId: 'second', StartDate: '2026-11-17T01:00:00Z' },
            { ChannelId: 'unknown', StartDate: '2026-11-17T03:00:00Z' },
            { ChannelId: 'second', StartDate: '2026-11-17T01:00:00Z' }
        ];
        const expected = [programs[3], programs[2], programs[4], programs[1], programs[0]];
        sortPrograms(programs, channels);
        expect(programs).toEqual(expected);
        expect(datetime.parseISO8601Date).toHaveBeenCalledTimes(programs.length);
    });

    it('accepts an empty program list', () => {
        const programs: object[] = [];
        sortPrograms(programs, []);
        expect(programs).toEqual([]);
    });
});
