import focusManager from '../../lib/focusManager';
import type { DialogElement } from './dialogTypes';

export function focusDialog(dlg: DialogElement) {
    focusManager.pushScope(dlg);

    if (dlg.getAttribute('data-autofocus') === 'true') {
        focusManager.autoFocus(dlg);
    }

    if (document.activeElement && !dlg.contains(document.activeElement)) {
        // Blur foreign element to prevent triggering of an action from the previous scope
        (document.activeElement as HTMLElement).blur();
    }
}
