import layoutManager from 'lib/layoutManager';
import toast from 'components/toast/toast';
import globalize from 'lib/globalize';
import appSettings from 'scripts/settings/appSettings';
import Events from 'utils/events';

export default function (view: HTMLElement) {
    function submit(e?: Event) {
        appSettings.enableSmoothScroll(view.querySelector<HTMLInputElement>('.chkSmoothScroll')!.checked);

        toast(globalize.translate('SettingsSaved'));

        Events.trigger(view, 'saved');

        e?.preventDefault();

        return false;
    }

    view.addEventListener('viewshow', function () {
        view.querySelector<HTMLElement>('.smoothScrollContainer')!.classList.toggle('hide', !layoutManager.tv);

        view.querySelector<HTMLInputElement>('.chkSmoothScroll')!.checked = appSettings.enableSmoothScroll();

        view.querySelector('form')!.addEventListener('submit', submit);
        view.querySelector<HTMLElement>('.btnSave')!.classList.remove('hide');

        void import('components/autoFocuser').then(({ default: autoFocuser }) => {
            autoFocuser.autoFocus(view);
        });
    });
}
