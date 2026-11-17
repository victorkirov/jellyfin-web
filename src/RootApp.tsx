import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import React from 'react';

import 'scripts/localizationSettings';
import 'scripts/configureServerConnections';
import 'scripts/applicationInput';

import QueryClientEventHandler from 'components/QueryClientEventHandler';
import { ApiProvider } from 'hooks/useApi';
import { UserSettingsProvider } from 'hooks/useUserSettings';
import { persister, queryClient, shouldPersistQuery } from 'utils/query/queryClient';
import { QUERY_CACHE_VERSION } from 'utils/query/queryKeys';

import RootAppRouter from 'RootAppRouter';

const RootApp = () => (
    <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
            buster: `${__JF_BUILD_VERSION__}-${QUERY_CACHE_VERSION}`,
            persister,
            dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery }
        }}
    >
        <ApiProvider>
            <UserSettingsProvider>
                <QueryClientEventHandler />
                <RootAppRouter />
            </UserSettingsProvider>
        </ApiProvider>
    </PersistQueryClientProvider>
);

export default RootApp;
