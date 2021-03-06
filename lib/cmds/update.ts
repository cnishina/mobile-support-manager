import * as AdmZip from 'adm-zip';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as minimist from 'minimist';
import * as path from 'path';
import * as q from 'q';
import * as rimraf from 'rimraf';

import {AndroidSDK, Appium, Binary} from '../binaries';
import {Logger, Options, Program} from '../cli';
import {Config} from '../config';
import {FileManager} from '../files';
import {HttpUtils} from '../http_utils';
import {spawn} from '../utils';

import * as Opt from './';
import {android as initializeAndroid, iOS as checkIOS} from './initialize';
import {Opts} from './opts';

Config.runCommand = 'update';

let logger = new Logger('update');
let prog = new Program()
               .command('update', 'install or update selected binaries')
               .action(update)
               .addOption(Opts[Opt.OUT_DIR])
               .addOption(Opts[Opt.VERBOSE])
               .addOption(Opts[Opt.IGNORE_SSL])
               .addOption(Opts[Opt.PROXY])
               .addOption(Opts[Opt.ALTERNATE_CDN])
               .addOption(Opts[Opt.ANDROID])
               .addOption(Opts[Opt.ANDROID_API_LEVELS])
               .addOption(Opts[Opt.ANDROID_ARCHITECTURES])
               .addOption(Opts[Opt.ANDROID_PLATFORMS])
               .addOption(Opts[Opt.ANDROID_ACCEPT_LICENSES]);

if (Config.osType() === 'Darwin') {
  prog.addOption(Opts[Opt.IOS]);
}

prog.addOption(Opts[Opt.VERSIONS_APPIUM]).addOption(Opts[Opt.VERSIONS_ANDROID]);

export let program = prog;

// stand alone runner
let argv = minimist(process.argv.slice(2), prog.getMinimistOptions());
if (argv._[0] === 'update-run') {
  prog.run(JSON.parse(JSON.stringify(argv)));
} else if (argv._[0] === 'update-help') {
  prog.printHelp();
}

let browserFile: BrowserFile;

/**
 * Parses the options and downloads binaries if they do not exist.
 * @param options
 */
function update(options: Options): Promise<void> {
  let promises: any[] = [];
  let android: boolean = options[Opt.ANDROID].getBoolean();
  let ios: boolean = false;
  if (options[Opt.IOS]) {
    ios = options[Opt.IOS].getBoolean();
  }
  let outputDir = options[Opt.OUT_DIR].getString();

  try {
    browserFile =
        JSON.parse(fs.readFileSync(path.resolve(outputDir, 'update-config.json')).toString());
  } catch (err) {
    browserFile = {};
  }

  let android_api_levels: string[] = options[Opt.ANDROID_API_LEVELS].getString().split(',');
  let android_architectures: string[] = options[Opt.ANDROID_ARCHITECTURES].getString().split(',');
  let android_platforms: string[] = options[Opt.ANDROID_PLATFORMS].getString().split(',');
  let android_accept_licenses: boolean = options[Opt.ANDROID_ACCEPT_LICENSES].getBoolean();
  if (options[Opt.OUT_DIR].getString()) {
    if (path.isAbsolute(options[Opt.OUT_DIR].getString())) {
      outputDir = options[Opt.OUT_DIR].getString();
    } else {
      outputDir = path.resolve(Config.getBaseDir(), options[Opt.OUT_DIR].getString());
    }
    FileManager.makeOutputDirectory(outputDir);
  }
  let ignoreSSL = options[Opt.IGNORE_SSL].getBoolean();
  let proxy = options[Opt.PROXY].getString();
  HttpUtils.assignOptions({ignoreSSL, proxy});
  let verbose = options[Opt.VERBOSE].getBoolean();

  // setup versions for binaries
  let binaries = FileManager.setupBinaries(options[Opt.ALTERNATE_CDN].getString());
  binaries[AndroidSDK.id].versionCustom = options[Opt.VERSIONS_ANDROID].getString();
  binaries[Appium.id].versionCustom = options[Opt.VERSIONS_APPIUM].getString();

  if (android) {
    let binary = binaries[AndroidSDK.id];
    let sdk_path = path.resolve(outputDir, binary.executableFilename());
    let oldAVDList: string;

    updateBrowserFile(binary, outputDir);
    promises.push(q.nfcall(fs.readFile, path.resolve(sdk_path, 'available_avds.json'))
                      .then(
                          (oldAVDs: string) => {
                            oldAVDList = oldAVDs;
                          },
                          () => {
                            oldAVDList = '[]';
                          })
                      .then(() => {return updateBinary(binary, outputDir, proxy, ignoreSSL)})
                      .then<void>(() => {
                        initializeAndroid(
                            path.resolve(outputDir, binary.executableFilename()),
                            android_api_levels, android_architectures, android_platforms,
                            android_accept_licenses, binaries[AndroidSDK.id].versionCustom,
                            JSON.parse(oldAVDList), logger, verbose);
                      }));
  }
  if (ios) {
    checkIOS(logger);
  }
  if (android || ios) {
    installAppium(binaries[Appium.id], outputDir);
    updateBrowserFile(binaries[Appium.id], outputDir);
  }

  return Promise.all(promises).then(() => {
    writeBrowserFile(outputDir);
  });
}

