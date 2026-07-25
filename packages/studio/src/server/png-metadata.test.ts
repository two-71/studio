/// <reference types="bun" />
import { describe, expect, it } from "bun:test";
import { embedPngText } from "./png-metadata";

// Smallest valid PNG: 1x1 transparent pixel.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

const IHDR_END = 8 + 4 + 4 + 13 + 4;

function readChunks(png: Buffer): { type: string; data: Buffer }[] {
  const chunks: { type: string; data: Buffer }[] = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("latin1");
    chunks.push({
      type,
      data: png.subarray(offset + 8, offset + 8 + length),
    });
    offset += 4 + 4 + length + 4;
  }
  return chunks;
}

describe("embedPngText", () => {
  it("inserts a tEXt chunk after IHDR with keyword and value", () => {
    const out = embedPngText(TINY_PNG, { "studio:generation": "abc-123" });
    const chunks = readChunks(out);
    expect(chunks[0]?.type).toBe("IHDR");
    expect(chunks[1]?.type).toBe("tEXt");
    expect(chunks[1]?.data.toString("latin1")).toBe(
      "studio:generation\0abc-123"
    );
    expect(chunks.at(-1)?.type).toBe("IEND");
  });

  it("leaves the original bytes intact around the inserted chunk", () => {
    const out = embedPngText(TINY_PNG, { k: "v" });
    expect(
      out.subarray(0, IHDR_END).equals(TINY_PNG.subarray(0, IHDR_END))
    ).toBe(true);
    expect(
      out
        .subarray(out.length - (TINY_PNG.length - IHDR_END))
        .equals(TINY_PNG.subarray(IHDR_END))
    ).toBe(true);
  });

  it("writes a valid CRC (checked against a known-good value)", () => {
    const out = embedPngText(TINY_PNG, { a: "b" });
    // tEXt chunk: length=3, type "tEXt", data "a\0b", then CRC over type+data.
    const chunkStart = IHDR_END;
    const crc = out.readUInt32BE(chunkStart + 8 + 3);
    // CRC-32 of Buffer.from("tEXta\0b", "latin1") — precomputed with zlib.crc32.
    expect(crc).toBe(0xdc_49_a2_3b);
  });

  it("throws on non-PNG input", () => {
    expect(() => embedPngText(Buffer.from("not a png"), { k: "v" })).toThrow(
      "not a PNG"
    );
  });

  it("inserts one chunk per entry", () => {
    const out = embedPngText(TINY_PNG, { one: "1", two: "2" });
    const texts = readChunks(out).filter((c) => c.type === "tEXt");
    expect(texts.length).toBe(2);
  });
});
