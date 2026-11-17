export type SubtitleData = {
    TrackEvents: {
        StartPositionTicks: number;
        EndPositionTicks: number;
        Text: string;
    }[];
};

type SubtitleFetchActivity = {
    incrementFetchQueue: () => void;
    decrementFetchQueue: () => void;
};

/** Keep fetch activity scoped to receiving the response, as in the player. */
export async function requestSubtitleData(activity: SubtitleFetchActivity, getUrl: () => string): Promise<SubtitleData> {
    activity.incrementFetchQueue();
    try {
        const response = await fetch(getUrl());
        if (!response.ok) {
            throw new Error(String(response));
        }
        return response.json();
    } finally {
        activity.decrementFetchQueue();
    }
}
