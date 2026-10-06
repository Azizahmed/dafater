import { registerMeetingNotesEffects } from '@affine/core/blocksuite/ai/blocks/meeting-notes/meeting-notes-block';
import { registerAIEditorEffects } from '@affine/core/blocksuite/ai/effects/editor';
import { editorEffects } from '@affine/core/blocksuite/editors';

import { registerTemplates } from './register-templates';

editorEffects();
registerAIEditorEffects();
registerMeetingNotesEffects();
registerTemplates();

export * from './blocksuite-editor';
