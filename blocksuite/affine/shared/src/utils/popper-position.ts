import clamp from 'lodash-es/clamp';

const EDGE_GAP = 20;

type CollisionBox = {
  /**
   * The point that the objRect is positioned to.
   */
  positioningPoint: { x: number; y: number };
  /**
   * The boundary rect of the obj that is being positioned.
   */
  objRect?: { height: number; width: number };
  /**
   * The boundary rect of the container that the obj is in.
   */
  boundaryRect?: DOMRect;
  offsetX?: number;
  offsetY?: number;
  edgeGap?: number;
};

function calcSafeCoordinate({
  positioningPoint,
  objRect = { width: 0, height: 0 },
  boundaryRect = document.body.getBoundingClientRect(),
  offsetX = 0,
  offsetY = 0,
  edgeGap = EDGE_GAP,
}: CollisionBox) {
  const safeX = clamp(
    positioningPoint.x + offsetX,
    edgeGap,
    boundaryRect.width - objRect.width - edgeGap
  );
  const y = positioningPoint.y + offsetY;
  // Not use clamp for y coordinate to avoid the quick bar always showing after scrolling
  // const safeY = clamp(
  //   positioningPoint.y + offsetY,
  //   edgeGap,
  //   boundaryRect.height - objRect.height - edgeGap
  // );
  return {
    x: safeX,
    y,
  };
}

/**
 * Used to compare the space available
 * at the top and bottom of an element within a container.
 *
 * Please give preference to {@link getPopperPosition}
 */
function compareTopAndBottomSpace(
  obj: { getBoundingClientRect: () => DOMRect },
  container = document.body,
  gap = 20
) {
  const objRect = obj.getBoundingClientRect();
  const spaceRect = container.getBoundingClientRect();
  const topSpace = objRect.top - spaceRect.top;
  const bottomSpace = spaceRect.bottom - objRect.bottom;
  const topOrBottom: 'top' | 'bottom' =
    topSpace > bottomSpace ? 'top' : 'bottom';
  return {
    placement: topOrBottom,
    // the height is the available space.
    height: (topOrBottom === 'top' ? topSpace : bottomSpace) - gap,
  };
}

/**
 * Get the position of the popper element with flip.
 * return null if the reference rect is all zero.
 */
export function getPopperPosition(
  popper: {
    getBoundingClientRect: () => DOMRect;
  },
  reference: {
    getBoundingClientRect: () => DOMRect;
  },
  { gap = 12, offsetY = 5 }: { gap?: number; offsetY?: number } = {}
) {
  if (!popper) {
    // foolproof, someone may use element with non-null assertion
    console.warn(
      'The popper element is not exist. Popper position maybe incorrect'
    );
  }
  const { placement, height } = compareTopAndBottomSpace(
    reference,
    document.body,
    gap + offsetY
  );

  const referenceRect = reference.getBoundingClientRect();
  if (
    referenceRect.x === 0 &&
    referenceRect.y === 0 &&
    referenceRect.width === 0 &&
    referenceRect.height === 0
  )
    return null;

  const positioningPoint = {
    x: referenceRect.x,
    y: referenceRect.y + (placement === 'bottom' ? referenceRect.height : 0),
  };

  // TODO maybe use the editor container as the boundary rect to avoid the format bar being covered by other elements
  const boundaryRect = document.body.getBoundingClientRect();
  // Note: the popperRect.height maybe incorrect
  // because we are calculated its correct height
  const popperRect = popper?.getBoundingClientRect();

  // In RTL the popper's right edge is aligned with the reference instead.
  const rtl =
    getComputedStyle(
      popper instanceof Element ? popper : document.documentElement
    ).direction === 'rtl';
  const popperWidth = popperRect?.width ?? 0;
  if (rtl && popperWidth) {
    positioningPoint.x = referenceRect.right - popperWidth;
  }

  const safeCoordinate = calcSafeCoordinate({
    positioningPoint,
    objRect: popperRect,
    boundaryRect,
    offsetY: placement === 'bottom' ? offsetY : -offsetY,
  });

  // The width is unknown before the popper is rendered: let CSS subtract it.
  const x =
    rtl && !popperWidth
      ? `max(${EDGE_GAP}px, calc(${referenceRect.right}px - 100%))`
      : `${safeCoordinate.x}px`;

  return {
    placement,
    /**
     * The height is the available space height.
     *
     * Note: it's a max height, not the real height,
     * because sometimes the popper's height is smaller than the available space.
     */
    height,
    x,
    y:
      placement === 'bottom'
        ? `${safeCoordinate.y}px`
        : // We need to use `calc(-100%)` since the height of popper maybe incorrect
          `calc(${safeCoordinate.y}px - 100%)`,
  };
}
