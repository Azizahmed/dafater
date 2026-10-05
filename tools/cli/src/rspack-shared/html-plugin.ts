import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { Path, ProjectRoot } from '@affine-tools/utils/path';
import {
  createBootScript,
  htmlRootAttributes,
  htmlRootAttributesString,
} from '@arabase/core/boot';
import { Repository } from '@napi-rs/simple-git';
import { HtmlRspackPlugin, type HtmlRspackPluginOptions } from '@rspack/core';
import { once } from 'lodash-es';

type HtmlRspackPluginInstance = InstanceType<typeof HtmlRspackPlugin>;

type PluginLike = {
  apply: (compiler: CompilerLike) => void;
};

type CompilerLike = {
  webpack?: {
    sources?: {
      RawSource?: new (source: string) => unknown;
    };
  };
  hooks: {
    compilation: {
      tap: (name: string, callback: (compilation: any) => void) => void;
    };
  };
};

function createRawSource(compiler: CompilerLike, source: string) {
  const RawSource = compiler.webpack?.sources?.RawSource;
  if (!RawSource) {
    throw new Error(
      'compiler.webpack.sources.RawSource is required for html plugin assets emission'
    );
  }

  return new RawSource(source);
}

export const getPublicPath = (_buildConfig: BUILD_CONFIG_TYPE) => {
  if (typeof process.env.PUBLIC_PATH === 'string') {
    return process.env.PUBLIC_PATH;
  }

  // Dafater serves its assets from its own server (no AFFiNE CDN), for every
  // build and distribution.
  return '/';
};

/**
 * Product name / description used by `<title>`, the description meta and the
 * Open Graph / Twitter tags. The product default is Arabic; the admin panel is
 * English-only (see `getLocaleHtml`).
 */
const BRAND_TEXT = {
  ar: {
    title: 'دفاتر',
    socialTitle: 'دفاتر: مساحة عملك للمستندات واللوحات وقواعد البيانات',
    description:
      'دفاتر مساحة عمل عربية تجمع المستندات واللوحات البيضاء وقواعد البيانات في مكان واحد. خطّط ونظّم وأبدع في تطبيق واحد.',
  },
  en: {
    title: 'Dafater',
    socialTitle: 'Dafater: docs, whiteboards and databases in one workspace',
    description:
      'Dafater is a next-gen knowledge base that brings planning, sorting and creating all together.',
  },
};

const getBrandText = (BUILD_CONFIG: BUILD_CONFIG_TYPE) =>
  BUILD_CONFIG.isAdmin || !BUILD_CONFIG.defaultLanguage.startsWith('ar')
    ? BRAND_TEXT.en
    : BRAND_TEXT.ar;

const gitShortHash = once(() => {
  const { GITHUB_SHA } = process.env;
  if (GITHUB_SHA) {
    return GITHUB_SHA.substring(0, 9);
  }
  const repo = new Repository(ProjectRoot.value);
  const shortSha = repo.head().target()?.substring(0, 9);
  if (shortSha) {
    return shortSha;
  }
  const sha = execSync(`git rev-parse --short HEAD`, {
    encoding: 'utf-8',
  }).trim();
  return sha;
});

const currentDir = Path.dir(import.meta.url);

/**
 * `<html lang dir>` and the pre-paint locale script (see `@arabase/core/boot`):
 * the first frame renders in the product default (Arabic, RTL) or in the
 * language the user picked, never in a transient language/direction.
 * The admin panel is English-only.
 */
export function getLocaleHtml(BUILD_CONFIG: BUILD_CONFIG_TYPE): {
  lang: string;
  dir: string;
  htmlRootAttrs: string;
  bootScript: string;
} {
  const locale = BUILD_CONFIG.isAdmin ? 'en' : BUILD_CONFIG.defaultLanguage;
  return {
    ...htmlRootAttributes(locale),
    htmlRootAttrs: htmlRootAttributesString(locale),
    bootScript: BUILD_CONFIG.isAdmin
      ? ''
      : createBootScript({
          defaultLocale: locale,
          // The app's own language setting, for the first start after an
          // update from a version without the arabase hint: GlobalCache in
          // localStorage (web) or the desktop shared storage (preload).
          legacySources: [
            'JSON.parse(localStorage.getItem("global-cache:i18n_lng"))',
            'window.__sharedStorage.globalCache.get("i18n_lng")',
          ],
        }),
  };
}

export interface CreateHTMLPluginConfig {
  filename?: string;
  template?: string;
  copySharedPublicAssets?: boolean;
  additionalEntryForSelfhost?: boolean;
  selfhostPublicPath?: string;
  injectGlobalErrorHandler?: boolean;
  emitAssetsManifest?: boolean;
}

function getHTMLPluginOptions(BUILD_CONFIG: BUILD_CONFIG_TYPE) {
  const publicPath = getPublicPath(BUILD_CONFIG);
  const cdnOrigin = publicPath.startsWith('/')
    ? undefined
    : new URL(publicPath).origin;

  const { lang, dir, bootScript } = getLocaleHtml(BUILD_CONFIG);
  const brand = getBrandText(BUILD_CONFIG);
  const templateParams = {
    HTML_LANG: lang,
    HTML_DIR: dir,
    LOCALE_BOOT_SCRIPT: bootScript ? `<script>${bootScript}</script>` : '',
    GIT_SHORT_SHA: gitShortHash(),
    TITLE: brand.title,
    SOCIAL_TITLE: brand.socialTitle,
    DESCRIPTION: brand.description,
    PRECONNECT: cdnOrigin
      ? `<link rel="preconnect" href="${cdnOrigin}" />`
      : '',
    VIEWPORT_FIT: BUILD_CONFIG.isMobileEdition ? 'cover' : 'auto',
  };

  return {
    template: currentDir.join('template.html').toString(),
    inject: 'body',
    minify: false,
    templateParameters: templateParams,
    chunks: ['app'],
    scriptLoading: 'blocking',
  } satisfies HtmlRspackPluginOptions;
}

