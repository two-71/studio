// Server-side watermarking. Renders the generated image plus two independent
// overlays — a "MADE WITH <brand>" badge and a diagonal tiled brand mark —
// as a single SVG through resvg. resvg's binding is statically linked, so
// unlike sharp/libvips there is no shared-library chain to break on Vercel.
// Fonts are bundled because the serverless runtime ships no system fonts.

import { readFileSync } from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";

const CONFIG = {
  badgeCorner: "bottom-right" as "bottom-left" | "bottom-right",
};

// Watermarks default ON; set the env var to "false" or "0" to disable.
function envFlag(name: string): boolean {
  const value = process.env[name];
  return !(value === "false" || value === "0");
}

// WATERMARK_BADGE also accepts "subtle" — a liquid-glass variant discreet
// enough for social posts where the full-strength badge reads as an ad.
type BadgeVariant = "normal" | "subtle";

function badgeVariant(): BadgeVariant | null {
  if (!envFlag("WATERMARK_BADGE")) {
    return null;
  }
  return process.env.WATERMARK_BADGE === "subtle" ? "subtle" : "normal";
}

// Glass-variant tuning: backdrop blur radius, gloss gradient opacities,
// hairline highlight, and ghosted logo strength.
const GLASS = {
  blur: 9,
  tintTop: 0.5,
  tintBottom: 0.16,
  strokeOpacity: 0.35,
  strokeWidth: 0.7,
  logoOpacity: 0.3,
};

// All layout values are in px at a 1024px reference edge and multiplied by
// `scale` so watermarks keep the same visual weight at any resolution.
const REFERENCE_EDGE = 1024;
const BADGE = {
  logoSize: 44,
  padding: 14,
  gap: 12,
  smallFont: 13,
  bigFont: 24,
  lineGap: 6,
  margin: 20,
};
const DIAGONAL = {
  font: 34,
  tracking: 4,
  angleDeg: -30,
  rowStep: 170,
  colGap: 130,
};
// Approximate advance width per glyph as a fraction of font size (Geist,
// uppercase). Used to size the badge plate around variable-length brand text.
const GLYPH_WIDTH_RATIO = 0.68;
// Uppercase cap height as a fraction of font size; positions baselines and
// centers the logo on the visual text block.
const CAP_HEIGHT_RATIO = 0.72;

const fontsDir = path.join(process.cwd(), "assets", "fonts");
const fontFiles = [
  path.join(fontsDir, "Geist-SemiBold.ttf"),
  path.join(fontsDir, "Geist-Bold.ttf"),
];
let logoDataUri: string | null = null;

function loadLogoDataUri(): string {
  logoDataUri ??= `data:image/png;base64,${readFileSync(
    path.join(process.cwd(), "public", "logo.png")
  ).toString("base64")}`;
  return logoDataUri;
}

