import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { useLiveData, useService } from '@toeverything/infra';

/**
 * Whether the minimal (single top bar) doc interface is turned on.
 */
export const useEnableMinimalInterface = () => {
  const featureFlagService = useService(FeatureFlagService);
  const enabled = useLiveData(
    featureFlagService.flags.enable_minimal_interface.$
  );
  return !BUILD_CONFIG.isMobileEdition && !!enabled;
};

/**
 * Whether the active view is a doc rendered with the minimal interface,
 * in which case the app chrome (left sidebar, sidebar toggles) is hidden.
 */
export const useIsMinimalDocLayout = () => {
  const enabled = useEnableMinimalInterface();
  const globalContext = useService(GlobalContextService).globalContext;
  const isDoc = useLiveData(globalContext.isDoc.$);
  return enabled && !!isDoc;
};