const createAssetsManifestPlugin = (BUILD_CONFIG: BUILD_CONFIG_TYPE) => ({
  apply(compiler: CompilerLike) {
    const { htmlRootAttrs, bootScript } = getLocaleHtml(BUILD_CONFIG);
    compiler.hooks.compilation.tap('assets-manifest-plugin', compilation => {
      HtmlRspackPlugin.getCompilationHooks(
        compilation
      ).beforeAssetTagGeneration.tap('assets-manifest-plugin', arg => {
        if (!compilation.getAsset('assets-manifest.json')) {
          compilation.emitAsset(
            `assets-manifest.json`,
            createRawSource(
              compiler,
              JSON.stringify(
                {
                  ...arg.assets,
                  js: arg.assets.js.map(file =>
                    file.substring(arg.assets.publicPath.length)
                  ),
                  css: arg.assets.css.map(file =>
                    file.substring(arg.assets.publicPath.length)
                  ),
                  gitHash: gitShortHash(),
                  title: getBrandText(BUILD_CONFIG).title,
                  description: getBrandText(BUILD_CONFIG).description,
                  // Consumed by the server-side renderer (doc-renderer).
                  htmlRootAttrs,
                  bootScript,
                },
                null,
                2
              )
            ),
            {
              immutable: false,
            }
          );
        }

        return arg;
      });
    });
  },
});

const GlobalErrorHandlerPlugin = {
  apply(compiler: CompilerLike) {
    const globalErrorHandler = [
      'js/global-error-handler.js',
      readFileSync(currentDir.join('./error-handler.js').toString(), 'utf-8'),
    ];

    compiler.hooks.compilation.tap(
      'global-error-handler-plugin',
      compilation => {
        HtmlRspackPlugin.getCompilationHooks(
          compilation
        ).beforeAssetTagGeneration.tap('global-error-handler-plugin', arg => {
          if (!compilation.getAsset(globalErrorHandler[0])) {
            compilation.emitAsset(
              globalErrorHandler[0],
              createRawSource(compiler, globalErrorHandler[1])
            );
            arg.assets.js.unshift(
              arg.assets.publicPath + globalErrorHandler[0]
            );
          }

          return arg;
        });
      }
    );
  },
};

const CorsPlugin = {
  apply(compiler: CompilerLike) {
    compiler.hooks.compilation.tap('html-js-cors-plugin', compilation => {
      HtmlRspackPlugin.getCompilationHooks(compilation).alterAssetTags.tap(
        'html-js-cors-plugin',
        options => {
          if (options.publicPath !== '/') {
            options.assetTags.scripts.forEach(script => {
              script.attributes.crossorigin = true;
            });
            options.assetTags.styles.forEach(style => {
              style.attributes.crossorigin = true;
            });
          }
          return options;
        }
      );
    });
  },
};

export function createHTMLPlugins(
  BUILD_CONFIG: BUILD_CONFIG_TYPE,
  config: CreateHTMLPluginConfig
): (HtmlRspackPluginInstance | PluginLike)[] {
  const publicPath = getPublicPath(BUILD_CONFIG);
  const htmlPluginOptions = {
    ...getHTMLPluginOptions(BUILD_CONFIG),
    ...(config.template ? { template: config.template } : {}),
  };
  const selfhostPublicPath = config.selfhostPublicPath ?? '/';

  const plugins: (HtmlRspackPluginInstance | PluginLike)[] = [];
  plugins.push(
    new HtmlRspackPlugin({
      ...htmlPluginOptions,
      chunks: ['index'],
      filename: config.filename,
      publicPath,
      meta: {
        'env:publicPath': publicPath,
      },
    })
  );

  if (BUILD_CONFIG.isElectron) {
    plugins.push(
      new HtmlRspackPlugin({
        ...htmlPluginOptions,
        chunks: ['shell'],
        filename: 'shell.html',
        publicPath,
        meta: {
          'env:publicPath': publicPath,
        },
      }),
      new HtmlRspackPlugin({
        ...htmlPluginOptions,
        filename: 'popup.html',
        chunks: ['popup'],
        publicPath,
        meta: {
          'env:publicPath': publicPath,
        },
      }),
      new HtmlRspackPlugin({
        ...htmlPluginOptions,
        filename: 'background-worker.html',
        chunks: ['backgroundWorker'],
        publicPath,
        meta: {
          'env:publicPath': publicPath,
        },
      })
    );
  }

  if (!BUILD_CONFIG.isElectron) {
    plugins.push(CorsPlugin);
  }

  if (config.emitAssetsManifest) {
    plugins.push(createAssetsManifestPlugin(BUILD_CONFIG));
  }

  if (config.injectGlobalErrorHandler) {
    plugins.push(GlobalErrorHandlerPlugin);
  }

  if (config.additionalEntryForSelfhost) {
    plugins.push(
      new HtmlRspackPlugin({
        ...htmlPluginOptions,
        chunks: ['index'],
        publicPath: selfhostPublicPath,
        meta: {
          'env:isSelfHosted': 'true',
          'env:publicPath': selfhostPublicPath,
        },
        filename: 'selfhost.html',
        templateParameters: {
          ...htmlPluginOptions.templateParameters,
          PRECONNECT: '',
        },
      })
    );
  }

  return plugins;
}
