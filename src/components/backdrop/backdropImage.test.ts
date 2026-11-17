import { afterEach, expect, it, vi } from 'vitest';
import BackdropImage from './backdropImage';

afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
});

it('displays a loaded backdrop without animation and ignores loads after destruction', () => {
    let onload: (() => void) | null = null;
    vi.stubGlobal('Image', class {
        src = '';
        set onload(callback: () => void) { onload = callback; }
    });
    document.body.innerHTML = '<div id="backdropImage0"></div><div id="backdropImage1" class="displayingBackdropImage"></div>';
    const loaded = vi.fn();
    const image = new BackdropImage(loaded);
    image.load('/backdrop.jpg', 0);
    onload!();
    expect(document.getElementById('backdropImage0')!.className).toBe('displayingBackdropImage');
    expect(document.getElementById('backdropImage1')!.classList.contains('displayingBackdropImage')).toBe(false);
    expect(loaded).toHaveBeenCalledWith(true);
    image.destroy();
    onload!();
    expect(loaded).toHaveBeenCalledOnce();
});
