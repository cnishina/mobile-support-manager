import {ChildProcess} from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as minimist from 'minimist';
import * as path from 'path';

import {AndroidSDK, Appium, Binary, BinaryMap} from '../binaries';
import {Logger, Options, Program, unparseOptions} from '../cli';
import {Config} from '../config';
import {FileManager} from '../files';
import {adb, request, spawn} from '../utils';

import * as Opt from './';
import {Opts} from './opts';

const commandName = 'start';
Config.runCommand = commandName;

let logger = new Logger('start');
let prog = new Program()
               .command(commandName, 'start up the selenium server')
               .action(start)
               .addOption(Opts[Opt.OUT_DIR])
               .addOption(Opts[Opt.APPIUM_PORT])
               .addOption(Opts[Opt.AVD_PORT])
               .addOption(Opts[Opt.VERSIONS_ANDROID])
               .addOption(Opts[Opt.VERSIONS_APPIUM])
               .addOption(Opts[Opt.LOGGING])
               .addOption(Opts[Opt.ANDROID])
               .addOption(Opts[Opt.AVDS])
               .addOption(Opts[Opt.AVD_USE_SNAPSHOTS])
               .addOption(Opts[Opt.STARTED_SIGNIFIER])
               .addOption(Opts[Opt.SIGNAL_VIA_IPC])
               .addOption(Opts[Opt.QUIET])
               .addOption(Opts[Opt.DETACH]);

if (Config.osType() === 'Darwin') {
  prog.addOption(Opts[Opt.IOS]);
}

export var program = prog;

// stand alone runner
let argv = minimist(process.argv.slice(2), prog.getMinimistOptions());
if (argv._[0] === 'start-run') {
  prog.run(JSON.parse(JSON.stringify(argv)));
} else if (argv._[0] === 'start-help') {
  prog.printHelp();
}

// Manage processes used in android emulation
let androidProcesses: ChildProcess[] = [];
let androidActiveAVDs: string[] = [];

/**
 * Parses the options and starts the selenium standalone server.
 * @param options
 */
function start(options: Options) {
  if (options[Opt.DETACH].getBoolean()) {
    return detachedRun(options);
  }

  let osType = Config.osType();
  let stdio = options[Opt.QUIET].getBoolean() ? 'pipe' : 'inherit';
  let binaries = FileManager.setupBinaries();
  let appiumPort = options[Opt.APPIUM_PORT].getString();
  let avdPort = options[Opt.AVD_PORT].getNumber();
  let android = options[Opt.ANDROID].getBoolean();
  let outputDir = Config.getSeleniumDir();
  if (options[Opt.OUT_DIR].getString()) {
    if (path.isAbsolute(options[Opt.OUT_DIR].getString())) {
      outputDir = options[Opt.OUT_DIR].getString();
    } else {
      outputDir = path.resolve(Config.getBaseDir(), options[Opt.OUT_DIR].getString());
    }
  }

  try {
    // check if folder exists
    fs.statSync(outputDir).isDirectory();
  } catch (e) {
    // if the folder does not exist, quit early.
    logger.warn('the out_dir path ' + outputDir + ' does not exist, run webdriver-manager update');
    return;
  }

  binaries[AndroidSDK.id].versionCustom = options[Opt.VERSIONS_ANDROID].getString();
  binaries[Appium.id].versionCustom = options[Opt.VERSIONS_APPIUM].getString();
  let downloadedBinaries = FileManager.downloadedBinaries(outputDir);

  let promises: Promise<any>[] = [];
  let args: string[] = [];

  Promise.all(promises).then(() => {
    // starting android
    if (android) {
      if (downloadedBinaries[AndroidSDK.id] != null) {
        let avds = options[Opt.AVDS].getString();
        startAndroid(
            outputDir, binaries[AndroidSDK.id], avds.split(','),
            options[Opt.AVD_USE_SNAPSHOTS].getBoolean(), avdPort, stdio);
      } else {
        logger.warn('Not starting android because it is not installed');
      }
    }
    if (downloadedBinaries[Appium.id] != null) {
      startAppium(outputDir, binaries[Appium.id], binaries[AndroidSDK.id], appiumPort, stdio);
    }
  });
}

