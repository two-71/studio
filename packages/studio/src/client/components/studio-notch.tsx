/**
 * Decorative corner that joins the thin top bar to the taller right-hand
 * controls zone. The fill paints the sidebar (chrome) colour over the
 * top-right of the content panel; the stroke draws the delimiter border
 * along the S-curve and the bottom edge under the controls. Shown on lg+
 * only — below that the header is a plain full-width bar.
 *
 * Box is 330×60: the curve occupies the left ~54px, the flat controls zone
 * the rest. The drop is a straight diagonal between two rounded corners:
 * the diagonal runs along the line (14,12)→(40,60); each corner is a
 * quadratic whose control point sits at the tangent intersection, so the
 * horizontal edges blend into the diagonal without kinks.
 */
const FILL_PATH =
  "M0 12 L2 12 Q14 12 20.5 24 L33.5 48 Q40 60 52 60 L330 60 L330 0 L0 0 Z";
const STROKE_PATH =
  "M0 12.5 L2 12.5 Q14 12.5 20.5 24 L33.5 47.5 Q40 59 52 59 L330 59";

export function StudioNotch() {
  return (
    <svg
      aria-hidden="true"
      // className="pointer-events-none absolute top-0 right-0 z-10 hidden h-[60px] w-[330px] lg:block"
      className="pointer-events-none absolute top-0 right-0 z-10 hidden h-[60px] w-[290px] lg:block"
      fill="none"
      height={60}
      // viewBox="0 0 330 60"
      viewBox="0 0 290 60"
      // width={330}
      width={290}
    >
      <path className="fill-sidebar" d={FILL_PATH} />
      <path
        className="fill-none stroke-[#222]"
        d={STROKE_PATH}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
