import * as fs from 'fs';
import * as path from 'path';

import {AndroidSDK, Appium, Binary, BinaryMap} from '../../lib/binaries';
import {Config} from '../../lib/config';
import {DownloadedBinary, FileManager} from '../../lib/files';


describe('file manager', () => {
  describe('setting up for windows', () => {
    let osType = 'Windows_NT';

    it('should find correct binaries', () => {
      expect(FileManager.checkOS_(osType, AndroidSDK)).toBe(true);
      expect(FileManager.checkOS_(osType, Appium)).toBe(true);
    });

    it('should return the binary array', () => {
      let binaries = FileManager.compileBinaries_(osType);
      expect(binaries[AndroidSDK.id].name).toBe((new AndroidSDK()).name);
      expect(binaries[Appium.id].name).toBe((new Appium()).name);
    });
  });

  describe('setting up for linux', () => {
    let osType = 'Linux';

    it('should find correct binaries', () => {
      expect(FileManager.checkOS_(osType, AndroidSDK)).toBe(true);
      expect(FileManager.checkOS_(osType, Appium)).toBe(true);
    });

    it('should return the binary array', () => {
      let binaries = FileManager.compileBinaries_(osType);
      expect(binaries[AndroidSDK.id].name).toBe((new AndroidSDK()).name);
      expect(binaries[Appium.id].name).toBe((new Appium()).name);
    });
  });

  describe('setting up for mac', () => {
    let osType = 'Darwin';

    it('should find correct binaries', () => {
      expect(FileManager.checkOS_(osType, AndroidSDK)).toBe(true);
      expect(FileManager.checkOS_(osType, Appium)).toBe(true);
    });

    it('should return the binary array', () => {
      let binaries = FileManager.compileBinaries_(osType);
      expect(binaries[AndroidSDK.id].name).toBe((new AndroidSDK()).name);
      expect(binaries[Appium.id].name).toBe((new Appium()).name);
    });
  });

  describe('downloaded version checks', () => {
    let existingFiles: string[];
    let android = new AndroidSDK();
    let appium = new Appium();
    let ostype: string;
    let arch: string;

    function setup(osType: string): void {
      ostype = osType;
      arch = 'x64';
      existingFiles = [];
      existingFiles.push(android.prefix() + '24.1.0' + android.suffix());
      existingFiles.push(android.prefix() + '24.1.0' + android.executableSuffix());
      existingFiles.push(android.prefix() + '24.1.1' + android.suffix());
      existingFiles.push(android.prefix() + '24.1.1' + android.executableSuffix());
      existingFiles.push(appium.prefix() + '1.6.0' + appium.suffix());
    }

    describe('versions for android', () => {
      it('should find the correct version for windows', () => {
        setup('Windows_NT');
        let downloaded = FileManager.downloadedVersions_(android, ostype, arch, existingFiles);
        expect(downloaded.versions.length).toBe(2);
        expect(downloaded.versions[0]).toBe('24.1.0');
        expect(downloaded.versions[1]).toBe('24.1.1');
      });
      it('should find the correct version for mac', () => {
        setup('Darwin');
        let downloaded = FileManager.downloadedVersions_(android, ostype, arch, existingFiles);
        expect(downloaded.versions.length).toBe(2);
        expect(downloaded.versions[0]).toBe('24.1.0');
        expect(downloaded.versions[1]).toBe('24.1.1');
      });
      it('should find the correct version for linux', () => {
        setup('Linux');
        let downloaded = FileManager.downloadedVersions_(android, ostype, arch, existingFiles);
        expect(downloaded.versions.length).toBe(2);
        expect(downloaded.versions[0]).toBe('24.1.0');
        expect(downloaded.versions[1]).toBe('24.1.1');
      });
    });

    describe('versions for appium', () => {
      it('should find the correct version for windows', () => {
        setup('Windows_NT');
        let downloaded = FileManager.downloadedVersions_(appium, ostype, arch, existingFiles);
        expect(downloaded.versions.length).toBe(1);
        expect(downloaded.versions[0]).toBe('1.6.0');
      });
      it('should find the correct version for mac', () => {
        setup('Darwin');
        let downloaded = FileManager.downloadedVersions_(appium, ostype, arch, existingFiles);
        expect(downloaded.versions.length).toBe(1);
        expect(downloaded.versions[0]).toBe('1.6.0');
      });
      it('should find the correct version for linux', () => {
        setup('Linux');
        let downloaded = FileManager.downloadedVersions_(appium, ostype, arch, existingFiles);
        expect(downloaded.versions.length).toBe(1);
        expect(downloaded.versions[0]).toBe('1.6.0');
      });
    });
  });

  describe('configuring the CDN location', () => {
    describe('when no custom CDN is specified', () => {
      let defaults = Config.cdnUrls();
      let binaries = FileManager.compileBinaries_('Windows_NT');

      it('should use the default configuration for Android SDK', () => {
        expect(binaries[AndroidSDK.id].cdn).toEqual(defaults[AndroidSDK.id]);
      });

      it('should use the default configuration for Appium', () => {
        expect(binaries[Appium.id].cdn).toEqual(defaults[Appium.id]);
      });
    });

    describe('when custom CDN is specified', () => {
      it('should configure the CDN for each binary', () => {
        let customCDN = 'https://my.corporate.cdn/';
        let binaries = FileManager.compileBinaries_('Windows_NT', customCDN);

        forEachOf(binaries, binary => expect(binary.cdn).toEqual(customCDN, binary.name));
      });
    });

    function forEachOf<T extends Binary>(binaries: BinaryMap<T>, fn: (binary: T) => void) {
      for (var key in binaries) {
        fn(binaries[key]);
      }
    }
  });

  // TODO(cnishina): download binaries for each os type / arch combination
});
