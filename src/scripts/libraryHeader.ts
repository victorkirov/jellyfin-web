import globalize from 'lib/globalize';
import browser from './browser';
import datetime from './datetime';

export function renderHeaderMarkup(skinHeader: HTMLElement) {
    let html = '';
    html += '<div class="flex align-items-center flex-grow headerTop">';
    html += '<div class="headerLeft">';
    html += '<button type="button" is="paper-icon-button-light" class="headerButton headerButtonLeft headerBackButton hide"><span class="material-icons ' + (browser.safari ? 'chevron_left' : 'arrow_back') + '" aria-hidden="true"></span></button>';
    html += '<button type="button" is="paper-icon-button-light" class="headerButton headerHomeButton hide barsMenuButton headerButtonLeft"><span class="material-icons home" aria-hidden="true"></span></button>';
    html += '<h3 class="pageTitle" aria-hidden="true"></h3>';
    html += '</div>';
    html += '<div class="headerRight">';
    html += '<button is="paper-icon-button-light" class="headerAudioPlayerButton audioPlayerButton headerButton headerButtonRight hide"><span class="material-icons music_note" aria-hidden="true"></span></button>';
    html += '<button type="button" is="paper-icon-button-light" class="headerButton headerButtonRight headerSearchButton hide"><span class="material-icons search" aria-hidden="true"></span></button>';
    html += '<button is="paper-icon-button-light" class="headerButton headerButtonRight headerUserButton hide"><span class="material-icons person" aria-hidden="true"></span></button>';
    html += '<div class="currentTimeText hide"></div>';
    html += '</div>';
    html += '</div>';
    html += '<div class="headerTabs sectionTabs hide">';
    html += '</div>';

    skinHeader.classList.add('skinHeader-withBackground');
    skinHeader.classList.add('skinHeader-blurred');
    skinHeader.innerHTML = html;
}

export function retranslateUi(headerBackButton: HTMLButtonElement, headerHomeButton: HTMLButtonElement, headerAudioPlayerButton: HTMLButtonElement, headerSearchButton: HTMLButtonElement, headerUserButton: HTMLButtonElement) {
    if (headerBackButton) {
        headerBackButton.title = globalize.translate('ButtonBack');
    }

    if (headerHomeButton) {
        headerHomeButton.title = globalize.translate('Home');
    }

    if (headerAudioPlayerButton) {
        headerAudioPlayerButton.title = globalize.translate('ButtonPlayer');
    }

    if (headerSearchButton) {
        headerSearchButton.title = globalize.translate('Search');
    }

    if (headerUserButton) {
        headerUserButton.title = globalize.translate('Settings');
    }
}

export function updateHeaderUserButton(headerUserButton: HTMLButtonElement, src: string | null) {
    if (src) {
        headerUserButton.classList.add('headerUserButtonRound');
        headerUserButton.innerHTML = '<div class="headerButton headerButtonRight paper-icon-button-light headerUserButtonRound" style="background-image:url(\'' + src + "');\"></div>";
    } else {
        headerUserButton.classList.remove('headerUserButtonRound');
        headerUserButton.innerHTML = '<span class="material-icons person" aria-hidden="true"></span>';
    }
}

export function updateClock(currentTimeText: HTMLElement) {
    currentTimeText.classList.remove('hide');
    let lastMinute: number | undefined;
    setInterval(function() {
        const now = new Date();
        // Formatting the time is slow on low-end TVs, so only update it when the minute changes
        if (now.getMinutes() !== lastMinute) {
            lastMinute = now.getMinutes();
            currentTimeText.innerText = datetime.getDisplayTime(now);
        }
    }, 1000);
}