function updateBinary<T extends Binary>(
    binary: T, outputDir: string, proxy: string, ignoreSSL: boolean): Promise<void> {
  return FileManager
      .downloadFile(
          binary, outputDir,
          (binary: Binary, outputDir: string, fileName: string) => {
            unzip(binary, outputDir, fileName);
          })
      .then<void>(downloaded => {
        if (!downloaded) {
          // The file did not have to download, we should unzip it.
          logger.info(binary.name + ': file exists ' + path.resolve(outputDir, binary.filename()));
          let fileName = binary.filename();
          unzip(binary, outputDir, fileName);
          logger.info(binary.name + ': ' + binary.executableFilename() + ' up to date');
        }
      });
}

function unzip<T extends Binary>(binary: T, outputDir: string, fileName: string): void {
  // remove the previously saved file and unzip it
  let osType = Config.osType();
  let mv = path.resolve(outputDir, binary.executableFilename());
  try {
    fs.unlinkSync(mv);
  } catch (err) {
    try {
      rimraf.sync(mv);
    } catch (err2) {
    }
  }

  // unzip the file
  logger.info(binary.name + ': unzipping ' + fileName);
  if (fileName.slice(-4) == '.zip') {
    let zip = new AdmZip(path.resolve(outputDir, fileName));
    zip.extractAllTo(outputDir, true);
  } else {
    // We will only ever get .tar files on linux
    child_process.spawnSync('tar', ['zxvf', path.resolve(outputDir, fileName), '-C', outputDir]);
  }

  // rename
  fs.renameSync(path.resolve(outputDir, binary.zipContentName()), mv);

  // set permissions
  if (osType !== 'Windows_NT') {
    logger.info(binary.name + ': setting permissions to 0755 for ' + mv);
    if (binary.id() !== AndroidSDK.id) {
      fs.chmodSync(mv, '0755');
    } else {
      fs.chmodSync(path.resolve(mv, 'tools', 'android'), '0755');
      fs.chmodSync(path.resolve(mv, 'tools', 'emulator'), '0755');
      // TODO(sjelin): get 64 bit versions working
    }
  }
}

function installAppium(binary: Binary, outputDir: string): void {
  logger.info('appium: installing appium');

  let folder = path.resolve(outputDir, binary.filename());
  try {
    rimraf.sync(folder);
  } catch (err) {
  }

  fs.mkdirSync(folder);
  fs.writeFileSync(
      path.resolve(folder, 'package.json'), JSON.stringify({scripts: {appium: 'appium'}}));
  spawn('npm', ['install', 'appium@' + binary.version()], null, {cwd: folder});
}

interface BinaryPath {
  last?: string, all?: string[]
}

interface BrowserFile {
  chrome?: BinaryPath, standalone?: BinaryPath, gecko?: BinaryPath, iedriver?: BinaryPath
}

function updateBrowserFile<T extends Binary>(binary: T, outputDir: string) {
  let currentDownload = path.resolve(outputDir, binary.executableFilename());

  // if browserFile[id] exists, we should update it
  if ((browserFile as any)[binary.id()]) {
    let binaryPath: BinaryPath = (browserFile as any)[binary.id()];
    if (binaryPath.last === currentDownload) {
      return;
    } else {
      binaryPath.last = currentDownload;
      for (let bin of binaryPath.all) {
        if (bin === currentDownload) {
          return;
        }
      }
      binaryPath.all.push(currentDownload);
    }
  } else {
    // The browserFile[id] does not exist / has not been downloaded previously.
    // We should create the entry.
    let binaryPath: BinaryPath = {last: currentDownload, all: [currentDownload]};
    (browserFile as any)[binary.id()] = binaryPath;
  }
}

function writeBrowserFile(outputDir: string) {
  let filePath = path.resolve(outputDir, 'update-config.json');
  fs.writeFileSync(filePath, JSON.stringify(browserFile));
}

// for testing
export function clearBrowserFile() {
  browserFile = {};
}
