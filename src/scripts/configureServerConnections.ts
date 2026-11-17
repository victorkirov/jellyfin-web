import { appHost } from 'components/apphost';
import Dashboard from 'components/dashboard';
import { configureServerConnections } from 'lib/jellyfin-apiclient/ServerConnections';
import { detectBitrate } from 'utils/bitrateTest';

import appSettings from './settings/appSettings';
import { setUserInfo } from './settings/userSettings';

configureServerConnections({
    appName: () => appHost.appName(),
    appVersion: () => appHost.appVersion(),
    deviceName: () => appHost.deviceName(),
    deviceId: () => appHost.deviceId(),
    capabilities: Dashboard.capabilities(appHost),
    enableAutoLogin: () => appSettings.enableAutoLogin(),
    setUserInfo,
    detectBitrate
});
