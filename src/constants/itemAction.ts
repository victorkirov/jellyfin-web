/** Actions that can be performed on a BaseItem. */
export enum ItemAction {
    /** Trigger a custom action via an Event. */
    Custom = 'custom',
    /** Create an instant mix based on the Item. */
    InstantMix = 'instantmix',
    /** Open the details view for the Item. */
    Link = 'link',
    /** Open the context menu for the Item. */
    Menu = 'menu',
    /** Perform no action. Used to prevent a parent element's action being triggered. */
    None = 'none',
    /** Play the Item. */
    Play = 'play',
    /** Queue the Item and all subsequent Items and start playback. */
    PlayAllFromHere = 'playallfromhere',
    /** Open the play menu for the Item. */
    PlayMenu = 'playmenu',
    /** Play the trailer for the Item. */
    PlayTrailer = 'playtrailer',
    /** Queue the Item. */
    Queue = 'queue',
    /** Queue the Item and all subsequent Items. */
    QueueAllFromHere = 'queueallfromhere',
    /** Resume playback of the Item. */
    Resume = 'resume',
    /** Set this Item as the Item to be currently played from a playlist. */
    SetPlaylistIndex = 'setplaylistindex'
};