function startAndroid(
    outputDir: string, sdk: Binary, avds: string[], useSnapshots: boolean, port: number,
    stdio: string): void {
  let sdkPath = path.resolve(outputDir, sdk.executableFilename());
  if (avds[0] == 'all') {
    avds = <string[]>require(path.resolve(sdkPath, 'available_avds.json'));
  } else if (avds[0] == 'none') {
    avds.length = 0;
  }
  const minAVDPort = 5554;
  const maxAVDPort = 5586 - 2 * avds.length;
  if (avds.length && ((port < minAVDPort) || (port > maxAVDPort))) {
    throw new RangeError(
        'AVD Port must be between ' + minAVDPort + ' and ' + maxAVDPort + ' to emulate ' +
        avds.length + ' android devices');
  }
  avds.forEach((avd: string, i: number) => {
    // Credit to appium-ci, which this code was adapted from
    let emuBin = 'emulator';  // TODO(sjelin): get the 64bit linux version working
    let emuArgs = [
      '-avd',
      avd + '-v' + sdk.versionCustom + '-wd-manager',
      '-netfast',
    ];
    let portArg: number = null;
    if (!useSnapshots) {
      emuArgs = emuArgs.concat(['-no-snapshot-load', '-no-snapshot-save']);
    }
    if (port) {
      portArg = port + i * 2;
      emuArgs = emuArgs.concat(['-port', '' + portArg]);
    }
    if (emuBin !== 'emulator') {
      emuArgs = emuArgs.concat(['-qemu', '-enable-kvm']);
    }
    logger.info(
        'Starting ' + avd + ' on ' + (portArg == null ? 'default port' : 'port ' + portArg));
    let child = spawn(path.resolve(sdkPath, 'tools', emuBin), emuArgs, stdio);
    child.on('error', (error: Error) => {
      logger.warn(avd + ' encountered an error: ' + error);
    });
    androidProcesses.push(child);
    androidActiveAVDs.push(avd);
  });
}

function killAndroid() {
  for (var i = 0; i < androidProcesses.length; i++) {
    logger.info('Shutting down ' + androidActiveAVDs[i]);
    androidProcesses[i].kill();
  }
  androidProcesses.length = androidActiveAVDs.length = 0;
}

// Manage appium process
let appiumProcess: ChildProcess;

function startAppium(
    outputDir: string, binary: Binary, androidSDK: Binary, port: string, stdio: string) {
  logger.info('Starting appium server');
  if (androidSDK) {
    process.env.ANDROID_HOME = path.resolve(outputDir, androidSDK.executableFilename());
  }
  appiumProcess = spawn(
      'npm', ['run', 'appium'].concat(port ? ['--', '--port', port] : []), stdio,
      {cwd: path.resolve(outputDir, binary.filename())});
}

function killAppium() {
  if (appiumProcess != null) {
    appiumProcess.kill();
    appiumProcess = null;
  }
}


