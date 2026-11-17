import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';

beforeEach(() => {
    document.body.innerHTML = readFileSync('src/apps/legacy/controllers/itemDetails/index.html', 'utf8');
});

function isBefore(first: Element, second: Element) {
    return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe('Details viewing choices', () => {
    it('puts the synopsis before tracks, with viewing choices before secondary metadata', () => {
        const actions = document.querySelector('.mainDetailButtons')!;
        const nextUp = document.querySelector('.nextUpSection')!;
        const seasons = document.querySelector('#listChildrenCollapsible')!;
        expect(isBefore(actions, document.querySelector('.overview')!)).toBe(true);
        expect(isBefore(document.querySelector('.overview')!, document.querySelector('.trackSelections')!)).toBe(true);
        expect(isBefore(document.querySelector('.overview-controls')!, document.querySelector('.tagline')!)).toBe(true);
        expect(isBefore(actions, nextUp)).toBe(true);
        expect(isBefore(nextUp, seasons)).toBe(true);
        for (const selector of ['.itemTags', '.itemDetailsGroup', '.itemGenres']) {
            expect(isBefore(seasons, document.querySelector(selector)!)).toBe(true);
        }
    });

    it('keeps the existing section identities, track form and deferred containers', () => {
        expect(document.querySelectorAll('#listChildrenCollapsible .itemsContainer')).toHaveLength(1);
        expect(document.querySelectorAll('.nextUpSection .nextUpItems')).toHaveLength(1);
        expect(document.querySelectorAll('#childrenCollapsible .itemsContainer')).toHaveLength(1);
        expect(document.querySelectorAll('#castCollapsible #castContent')).toHaveLength(1);
        expect(isBefore(document.querySelector('.trackSelections')!, document.querySelector('.nextUpSection')!)).toBe(true);
    });
});
