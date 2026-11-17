import type { UserItemDataDto } from '@jellyfin/sdk/lib/generated-client/models/user-item-data-dto';
import indicators from '../indicators/indicators';

/**
 * Ensures the indicators for a card exist and creates them if they don't exist.
 * @param {HTMLDivElement} card - DOM element of the card.
 * @param {HTMLDivElement} indicatorsElem - DOM element of the indicators.
 * @returns {HTMLDivElement} - DOM element of the indicators.
 */
function ensureIndicators(card: Element, indicatorsElem?: HTMLElement | null): HTMLElement {
    if (indicatorsElem) {
        return indicatorsElem;
    }

    indicatorsElem = card.querySelector<HTMLElement>('.cardIndicators');

    if (!indicatorsElem) {
        const cardImageContainer = card.querySelector('.cardImageContainer');
        indicatorsElem = document.createElement('div');
        indicatorsElem.classList.add('cardIndicators');
        cardImageContainer!.appendChild(indicatorsElem);
    }

    return indicatorsElem;
}

function updatePlayedIndicator(card: Element, userData: UserItemDataDto) {
    let playedIndicator;
    if (userData.Played) {
        playedIndicator = card.querySelector('.playedIndicator');

        if (!playedIndicator) {
            playedIndicator = document.createElement('div');
            playedIndicator.classList.add('playedIndicator', 'indicator');
            ensureIndicators(card).appendChild(playedIndicator);
        }
        playedIndicator.innerHTML = '<span class="material-icons indicatorIcon check" aria-hidden="true"></span>';
    } else {
        playedIndicator = card.querySelector('.playedIndicator');
        if (playedIndicator) {
            playedIndicator.parentNode!.removeChild(playedIndicator);
        }
    }
}

function updateCountIndicator(card: Element, userData: UserItemDataDto) {
    const type = card.getAttribute('data-type');
    const enableCountIndicator = type === 'Series' || type === 'BoxSet' || type === 'Season';
    let countIndicator;
    if (userData.UnplayedItemCount) {
        countIndicator = card.querySelector('.countIndicator');

        if (!countIndicator) {
            countIndicator = document.createElement('div');
            countIndicator.classList.add('countIndicator', 'indicator');
            ensureIndicators(card).appendChild(countIndicator);
        }
        countIndicator.innerHTML = String(userData.UnplayedItemCount);
    } else if (enableCountIndicator) {
        countIndicator = card.querySelector('.countIndicator');
        if (countIndicator) {
            countIndicator.parentNode!.removeChild(countIndicator);
        }
    }
}

/**
 * Adds user data to the card such as progress indicators and played status.
 * @param {HTMLDivElement} card - DOM element of the card.
 * @param {Object} userData - User data to apply to the card.
 */
function updateUserData(card: Element, userData: UserItemDataDto) {
    updatePlayedIndicator(card, userData);
    updateCountIndicator(card, userData);
    const type = card.getAttribute('data-type');
    let itemProgressBar;

    const progressHtml = indicators.getProgressBarHtml({
        Type: type,
        UserData: userData,
        MediaType: 'Video'
    });

    if (progressHtml) {
        itemProgressBar = card.querySelector('.itemProgressBar');

        if (!itemProgressBar) {
            itemProgressBar = document.createElement('div');
            itemProgressBar.classList.add('itemProgressBar');

            let innerCardFooter = card.querySelector('.innerCardFooter');
            if (!innerCardFooter) {
                innerCardFooter = document.createElement('div');
                innerCardFooter.classList.add('innerCardFooter');
                const cardImageContainer = card.querySelector('.cardImageContainer');
                cardImageContainer!.appendChild(innerCardFooter);
            }
            innerCardFooter.appendChild(itemProgressBar);
        }

        card.setAttribute('data-positionticks', String(userData.PlaybackPositionTicks));
        itemProgressBar.innerHTML = progressHtml;
    } else {
        itemProgressBar = card.querySelector('.itemProgressBar');
        if (itemProgressBar) {
            itemProgressBar.parentNode!.removeChild(itemProgressBar);
        }
    }
}

/**
 * Handles when user data has changed.
 * @param {Object} userData - User data to apply to the card.
 * @param {HTMLElement} scope - DOM element to use as a scope when selecting cards.
 */
export function onUserDataChanged(userData: UserItemDataDto, scope?: Element | null) {
    const cards = (scope || document.body).querySelectorAll('.card-withuserdata[data-id="' + userData.ItemId + '"]');

    for (let i = 0, length = cards.length; i < length; i++) {
        updateUserData(cards[i], userData);
    }
}

/**
 * Handles when a timer has been created.
 * @param {string} programId - ID of the program.
 * @param {string} newTimerId - ID of the new timer.
 * @param {HTMLElement} itemsContainer - DOM element of the itemsContainer.
 */
export function onTimerCreated(programId: string, newTimerId: string, itemsContainer: Element) {
    const cells = itemsContainer.querySelectorAll('.card[data-id="' + programId + '"]');

    for (let i = 0, length = cells.length; i < length; i++) {
        const cell = cells[i];
        const icon = cell.querySelector('.timerIndicator');
        if (!icon) {
            const indicatorsElem = ensureIndicators(cell);
            indicatorsElem.insertAdjacentHTML('beforeend', '<span class="material-icons timerIndicator indicatorIcon fiber_manual_record" aria-hidden="true"></span>');
        }
        cell.setAttribute('data-timerid', newTimerId);
    }
}

/**
 * Handles when a timer has been cancelled.
 * @param {string} timerId - ID of the cancelled timer.
 * @param {HTMLElement} itemsContainer - DOM element of the itemsContainer.
 */
export function onTimerCancelled(timerId: string, itemsContainer: Element) {
    const cells = itemsContainer.querySelectorAll('.card[data-timerid="' + timerId + '"]');

    for (const cell of cells) {
        const icon = cell.querySelector('.timerIndicator');
        if (icon) {
            icon.parentNode!.removeChild(icon);
        }
        cell.removeAttribute('data-timerid');
    }
}

/**
 * Handles when a series timer has been cancelled.
 * @param {string} cancelledTimerId - ID of the cancelled timer.
 * @param {HTMLElement} itemsContainer - DOM element of the itemsContainer.
 */
export function onSeriesTimerCancelled(cancelledTimerId: string, itemsContainer: Element) {
    const cells = itemsContainer.querySelectorAll('.card[data-seriestimerid="' + cancelledTimerId + '"]');

    for (const cell of cells) {
        const icon = cell.querySelector('.timerIndicator');
        if (icon) {
            icon.parentNode!.removeChild(icon);
        }
        cell.removeAttribute('data-seriestimerid');
    }
}

