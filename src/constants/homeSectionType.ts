// NOTE: This should be included in the OpenAPI spec ideally
// https://github.com/jellyfin/jellyfin/blob/1b4394199a2f9883cd601bdb8c9d66015397aa52/Jellyfin.Data/Enums/HomeSectionType.cs
export enum HomeSectionType {
    None = 'none',
    SmallLibraryTiles = 'smalllibrarytiles',
    LibraryButtons = 'librarybuttons',
    ActiveRecordings = 'activerecordings',
    Resume = 'resume',
    ResumeAudio = 'resumeaudio',
    LatestMedia = 'latestmedia',
    NextUp = 'nextup',
    LiveTv = 'livetv',
    ResumeBook = 'resumebook'
}

// TV defaults apply only when a local section preference is unset.
export const DEFAULT_SECTIONS: HomeSectionType[] = [
    HomeSectionType.Resume,
    HomeSectionType.LibraryButtons,
    HomeSectionType.ResumeAudio,
    HomeSectionType.ResumeBook,
    HomeSectionType.LiveTv,
    HomeSectionType.NextUp,
    HomeSectionType.LatestMedia,
    HomeSectionType.None,
    HomeSectionType.None,
    HomeSectionType.None
];
