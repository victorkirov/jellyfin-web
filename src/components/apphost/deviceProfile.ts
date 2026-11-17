import { enableHlsJsPlayer } from 'lib/playback/hlsSupport';
import detectedBrowser from 'scripts/browser';
import type { BrowserDetection, PlayerOptions, PlayerProfile } from 'types/legacyPlayer';
import appSettings from 'scripts/settings/appSettings';
import profileBuilder from 'scripts/browserDeviceProfile';
import { appHost } from '../apphost';

const browser = detectedBrowser as BrowserDetection;

function getBaseProfileOptions(item?: PlayerOptions['item'] | null) {
    const disableHlsVideoAudioCodecs: string[] = [];
    if (item && enableHlsJsPlayer(item.RunTimeTicks, item.MediaType)) {
        if (browser.edge) disableHlsVideoAudioCodecs.push('mp3');
        if (!browser.edgeChromium) disableHlsVideoAudioCodecs.push('ac3', 'eac3');
        if (!(browser.chrome || browser.edgeChromium || browser.firefox)) disableHlsVideoAudioCodecs.push('opus');
    }
    return {
        enableMkvProgressive: false,
        disableHlsVideoAudioCodecs
    };
}

export function getDeviceProfile(item?: PlayerOptions['item'] | null, options?: { isRetry?: boolean }): Promise<PlayerProfile>;
export function getDeviceProfile(item?: PlayerOptions['item'] | null) {
    return new Promise<PlayerProfile>(function (resolve) {
        let profile: PlayerProfile;

        if (window.NativeShell) {
            profile = window.NativeShell.AppHost.getDeviceProfile(profileBuilder, __PACKAGE_JSON_VERSION__);
        } else {
            const builderOpts = getBaseProfileOptions(item);
            // The JS builder populates these arrays after its initial object declaration.
            profile = profileBuilder(builderOpts) as unknown as PlayerProfile;
        }

        const maxVideoWidth = appSettings.maxVideoWidth(undefined);
        const maxTranscodingVideoWidth = maxVideoWidth < 0 ? appHost.screen()?.maxAllowedWidth : maxVideoWidth;

        if (maxTranscodingVideoWidth) {
            const conditionWidth: import('@jellyfin/sdk/lib/generated-client/models/profile-condition').ProfileCondition = {
                Condition: 'LessThanEqual',
                Property: 'Width',
                Value: maxTranscodingVideoWidth.toString(),
                IsRequired: false
            };

            if (appSettings.limitSupportedVideoResolution(undefined)) {
                profile.CodecProfiles.push({
                    Type: 'Video',
                    Conditions: [conditionWidth]
                });
            }

            profile.TranscodingProfiles.forEach((transcodingProfile) => {
                if (transcodingProfile.Type === 'Video') {
                    transcodingProfile.Conditions = (transcodingProfile.Conditions || []).filter((condition) => {
                        return condition.Property !== 'Width';
                    });

                    transcodingProfile.Conditions.push(conditionWidth);
                }
            });
        }

        const preferredTranscodeVideoCodec = appSettings.preferredTranscodeVideoCodec(undefined);
        if (preferredTranscodeVideoCodec) {
            profile.TranscodingProfiles.forEach((transcodingProfile) => {
                if (transcodingProfile.Type === 'Video') {
                    const videoCodecs = transcodingProfile.VideoCodec!.split(',');
                    const index = videoCodecs.indexOf(preferredTranscodeVideoCodec);
                    if (index !== -1) {
                        videoCodecs.splice(index, 1);
                        videoCodecs.unshift(preferredTranscodeVideoCodec);
                        transcodingProfile.VideoCodec = videoCodecs.join(',');
                    }
                }
            });
        }

        const preferredTranscodeVideoAudioCodec = appSettings.preferredTranscodeVideoAudioCodec(undefined);
        if (preferredTranscodeVideoAudioCodec) {
            profile.TranscodingProfiles.forEach((transcodingProfile) => {
                if (transcodingProfile.Type === 'Video') {
                    const audioCodecs = transcodingProfile.AudioCodec!.split(',');
                    const index = audioCodecs.indexOf(preferredTranscodeVideoAudioCodec);
                    if (index !== -1) {
                        audioCodecs.splice(index, 1);
                        audioCodecs.unshift(preferredTranscodeVideoAudioCodec);
                        transcodingProfile.AudioCodec = audioCodecs.join(',');
                    }
                }
            });
        }

        resolve(profile);
    });
}

