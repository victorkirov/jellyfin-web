import datetime from '../../scripts/datetime';

export default function sortPrograms(programs, channels) {
    const channelIndexes = new Map();
    channels.forEach((channel, index) => {
        if (!channelIndexes.has(channel.Id)) {
            channelIndexes.set(channel.Id, index);
        }
    });

    const sortOrders = new Map();
    for (const program of programs) {
        const channelIndex = channelIndexes.has(program.ChannelId) ? channelIndexes.get(program.ChannelId) : -1;
        const start = datetime.parseISO8601Date(program.StartDate, { toLocal: true });
        sortOrders.set(program, (channelIndex * 10000000) + (start.getTime() / 60000));
    }

    programs.sort((first, second) => sortOrders.get(first) - sortOrders.get(second));
}
