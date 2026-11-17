import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import DOMPurify from 'dompurify';
import { describe, expect, it, vi } from 'vitest';
import MarkdownBox from './MarkdownBox';

describe('MarkdownBox', () => {
    it('sanitizes once per markdown change and preserves the fallback', () => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        const sanitize = vi.spyOn(DOMPurify, 'sanitize');
        const container = document.createElement('div');
        const root = createRoot(container);
        try {
            act(() => root.render(<MarkdownBox markdown='**hello**<script>alert(1)</script>' />));
            expect(container.innerHTML).toContain('<strong>hello</strong>');
            expect(container.innerHTML).not.toContain('<script>');
            act(() => root.render(<MarkdownBox markdown='**hello**<script>alert(1)</script>' fallback='unused' />));
            expect(sanitize).toHaveBeenCalledTimes(1);
            act(() => root.render(<MarkdownBox markdown='updated' />));
            expect(sanitize).toHaveBeenCalledTimes(2);
            expect(container.textContent).toBe('updated\n');
            act(() => root.render(<MarkdownBox fallback='No changelog' />));
            expect(container.textContent).toBe('No changelog');
            expect(sanitize).toHaveBeenCalledTimes(2);
        } finally {
            act(() => root.unmount());
            vi.unstubAllGlobals();
        }
    });
});