function signalWhenReady(
    signal: string, viaIPC: boolean, outputDir: string, seleniumPort: string, appiumPort: string,
    androidSDK: Binary, avdPort: number, avdNames: string[]) {
  const maxWait = 10 * 60 * 1000;  // Ten minutes
  function waitFor(
      getStatus: () => Promise<string>, testStatus: (status: string) => boolean, desc?: string) {
    const checkInterval = 100;
    return new Promise<void>((resolve, reject) => {
      let waited = 0;
      (function recursiveCheck() {
        setTimeout(() => {
          getStatus()
              .then<void>((status: string) => {
                if (!testStatus(status)) {
                  return Promise.reject(
                      'Invalid status' + (desc ? ' for ' + desc : '') + ': ' + status);
                }
              })
              .then(
                  () => {
                    resolve();
                  },
                  (error: any) => {
                    waited += checkInterval;
                    if (waited < maxWait) {
                      recursiveCheck();
                    } else {
                      reject(
                          'Timed out' + (desc ? ' wating for' + desc : '') +
                          '.  Final rejection reason: ' + JSON.stringify(error));
                    }
                  });
        }, checkInterval);
      })();
    });
  };
  function waitForAndroid(avdPort: number, avdName: string, appiumPort: string): Promise<void> {
    let sdkPath = path.resolve(outputDir, androidSDK.executableFilename());
    logger.info('Waiting for ' + avdName + '\'s emulator to start');
    return adb(sdkPath, avdPort, 'wait-for-device', maxWait)
        .then<void>(
            () => {
              logger.info('Waiting for ' + avdName + '\'s OS to boot up');
              return waitFor(
                  () => {
                    return adb(
                        sdkPath, avdPort, 'shell', maxWait, ['getprop', 'sys.boot_completed']);
                  },
                  (status: string) => {
                    return status.trim() == '1';
                  },
                  avdName + '\'s OS');
            },
            (error: {code: string|number, message: string}) => {
              return Promise.reject(
                  'Failed to wait for ' + avdName + '\'s emulator to start (' + error.code + ': ' +
                  error.message + ')');
            })
        .then<string>(() => {
          logger.info('Waiting for ' + avdName + ' to be ready to launch chrome');
          let version = AndroidSDK.VERSIONS[parseInt(avdName.slice('android-'.length))];
          return request('POST', appiumPort, '/wd/hub/session', maxWait, {
                   desiredCapabilities: {
                     browserName: 'chrome',
                     platformName: 'Android',
                     platformVersion: version,
                     deviceName: 'Android Emulator'
                   }
                 })
              .then(
                  (data) => {
                    return JSON.parse(data)['sessionId'];
                  },
                  (error: {code: string|number, message: string}) => {
                    return Promise.reject(
                        'Could not start chrome on ' + avdName + ' (' + error.code + ': ' +
                        error.message + ')');
                  });
        })
        .then<void>((sessionId: string) => {
          logger.info('Shutting down dummy chrome instance for ' + avdName);
          return request('DELETE', appiumPort, '/wd/hub/session/' + sessionId)
              .then<void>(() => {}, (error: {code: string|number, message: string}) => {
                return Promise.reject(
                    'Could not close chrome on ' + avdName + ' (' + error.code + ': ' +
                    error.message + ')');
              });
        });
  }
  let pending = [waitFor(
      () => {
        return request('GET', seleniumPort, '/wd/hub/status', maxWait);
      },
      (status) => {
        return JSON.parse(status).status == 0;
      },
      'selenium server')];
  if (appiumPort) {
    pending.push(waitFor(
        () => {
          return request('GET', appiumPort, '/wd/hub/status', maxWait);
        },
        (status) => {
          return JSON.parse(status).status == 0;
        },
        'appium server'));
  }
  if (androidSDK && avdPort) {
    for (let i = 0; i < avdNames.length; i++) {
      pending.push(waitForAndroid(avdPort + 2 * i, avdNames[i], appiumPort));
    }
  }
  Promise.all(pending).then(
      () => {
        logger.info('Everything started');
        sendStartedSignal(signal, viaIPC);
      },
      (error) => {
        logger.error(error);
        shutdownEverything(seleniumPort);
        process.exitCode = 1;
      });
}

function sendStartedSignal(signal: string, viaIPC: boolean) {
  if (viaIPC) {
    if (process.send) {
      return process.send(signal);
    } else {
      logger.warn('No IPC channel, sending signal via stdout');
    }
  }
  console.log(signal);
}

function shutdownEverything(seleniumPort?: string) {
  if (seleniumPort) {
    http.get(
        'http://localhost:' + seleniumPort + '/selenium-server/driver/?cmd=shutDownSeleniumServer');
  }
  killAndroid();
  killAppium();
}

function detachedRun(options: Options) {
  var file = path.resolve(__dirname, '..', 'webdriver.js');
  var oldSignal = options[Opt.STARTED_SIGNIFIER].getString();
  var oldViaIPC = options[Opt.SIGNAL_VIA_IPC].getBoolean();
  options[Opt.DETACH].value = false;
  options[Opt.STARTED_SIGNIFIER].value = 'server started';
  options[Opt.SIGNAL_VIA_IPC].value = true;
  let args: string[] = [file, commandName].concat(unparseOptions(options));

  var unreffed = false;
  let child = spawn(process.execPath, args, ['ignore', 1, 2, 'ipc']);

  child.on('message', (message: string) => {
    if (message == options[Opt.STARTED_SIGNIFIER].getString()) {
      if (oldSignal) {
        sendStartedSignal(oldSignal, oldViaIPC);
      }
      logger.info('Detached pid: ' + child.pid);
      child.disconnect();
      child.unref();
      unreffed = true;
    }
  });

  child.on('exit', (code: number) => {
    if (!unreffed) {
      if (code == 0) {
        logger.warn('Server never seemed to start, and has now exited');
      } else {
        logger.error('Server never seemed to start, and has probably crashed');
      }
      process.exit(code);
    }
  });
}
