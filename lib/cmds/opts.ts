import {AndroidSDK, Appium} from '../binaries';
import {Option, Options} from '../cli';
import {Config} from '../config';

export const OUT_DIR = 'out_dir';
export const APPIUM_PORT = 'appium-port';
export const AVD_PORT = 'avd-port';
export const IGNORE_SSL = 'ignore_ssl';
export const PROXY = 'proxy';
export const ALTERNATE_CDN = 'alternate_cdn';
export const ANDROID = 'android';
export const IOS = 'ios';
export const VERSIONS_ANDROID = 'versions.android';
export const VERSIONS_APPIUM = 'versions.appium';
export const LOGGING = 'logging';
export const ANDROID_API_LEVELS = 'android-api-levels';
export const ANDROID_ARCHITECTURES = 'android-archs';
export const ANDROID_PLATFORMS = 'android-platorms';
export const ANDROID_ACCEPT_LICENSES = 'android-accept-licenses';
export const AVDS = 'avds';
export const AVD_USE_SNAPSHOTS = 'avd-use-snapshots';
export const STARTED_SIGNIFIER = 'started-signifier';
export const SIGNAL_VIA_IPC = 'signal-via-ipc';
export const DETACH = 'detach';
export const QUIET = 'quiet';
export const VERBOSE = 'verbose';
export const ALREADY_OFF_ERROR = 'already-off-error';

/**
 * The options used by the commands.
 */
var opts: Options = {};
opts[OUT_DIR] = new Option(OUT_DIR, 'Location to output/expect', 'string', Config.getSeleniumDir());
opts[APPIUM_PORT] =
    new Option(APPIUM_PORT, 'Optional port for the appium server', 'string', '4723');
opts[AVD_PORT] = new Option(
    AVD_PORT, 'Optional port for android virtual devices.  See mobile.md for details', 'number',
    5554);
opts[IGNORE_SSL] = new Option(IGNORE_SSL, 'Ignore SSL certificates', 'boolean', false);
opts[PROXY] = new Option(PROXY, 'Proxy to use for the install or update command', 'string');
opts[ALTERNATE_CDN] = new Option(ALTERNATE_CDN, 'Alternate CDN to binaries', 'string');
opts[ANDROID] = new Option(ANDROID, 'Update/use the android sdk', 'boolean', AndroidSDK.isDefault);
opts[IOS] = new Option(IOS, 'Update the iOS sdk', 'boolean', false);
opts[VERSIONS_ANDROID] = new Option(
    VERSIONS_ANDROID, 'Optional android sdk version', 'string', AndroidSDK.versionDefault);
opts[VERSIONS_APPIUM] =
    new Option(VERSIONS_APPIUM, 'Optional appium version', 'string', Appium.versionDefault);
opts[LOGGING] = new Option(LOGGING, 'File path to logging properties file', 'string', undefined);
opts[ANDROID_API_LEVELS] = new Option(
    ANDROID_API_LEVELS, 'Which versions of the android API you want to emulate', 'string',
    AndroidSDK.DEFAULT_API_LEVELS);
opts[ANDROID_ARCHITECTURES] = new Option(
    ANDROID_ARCHITECTURES,
    'Which architectures you want to use in android emulation.  By default it will try to match os.arch()',
    'string', AndroidSDK.DEFAULT_ARCHITECTURES);
opts[ANDROID_PLATFORMS] = new Option(
    ANDROID_PLATFORMS, 'Which platforms you want to use in android emulation', 'string',
    AndroidSDK.DEFAULT_PLATFORMS);
opts[ANDROID_ACCEPT_LICENSES] =
    new Option(ANDROID_ACCEPT_LICENSES, 'Automatically accept android licenses', 'boolean', false);
opts[AVDS] = new Option(
    AVDS,
    'Android virtual devices to emulate.  Use "all" for emulating all possible devices, and "none" for no devices',
    'string', 'all');
opts[AVD_USE_SNAPSHOTS] = new Option(
    AVD_USE_SNAPSHOTS,
    'Rather than booting a new AVD every time, save/load snapshots of the last time it was used',
    'boolean', true);
opts[STARTED_SIGNIFIER] = new Option(
    STARTED_SIGNIFIER,
    'A string to be outputted once the selenium server is up and running.  Useful if you are writing a script which uses webdriver-manager.',
    'string');
opts[SIGNAL_VIA_IPC] = new Option(
    SIGNAL_VIA_IPC,
    'If you are using --' + STARTED_SIGNIFIER +
        ', this flag will emit the signal string using process.send(), rather than writing it to stdout',
    'boolean', false);
opts[DETACH] = new Option(
    DETACH,
    'Once the selenium server is up and running, return control to the parent process and continue running the server in the background.',
    'boolean', false);
opts[VERBOSE] = new Option(VERBOSE, 'Extra console output', 'boolean', false);
opts[QUIET] = new Option(QUIET, 'Minimal console output', 'boolean', false);
opts[ALREADY_OFF_ERROR] = new Option(
    ALREADY_OFF_ERROR,
    'Normally if you try to shut down a selenium which is not running, you will get a warning.  This turns it into an error',
    'boolean', false);

export var Opts = opts;
