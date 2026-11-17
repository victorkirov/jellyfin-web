import React, { type FC, useCallback, useEffect, useRef } from 'react';
import { useSearchItems } from '../api/useSearchItems';
import globalize from 'lib/globalize';
import Loading from 'components/loading/LoadingComponent';
import SearchResultsRow from './SearchResultsRow';
import { CollectionType } from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import { Section } from '../types';
import { Link } from 'react-router-dom';
import Button from 'elements/emby-button/Button';
import focusManager from 'lib/focusManager';

interface SearchResultsProps {
    parentId?: string;
    collectionType?: CollectionType;
    query?: string;
}

/*
 * React component to display search result rows for global search and library view search
 */
const SearchResults: FC<SearchResultsProps> = ({
    parentId,
    collectionType,
    query
}) => {
    const { data, isPending, isFetching, isError, refetch } = useSearchItems(parentId, collectionType, query?.trim());
    const results = useRef<HTMLDivElement>(null);
    const retryHasFocus = useRef(false);

    useEffect(() => {
        if (retryHasFocus.current && !isFetching) {
            retryHasFocus.current = false;
            if (results.current && (document.activeElement === document.body
                || results.current.contains(document.activeElement))) {
                const target = focusManager.autoFocus(results.current) || document.getElementById('searchTextInput');
                if (target) focusManager.focus(target);
            }
        }
    }, [isFetching, isError, data]);

    const onRetry = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        if (isFetching) return;
        retryHasFocus.current = event.currentTarget === document.activeElement;
        void refetch();
    }, [isFetching, refetch]);

    if (isPending) return <Loading />;

    if (!data.length && !isError) {
        return (
            <div ref={results} className='noItemsMessage centerMessage'>
                {globalize.translate('SearchResultsEmpty', query || '')}
                {collectionType && (
                    <div>
                        <Link
                            className='emby-button'
                            to={`/search?query=${encodeURIComponent(query || '')}`}
                        >{globalize.translate('RetryWithGlobalSearch')}</Link>
                    </div>
                )}
            </div>
        );
    }

    const renderSection = (section: Section) => {
        return (
            <SearchResultsRow
                key={section.title}
                title={globalize.translate(section.title)}
                items={section.items}
                cardOptions={section.cardOptions}
            />
        );
    };

    return (
        <div ref={results} className='searchResults padded-top padded-bottom-page'>
            {isError && (
                <div className='padded-left padded-right'>
                    <p role='status'>{globalize.translate('SearchLoadError')}</p>
                    <Button
                        type='button'
                        className='raised'
                        title={globalize.translate('Retry')}
                        aria-busy={isFetching}
                        onClick={onRetry}
                    />
                </div>
            )}
            {data.map(renderSection)}
        </div>
    );
};

export default SearchResults;
