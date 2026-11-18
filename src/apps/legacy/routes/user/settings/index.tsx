import type { UserDto } from '@jellyfin/sdk/lib/generated-client/models/user-dto';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, type FC } from 'react';
import { useSearchParams } from 'react-router-dom';

import { appHost } from 'components/apphost';
import Loading from 'components/loading/LoadingComponent';
import Page from 'components/Page';
import { AppFeature } from 'constants/appFeature';
import LinkButton from 'components/buttons/LinkButton';
import { useApi } from 'hooks/useApi';
import { useQuickConnectEnabled } from 'hooks/useQuickConnect';
import { useUsers } from 'hooks/useUsers';
import globalize from 'lib/globalize';
import Dashboard from 'components/dashboard';
import shell from 'scripts/shell';
import focusManager from 'lib/focusManager';
import 'components/listview/listview.scss';

const UserSettingsPage: FC = () => {
    const menu = useRef<HTMLDivElement>(null);
    const { user: currentUser } = useApi();
    const [ searchParams ] = useSearchParams();
    const {
        data: isQuickConnectEnabled,
        isPending: isQuickConnectEnabledPending
    } = useQuickConnectEnabled();
    const { data: users } = useUsers();
    const [ user, setUser ] = useState<UserDto>();

    const userId = useMemo(() => (
        searchParams.get('userId') || currentUser?.Id
    ), [ currentUser, searchParams ]);
    const isLoggedInUser = useMemo(() => (
        userId && userId === currentUser?.Id
    ), [ currentUser, userId ]);

    useEffect(() => {
        if (userId) {
            if (userId === currentUser?.Id) setUser(currentUser);
            else setUser(users?.find(({ Id }) => userId === Id));
        }
    }, [ currentUser, userId, users ]);

    useLayoutEffect(() => {
        const list = menu.current;
        const page = list?.closest('.page');
        if (!list || !page) return;
        const onShow = () => focusManager.focus(list.querySelector<HTMLElement>('.lnkPlaybackPreferences'));
        page.addEventListener('viewshow', onShow);
        return () => page.removeEventListener('viewshow', onShow);
    }, [user, isQuickConnectEnabledPending]);

    if (!userId || !user || isQuickConnectEnabledPending) {
        return (
            <Loading />
        );
    }

    return (
        <Page
            id='myPreferencesMenuPage'
            className='libraryPage userPreferencesPage noSecondaryNavPage mainAnimatedPage'
            title={globalize.translate('Settings')}
        >
            <div className='padded-left padded-right padded-bottom-page padded-top'>
                <div
                    ref={menu}
                    className='readOnlyContent focuscontainer-x'
                    style={{
                        margin: '0 auto'
                    }}
                >
                    <div className='verticalSection verticalSection-extrabottompadding'>
                        <h2
                            className='sectionTitle headerUsername'
                            style={{
                                paddingLeft: '0.25em'
                            }}
                        >
                            {globalize.translate('SettingsThisTV')}
                        </h2>

                        <LinkButton
                            href={`#/mypreferencesplayback?userId=${userId}`}
                            className='lnkPlaybackPreferences listItem-border'
                            style={{
                                display: 'block',
                                margin: 0,
                                padding: 0
                            }}
                        >
                            <div className='listItem'>
                                <span className='material-icons listItemIcon listItemIcon-transparent play_circle_filled' aria-hidden='true' />
                                <div className='listItemBody'>
                                    <div className='listItemBodyText'>
                                        {globalize.translate('TitlePlayback')}
                                    </div>
                                </div>
                            </div>
                        </LinkButton>

                        <LinkButton
                            href={`#/mypreferencessubtitles?userId=${userId}`}
                            className='lnkSubtitlePreferences listItem-border'
                            style={{
                                display: 'block',
                                margin: 0,
                                padding: 0
                            }}
                        >
                            <div className='listItem'>
                                <span className='material-icons listItemIcon listItemIcon-transparent closed_caption' aria-hidden='true' />
                                <div className='listItemBody'>
                                    <div className='listItemBodyText'>
                                        {globalize.translate('Subtitles')}
                                    </div>
                                </div>
                            </div>
                        </LinkButton>

                        <LinkButton
                            href={`#/mypreferencesdisplay?userId=${userId}`}
                            className='lnkDisplayPreferences listItem-border'
                            style={{
                                display: 'block',
                                margin: 0,
                                padding: 0
                            }}
                        >
                            <div className='listItem'>
                                <span className='material-icons listItemIcon listItemIcon-transparent tv' aria-hidden='true' />
                                <div className='listItemBody'>
                                    <div className='listItemBodyText'>
                                        {globalize.translate('Display')}
                                    </div>
                                </div>
                            </div>
                        </LinkButton>

                        {appHost.supports(AppFeature.DownloadManagement) && (
                            <LinkButton
                                onClick={shell.openDownloadManager}
                                className='downloadManager listItem-border'
                                style={{
                                    display: 'block',
                                    margin: 0,
                                    padding: 0
                                }}
                            >
                                <div className='listItem'>
                                    <span className='material-icons listItemIcon listItemIcon-transparent download' aria-hidden='true' />
                                    <div className='listItemBody'>
                                        <div className='listItemBodyText'>
                                            {globalize.translate('DownloadManager')}
                                        </div>
                                    </div>
                                </div>
                            </LinkButton>
                        )}

                        {appHost.supports(AppFeature.ClientSettings) && (
                            <LinkButton
                                onClick={shell.openClientSettings}
                                className='clientSettings listItem-border'
                                style={{
                                    display: 'block',
                                    margin: 0,
                                    padding: 0
                                }}
                            >
                                <div className='listItem'>
                                    <span className='material-icons listItemIcon listItemIcon-transparent devices_other' aria-hidden='true' />
                                    <div className='listItemBody'>
                                        <div className='listItemBodyText'>
                                            {globalize.translate('ClientSettings')}
                                        </div>
                                    </div>
                                </div>
                            </LinkButton>
                        )}

                    </div>

                    {isLoggedInUser && (
                        <div className='userSection verticalSection verticalSection-extrabottompadding'>
                            <h2
                                className='sectionTitle headerUsername'
                                style={{
                                    paddingLeft: '0.25em'
                                }}
                            >
                                {globalize.translate('SettingsAccount', user.Name || '')}
                            </h2>

                            {appHost.supports(AppFeature.MultiServer) && (
                                <LinkButton
                                    onClick={Dashboard.selectServer}
                                    className='selectServer listItem-border'
                                    style={{
                                        display: 'block',
                                        margin: 0,
                                        padding: 0
                                    }}
                                >
                                    <div className='listItem'>
                                        <span className='material-icons listItemIcon listItemIcon-transparent storage' aria-hidden='true' />
                                        <div className='listItemBody'>
                                            <div className='listItemBodyText'>
                                                {globalize.translate('SelectServer')}
                                            </div>
                                        </div>
                                    </div>
                                </LinkButton>
                            )}

                            {isQuickConnectEnabled && (
                                <LinkButton
                                    href={`#/quickconnect?userId=${userId}`}
                                    className='lnkQuickConnectPreferences listItem-border'
                                    style={{
                                        display: 'block',
                                        margin: 0,
                                        padding: 0
                                    }}
                                >
                                    <div className='listItem'>
                                        <span className='material-icons listItemIcon listItemIcon-transparent phonelink_lock' aria-hidden='true' />
                                        <div className='listItemBody'>
                                            <div className='listItemBodyText'>
                                                {globalize.translate('QuickConnect')}
                                            </div>
                                        </div>
                                    </div>
                                </LinkButton>
                            )}

                            <LinkButton
                                onClick={Dashboard.logout}
                                className='btnLogout listItem-border'
                                style={{
                                    display: 'block',
                                    margin: 0,
                                    padding: 0
                                }}
                            >
                                <div className='listItem'>
                                    <span className='material-icons listItemIcon listItemIcon-transparent exit_to_app' aria-hidden='true' />
                                    <div className='listItemBody'>
                                        <div className='listItemBodyText'>
                                            {globalize.translate('ButtonSignOut')}
                                        </div>
                                    </div>
                                </div>
                            </LinkButton>

                            {appHost.supports(AppFeature.ExitMenu) && (
                                <LinkButton
                                    onClick={appHost.exit}
                                    className='exitApp listItem-border'
                                    style={{
                                        display: 'block',
                                        margin: 0,
                                        padding: 0
                                    }}
                                >
                                    <div className='listItem'>
                                        <span className='material-icons listItemIcon listItemIcon-transparent close' aria-hidden='true' />
                                        <div className='listItemBody'>
                                            <div className='listItemBodyText'>
                                                {globalize.translate('ButtonExitApp')}
                                            </div>
                                        </div>
                                    </div>
                                </LinkButton>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </Page>
    );
};

export default UserSettingsPage;
