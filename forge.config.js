const { FusesPlugin } = require("@electron-forge/plugin-fuses");
const { FuseV1Options, FuseVersion } = require("@electron/fuses");
const path = require('path');
const os = require('os');

module.exports = {
  packagerConfig: {
    asar: true,
    platform: process.platform,
    arch: process.arch,
    icon: './src/assets/icon-1024-square.png',
    appBundleId: 'com.interviewlift.app',
    appCategoryType: 'public.app-category.productivity',
    protocols: [
      {
        name: 'InterviewLift Protocol',
        schemes: ['interviewlift']
      }
    ],
    osxSign: false,
    osxNotarize: false,
    extraResource: [
      {
        from: './src/swift/Recorder',
        to: 'Recorder',
        filter: ['**/*']
      },
      {
        from: './bin',
        to: 'bin',
        filter: ['**/*']
      },
      {
        from: './stt.json',
        to: 'stt.json'
      }
    ].filter(resource => {
      if (resource.from.includes('swift') && os.platform() !== 'darwin') {
        return false;
      }
      return true;
    }),
    ignore: [
      /^\/\.next/,
      /^\/node_modules\/\.cache/,
      /^\/scripts/,
      /^\/\.env/,
      /^\/\.git/,
      /^\/installers/,
      /^\/\.vscode/,
      /^\/\.idea/,
      /^\/test/,
      /\.md$/,
      /\.log$/,
    ]
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin", "win32", "linux"]
    },
    {
      name: "@electron-forge/maker-dmg",
      platforms: ["darwin"],
      config: {
        format: "ULFO",
        name: "Interview-Lift-Installer"
      }
    },
    {
      name: "@electron-forge/maker-squirrel",
      platforms: ["win32"],
      config: {
        name: "InterviewLift",
        setupExe: "Interview-Lift-Setup.exe",
        setupIcon: "./src/assets/icon-1024-square.png"
      }
    },
    {
      name: "@electron-forge/maker-deb",
      platforms: ["linux"],
      config: {
        options: {
          maintainer: "Interview Lift Team",
          homepage: "https://github.com/your-username/interview-lift"
        }
      }
    }
  ],
  plugins: [
    {
      name: "@electron-forge/plugin-auto-unpack-natives",
      config: {}
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    })
  ],
  hooks: {
    prePackage: async (forgeConfig, platform, arch) => {
      console.log(`📦 Pre-package hook: Ensuring FFmpeg is available for ${platform}-${arch}`);
      
      const FFmpegDownloader = require('./scripts/download-ffmpeg.js');
      const downloader = new FFmpegDownloader();
      
      try {
        const success = await downloader.downloadAndExtractFFmpeg();
        if (!success) {
          throw new Error('Failed to download FFmpeg');
        }
        
        const verified = await downloader.verifyFFmpeg();
        if (!verified) {
          throw new Error('FFmpeg verification failed');
        }
        
        console.log('✅ FFmpeg is ready for packaging');
      } catch (error) {
        console.error('❌ FFmpeg setup failed:', error.message);
        throw error;
      }
    }
  }
};
