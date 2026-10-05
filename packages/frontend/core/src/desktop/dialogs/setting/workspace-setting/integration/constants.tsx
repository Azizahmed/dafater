import { IntegrationTypeIcon } from '@affine/core/modules/integration';
import type { I18nString } from '@affine/i18n';
import { AiIcon, TodayIcon } from '@blocksuite/icons/rc';
import type { ReactNode } from 'react';

import { WorkspaceByokSetting } from '../byok';
import { CalendarSettingPanel } from './calendar/setting-panel';
import MCPIcon from './mcp-server/MCP.inline.svg';
import { McpServerSettingPanel } from './mcp-server/setting-panel';
import { ReadwiseSettingPanel } from './readwise/setting-panel';

type IntegrationCard = {
  id: string;
  name: I18nString;
  desc: I18nString;
  icon: ReactNode;
  cloud?: boolean;
  byok?: boolean;
  copilot?: boolean;
} & ({ setting: ReactNode } | { link: string });

const INTEGRATION_LIST = [
  {
    id: 'readwise' as const,
    name: 'com.affine.integration.readwise.name',
    desc: 'com.affine.integration.readwise.desc',
    icon: <IntegrationTypeIcon type="readwise" />,
    setting: <ReadwiseSettingPanel />,
  },
  {
    id: 'calendar' as const,
    name: 'com.affine.integration.calendar.name',
    desc: 'com.affine.integration.calendar.desc',
    icon: <TodayIcon />,
    setting: <CalendarSettingPanel />,
    cloud: true,
  },
  {
    id: 'mcp-server' as const,
    name: 'com.affine.integration.mcp-server.name',
    desc: 'com.affine.integration.mcp-server.desc',
    icon: <img src={MCPIcon} />,
    setting: <McpServerSettingPanel />,
    cloud: true,
    // Dafater: MCP clients bring their own model, so the card does not
    // depend on the server's AI configuration
  },
  // Dafater: no AFFiNE web-clipper card (it linked to AFFiNE's Chrome extension)
  {
    id: 'byok' as const,
    name: 'com.affine.settings.workspace.byok.title',
    desc: 'com.affine.settings.workspace.byok.subtitle',
    icon: <AiIcon />,
    setting: <WorkspaceByokSetting />,
    byok: true,
  },
] satisfies (IntegrationCard | false)[];

type IntegrationId = Exclude<
  Extract<(typeof INTEGRATION_LIST)[number], {}>,
  false
>['id'];

export type IntegrationItem = Exclude<IntegrationCard, 'id'> & {
  id: IntegrationId;
};

export function getAllowedIntegrationList(
  isCloudWorkspace: boolean,
  showByok: boolean,
  copilotEnabled: boolean
) {
  return INTEGRATION_LIST.filter(item => {
    if (!item) return false;
    if ('byok' in item && item.byok && !showByok) return false;
    if ('copilot' in item && item.copilot && !copilotEnabled) return false;
    const requiredCloud = 'cloud' in item && item.cloud;
    if (requiredCloud && !isCloudWorkspace) return false;
    return true;
  }) as IntegrationItem[];
}