function brandText(): string {
  return process.env.WATERMARK_TEXT ?? "STUDIO";
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function textWidth(text: string, fontSize: number, tracking: number): number {
  return (
    text.length * fontSize * GLYPH_WIDTH_RATIO +
    Math.max(0, text.length - 1) * tracking
  );
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const PNG_IHDR_WIDTH_OFFSET = 16;
const PNG_IHDR_HEIGHT_OFFSET = 20;

// Width/height live at fixed offsets in the IHDR chunk, which the spec
// requires to be the first chunk after the 8-byte signature.
function pngDimensions(png: Buffer): { width: number; height: number } {
  if (
    png.length < PNG_IHDR_HEIGHT_OFFSET + 4 ||
    !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    throw new Error("watermark: input is not a PNG");
  }
  return {
    width: png.readUInt32BE(PNG_IHDR_WIDTH_OFFSET),
    height: png.readUInt32BE(PNG_IHDR_HEIGHT_OFFSET),
  };
}

interface Fragment {
  defs: string;
  body: string;
}

// "MADE WITH" over the brand name, flame logo beside the text. The small
// line's letter-spacing is stretched so both lines span the same width.
// Coordinates are absolute so the glass variant's mask and backdrop line up
// with the base image without a wrapping transform.
function badgeFragment(
  scale: number,
  variant: BadgeVariant,
  canvas: { width: number; height: number }
): Fragment {
  const s = (v: number) => v * scale;
  const text = escapeXml(brandText());
  const smallLine = "MADE WITH";
  const smallFont = s(BADGE.smallFont);
  const bigFont = s(BADGE.bigFont);
  const textW = textWidth(text, bigFont, 0);
  const tracking =
    (textW - textWidth(smallLine, smallFont, 0)) / (smallLine.length - 1);
  const logo = s(BADGE.logoSize);
  const pad = s(BADGE.padding);
  const gap = s(BADGE.gap);
  const width = pad + logo + gap + textW + pad;
  const height =
    2 * pad + Math.max(logo, smallFont + s(BADGE.lineGap) + bigFont);
  const margin = Math.round(BADGE.margin * scale);
  const left =
    CONFIG.badgeCorner === "bottom-right"
      ? canvas.width - width - margin
      : margin;
  const top = canvas.height - height - margin;
  const logoX = left + pad;
  const textX = left + pad + logo + gap;
  const line1Y = top + height / 2 - s(BADGE.lineGap) / 2 - 2;
  const line2Y =
    top + height / 2 + s(BADGE.lineGap) / 2 + bigFont * CAP_HEIGHT_RATIO;
  // Center the logo on the rendered text block, not the badge box — the text
  // block sits slightly below center, so a box-centered logo looks too high.
  const textTop = line1Y - smallFont * CAP_HEIGHT_RATIO;
  const logoY = (textTop + line2Y) / 2 - logo / 2;

  const textPair = (small: string, big: string) =>
    `<text x="${textX}" y="${line1Y}" font-family="Geist" font-weight="600" font-size="${smallFont}" letter-spacing="${tracking}" ${small}>${smallLine}</text>
  <text x="${textX}" y="${line2Y}" font-family="Geist" font-weight="700" font-size="${bigFont}" ${big}>${text}</text>`;
  const logoTag = (attrs: string) =>
    `<image href="${loadLogoDataUri()}" x="${logoX}" y="${logoY}" width="${logo}" height="${logo}" ${attrs}/>`;

  if (variant === "subtle") {
    // Liquid glass: the glyphs and logo act as a frosted lens. A mask shaped
    // like the text and logo reveals a blurred copy of the base image (via
    // <use> so the PNG is only embedded once), then a white gloss gradient,
    // a ghosted logo, and a hairline stroke sit on top for definition.
    const white = 'fill="white"';
    const gloss = 'fill="url(#glass-tint)"';
    const stroke = `fill="none" stroke="white" stroke-opacity="${GLASS.strokeOpacity}" stroke-width="${s(GLASS.strokeWidth)}"`;
    const defs = `<filter id="glass-whiten"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0"/></filter>
    <filter id="glass-blur"><feGaussianBlur stdDeviation="${s(GLASS.blur)}"/></filter>
    <mask id="glass-shape">${textPair(white, white)}${logoTag('filter="url(#glass-whiten)"')}</mask>
    <linearGradient id="glass-tint" x1="0" y1="${textTop}" x2="0" y2="${line2Y}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="white" stop-opacity="${GLASS.tintTop}"/>
      <stop offset="1" stop-color="white" stop-opacity="${GLASS.tintBottom}"/>
    </linearGradient>`;
    const body = `<g mask="url(#glass-shape)"><use href="#base" filter="url(#glass-blur)"/></g>
  ${textPair(gloss, gloss)}
  ${logoTag(`filter="url(#glass-whiten)" opacity="${GLASS.logoOpacity}"`)}
  ${textPair(stroke, stroke)}`;
    return { defs, body };
  }

  const body = `${logoTag("")}
  ${textPair('fill="white" fill-opacity="0.85"', 'fill="white"')}`;
  return { defs: "", body };
}

// Brand name tiled at an angle across the whole image, low-opacity white with
// a top-lit gradient for a glossy embossed look.
function diagonalFragment(
  width: number,
  height: number,
  scale: number
): Fragment {
  const text = escapeXml(brandText());
  const font = DIAGONAL.font * scale;
  const tracking = DIAGONAL.tracking * scale;
  const stepX =
    textWidth(brandText(), font, tracking) + DIAGONAL.colGap * scale;
  const stepY = DIAGONAL.rowStep * scale;
  // Rotated tiling must overshoot the canvas so corners stay covered.
  const reach = Math.ceil(Math.hypot(width, height));
  const rows: string[] = [];
  for (let y = -reach, row = 0; y <= reach; y += stepY, row++) {
    // Offset alternate rows for a brick-like layout.
    const startX = -reach - (row % 2) * (stepX / 2);
    for (let x = startX; x <= reach; x += stepX) {
      rows.push(
        `<text x="${x}" y="${y}" font-family="Geist" font-weight="700" font-size="${font}" letter-spacing="${tracking}" fill="url(#gloss)">${text}</text>`
      );
    }
  }

  const defs = `<linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="white" stop-opacity="0.22"/>
      <stop offset="1" stop-color="white" stop-opacity="0.09"/>
    </linearGradient>`;
  const body = `<g transform="rotate(${DIAGONAL.angleDeg} ${width / 2} ${height / 2})">${rows.join("")}</g>`;
  return { defs, body };
}

// Returns a new PNG buffer with the enabled watermarks composited on. Throws
// on non-PNG input; callers decide whether to fall back to the clean image.
export function applyWatermarks(png: Buffer): Promise<Buffer> {
  const { width, height } = pngDimensions(png);
  const scale = Math.max(width, height) / REFERENCE_EDGE;

  const defs: string[] = [];
  const body: string[] = [];
  if (envFlag("WATERMARK_DIAGONAL")) {
    const diagonal = diagonalFragment(width, height, scale);
    defs.push(diagonal.defs);
    body.push(diagonal.body);
  }
  const variant = badgeVariant();
  if (variant) {
    const badge = badgeFragment(scale, variant, { width, height });
    defs.push(badge.defs);
    body.push(badge.body);
  }
  if (body.length === 0) {
    return Promise.resolve(png);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>${defs.join("")}</defs>
  <image id="base" href="data:image/png;base64,${png.toString("base64")}" x="0" y="0" width="${width}" height="${height}"/>
  ${body.join("\n  ")}
</svg>`;
  const rendered = new Resvg(svg, {
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: "Geist" },
  }).render();
  return Promise.resolve(Buffer.from(rendered.asPng()));
}
