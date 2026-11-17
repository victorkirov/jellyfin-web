import React, { FunctionComponent } from 'react';

import Loading from 'components/loading/LoadingComponent';
import { appRouter } from 'components/router/appRouter';
import { useSearchSuggestions } from '../api/useSearchSuggestions';
import globalize from 'lib/globalize';
import LinkButton from 'components/buttons/LinkButton';

import 'components/buttons/emby-button';
import './SearchSuggestions.scss';

type SearchSuggestionsProps = {
    parentId?: string | null;
};

const SearchSuggestions: FunctionComponent<SearchSuggestionsProps> = ({ parentId }) => {
    const { data: suggestions, isPending } = useSearchSuggestions(parentId || undefined);

    if (isPending) return <Loading />;

    return (
        <div
            className='verticalSection searchSuggestions'
        >
            <div>
                <h2 className='sectionTitle padded-left padded-right'>
                    {globalize.translate('Suggestions')}
                </h2>
            </div>

            <div className='searchSuggestionsList padded-left padded-right'>
                {suggestions?.slice(0, 8).map(item => (
                    <div key={item.Id}>
                        <LinkButton
                            className='searchSuggestion'
                            href={appRouter.getRouteUrl(item)}
                        >
                            {item.Name}
                        </LinkButton>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SearchSuggestions;
