import { I18nextProvider } from '@affine/i18n';
import { DirectionProvider } from '@radix-ui/react-direction';
import { useService } from '@toeverything/infra';
import { type PropsWithChildren, useSyncExternalStore } from 'react';

import { arabase } from '../arabase';
import { I18nService } from './services/i18n';

const getDirection = () => arabase.dir;

export function I18nProvider({ children }: PropsWithChildren) {
  const i18n = useService(I18nService).i18n;

  // Synchronous on purpose (not an effect): the language and direction must
  // be in place before the first commit, or the first frame paints in the
  // wrong language/direction. `init()` is idempotent.
  i18n.init();

  // Radix primitives (menus, scroll areas, dropdowns…) default to LTR unless
  // told otherwise: submenu placement, arrow-key navigation and scrollbars
  // follow this direction.
  const dir = useSyncExternalStore(arabase.subscribe, getDirection);

  return (
    <I18nextProvider i18n={i18n.i18next}>
      <DirectionProvider dir={dir}>{children}</DirectionProvider>
    </I18nextProvider>
  );
}
