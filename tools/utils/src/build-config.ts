import type { Package } from '@affine-tools/utils/workspace';

import { PackageToDistribution } from './distribution';

export interface BuildFlags {
  channel: 'stable' | 'beta' | 'internal' | 'canary';
  mode: 'development' | 'production';
}

export function getBuildConfig(
  pkg: Package,
  buildFlags: BuildFlags
): BUILD_CONFIG_TYPE {
  const distribution = PackageToDistribution.get(pkg.name);

  if (!distribution) {
    throw new Error(`Distribution for ${pkg.name} is not found`);
  }

  const buildPreset: Record<BuildFlags['channel'], BUILD_CONFIG_TYPE> = {
    get stable() {
      return {
        debug: buildFlags.mode === 'development',
        distribution,
        isDesktopEdition: (
          ['web', 'desktop', 'admin'] as BUILD_CONFIG_TYPE['distribution'][]
        ).includes(distribution),
        isMobileEdition: (
          ['mobile', 'ios', 'android'] as BUILD_CONFIG_TYPE['distribution'][]
        ).includes(distribution),
        isElectron: distribution === 'desktop',
        isWeb: distribution === 'web',
        isMobileWeb: distribution === 'mobile',
        isIOS: distribution === 'ios',
        isAndroid: distribution === 'android',
        isNative:
          distribution === 'desktop' ||
          distribution === 'ios' ||
          distribution === 'android',
        isAdmin: distribution === 'admin',

        appBuildType: 'stable' as const,
        // Dafater is Arabic-first: fresh installs start in Arabic (RTL).
        defaultLanguage: 'ar',
        appVersion: pkg.version,
        // editorVersion: pkg.dependencies['@blocksuite/affine'],
        editorVersion: pkg.version,
        // Dafater does not link to AFFiNE's website, GitHub or community:
        // these upstream URLs are intentionally empty.
        githubUrl: '',
        changelogUrl: '',
        downloadUrl: '',
        pricingUrl: '',
        discordUrl: '',
        requestLicenseUrl: '',
        imageProxyUrl: '/api/worker/image-proxy',
        linkPreviewUrl: '/api/worker/link-preview',
        // Dafater sends no telemetry / crash reports anywhere.
        SENTRY_DSN: '',
        // Built-in Dafater server of native builds (electron / ios / android).
        // Web builds always use the server that serves them (location.origin).
        // Empty = no built-in server (local-only + "add server" flow).
        dafaterServerUrl:
          process.env.DAFATER_SERVER_URL ??
          (buildFlags.mode === 'development' ? 'http://localhost:8080' : ''),
        // Dafater has no release feed: the desktop auto-updater (which pointed
        // at AFFiNE's GitHub releases) and its UI are disabled.
        enableUpdater: false,
      };
    },
    get beta() {
      return {
        ...this.stable,
        appBuildType: 'beta' as const,
      };
    },
    get internal() {
      return {
        ...this.stable,
        appBuildType: 'internal' as const,
      };
    },
    // canary will be aggressive and enable all features
    get canary() {
      return {
        ...this.stable,
        appBuildType: 'canary' as const,
      };
    },
  };

  const currentBuild = buildFlags.channel;

  if (!(currentBuild in buildPreset)) {
    throw new Error(`BUILD_TYPE ${currentBuild} is not supported`);
  }

  const currentBuildPreset = buildPreset[currentBuild];

  const environmentPreset = {
    changelogUrl: process.env.CHANGELOG_URL ?? currentBuildPreset.changelogUrl,
  };

  return {
    ...currentBuildPreset,
    // environment preset will overwrite current build preset
    // this environment variable is for debug proposes only
    // do not put them into CI
    ...(process.env.CI ? {} : environmentPreset),
  };
}
