declare interface BUILD_CONFIG_TYPE {
  debug: boolean;
  distribution: 'web' | 'desktop' | 'admin' | 'mobile' | 'ios' | 'android';
  /**
   * 'web' | 'desktop' | 'admin'
   */
  isDesktopEdition: boolean;
  /**
   * 'mobile'
   */
  isMobileEdition: boolean;

  isElectron: boolean;
  isWeb: boolean;
  /**
   * 'desktop' | 'ios' | 'android'
   */
  isNative: boolean;
  isMobileWeb: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isAdmin: boolean;

  /** UI language of fresh installs (a key of `SUPPORTED_LANGUAGES`). */
  defaultLanguage: string;

  appVersion: string;
  editorVersion: string;
  appBuildType: 'stable' | 'beta' | 'internal' | 'canary';

  githubUrl: string;
  changelogUrl: string;
  pricingUrl: string;
  downloadUrl: string;
  discordUrl: string;
  requestLicenseUrl: string;
  // see: tools/workers
  imageProxyUrl: string;
  linkPreviewUrl: string;

  SENTRY_DSN: string;

  /**
   * Dafater: URL of the built-in Dafater server for native builds
   * (env `DAFATER_SERVER_URL`; '' = no built-in server). Web builds use
   * `location.origin`.
   */
  dafaterServerUrl: string;
  /** Dafater: whether the desktop auto-updater and its UI are enabled. */
  enableUpdater: boolean;
}

declare var BUILD_CONFIG: BUILD_CONFIG_TYPE;
