import { afterEach, expect, it, vi } from 'vitest';
import toast from './toast';

afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll('.toast').forEach(element => {
        element.remove();
    });
});

it('shows a toast immediately and removes it after its visible duration', () => {
    vi.useFakeTimers();
    toast('Saved');
    const element = document.querySelector('.toast')!;
    expect(element.textContent).toBe('Saved');
    expect(element.classList.contains('toastVisible')).toBe(true);
    vi.advanceTimersByTime(3299);
    expect(element.isConnected).toBe(true);
    vi.advanceTimersByTime(1);
    expect(element.isConnected).toBe(false);
});
