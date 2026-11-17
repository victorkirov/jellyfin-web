const cancelled = new Error('Playback preparation cancelled');

/** Owns preparation until the player can take over cancellation. */
export class PlaybackAttempt {
    private generation = 0;
    private loadingOwners = 0;

    begin(ownsLoading: boolean) {
        this.loadingOwners = ownsLoading ? 1 : 0;
        return ++this.generation;
    }

    invalidate() {
        const ownsLoading = this.loadingOwners > 0;
        this.loadingOwners = 0;
        this.generation++;
        return ownsLoading;
    }

    claimLoading(generation: number) {
        this.assertCurrent(generation);
        this.loadingOwners++;
    }

    finish(generation: number) {
        if (this.isCurrent(generation) && this.loadingOwners > 0) this.loadingOwners--;
    }

    isCurrent(generation: number) {
        return generation === this.generation;
    }

    assertCurrent(generation: number) {
        if (!this.isCurrent(generation)) throw cancelled;
    }

    capture() {
        return this.generation;
    }
}
