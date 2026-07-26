"use client";

import { useStudioConfig } from "../studio-config-provider";

/**
 * Decorative corner that joins the thin top bar to the taller right-hand
 * controls zone. The fill paints the sidebar (chrome) colour over the
 * top-right of the content panel; the stroke draws the delimiter border
 * along the S-curve and the bottom edge under the controls. Shown on lg+
 * only — below that the header is a plain full-width bar.
 *
 * The box is `width`×60 (config.notchWidth, default 290): the curve occupies
 * the left ~54px, the flat controls zone the rest. Paths draw the flat edges
 * out to x=1000 and rely on the viewBox to clip, so any practical width works
 * without recomputing the geometry. The drop is a straight diagonal between
 * two rounded corners: the diagonal runs along the line (14,12)→(40,60); each
 * corner is a quadratic whose control point sits at the tangent intersection,
 * so the horizontal edges blend into the diagonal without kinks.
 */
const FILL_PATH =
  "M0 12 L2 12 Q14 12 20.5 24 L33.5 48 Q40 60 52 60 L1000 60 L1000 0 L0 0 Z";
const STROKE_PATH =
  "M0 12.5 L2 12.5 Q14 12.5 20.5 24 L33.5 47.5 Q40 59 52 59 L1000 59";

const DEFAULT_WIDTH = 290;

export function StudioNotch() {
  const config = useStudioConfig();
  const width = config.notchWidth ?? DEFAULT_WIDTH;

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute top-0 right-0 z-10 hidden h-[60px] lg:block"
      fill="none"
      height={60}
      viewBox={`0 0 ${width} 60`}
      width={width}
    >
      <path className="fill-sidebar" d={FILL_PATH} />
      <path
        className="fill-none stroke-border"
        d={STROKE_PATH}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
