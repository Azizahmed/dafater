import { notify } from '@affine/component';
import { I18n } from '@affine/i18n';
import type { Container } from '@blocksuite/affine/global/di';
import {
  FileSizeLimitProvider,
  type IFileSizeLimitService,
} from '@blocksuite/affine/shared/services';
import { Extension } from '@blocksuite/affine/store';
import type { FrameworkProvider } from '@toeverything/infra';

export function patchFileSizeLimitExtension(_framework: FrameworkProvider) {
  class AffineFileSizeLimitService
    extends Extension
    implements IFileSizeLimitService
  {
    // 2GB
    maxFileSize = 2 * 1024 * 1024 * 1024;

    // Dafater has no plans to upgrade to: just tell the user the file is too
    // large (upstream opened the pricing plans here).
    onOverFileSize() {
      notify.error({
        title: I18n['com.affine.dafater.file-too-large.title'](),
        message: I18n['com.affine.dafater.file-too-large.message'](),
      });
    }

    static override setup(di: Container) {
      di.override(FileSizeLimitProvider, AffineFileSizeLimitService);
    }
  }

  return AffineFileSizeLimitService;
}
