import {
  RadioGroup,
  type RadioItem,
  useMobileMenuController,
} from '@affine/component';
import { EditorService } from '@affine/core/modules/editor';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import type { DocMode } from '@blocksuite/affine/model';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import * as styles from './mode-switch.css';

export const EditorModeSwitch = () => {
  const t = useI18n();
  const items = useMemo<RadioItem[]>(
    () => [
      {
        value: 'page',
        label: t['com.affine.pageMode.page'](),
        testId: 'switch-page-mode-button',
      },
      {
        value: 'edgeless',
        label: t['com.affine.pageMode.edgeless'](),
        testId: 'switch-edgeless-mode-button',
      },
    ],
    [t]
  );
  const { close } = useMobileMenuController();
  const editor = useService(EditorService).editor;
  const trash = useLiveData(editor.doc.trash$);
  const isSharedMode = editor.isSharedMode;
  const currentMode = useLiveData(editor.mode$);

  const onToggle = useCallback(
    (mode: DocMode) => {
      editor.setMode(mode);
      editor.setSelector(undefined);
      track.$.header.actions.switchPageMode({ mode });
      close();
    },
    [close, editor]
  );

  if (trash || isSharedMode) {
    return null;
  }

  return (
    <div className={styles.radioWrapper}>
      <RadioGroup
        itemHeight={28}
        width="100%"
        borderRadius={8}
        padding={2}
        gap={4}
        value={currentMode}
        items={items}
        onChange={onToggle}
      />
    </div>
  );
};
