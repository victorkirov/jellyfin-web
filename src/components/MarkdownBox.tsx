import DOMPurify from 'dompurify';
import React, { type FC, useMemo } from 'react';

import { renderMarkdown } from 'utils/markdown';

import './MarkdownBox.scss';

interface MarkdownBoxProps {
    markdown?: string | null
    fallback?: string
}

/** Sanitized Markdown for legacy and React views. */
const MarkdownBox: FC<MarkdownBoxProps> = ({
    markdown,
    fallback
}) => {
    const html = useMemo(() => (
        markdown ?
            { __html: DOMPurify.sanitize(renderMarkdown(markdown)) } :
            undefined
    ), [markdown]);

    return (
        <div
            className='markdownBox'
            dangerouslySetInnerHTML={html}
        >
            {markdown ? undefined : fallback}
        </div>
    );
};

export default MarkdownBox;
