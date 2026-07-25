// biome-ignore-all lint/suspicious/noBitwiseOperators: CRC-32 is bit arithmetic
// Embeds tracing metadata into a PNG as tEXt chunks (keyword + Latin-1 text),
// inserted right after IHDR. Written by hand because the PNG chunk format is
// ~30 lines and the available npm chunk libraries have been frozen since 2015.
// tEXt is plaintext — anyone inspecting the file can read it — so only opaque
// identifiers (e.g. a generation uuid) belong here.

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
// Every chunk is length(4) + type(4) + data + crc(4).
const CHUNK_LENGTH_BYTES = 4;
const CHUNK_TYPE_BYTES = 4;
const CHUNK_CRC_BYTES = 4;

const CRC_POLYNOMIAL = 0xed_b8_83_20;
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < table.length; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? CRC_POLYNOMIAL ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

// CRC-32 as specified by the PNG spec, computed over chunk type + data.
function crc32(data: Buffer): number {
  let crc = 0xff_ff_ff_ff;
  for (const byte of data) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

function textChunk(keyword: string, value: string): Buffer {
  const data = Buffer.concat([
    Buffer.from(keyword, "latin1"),
    Buffer.from([0]),
    Buffer.from(value, "latin1"),
  ]);
  const chunk = Buffer.alloc(
    CHUNK_LENGTH_BYTES + CHUNK_TYPE_BYTES + data.length + CHUNK_CRC_BYTES
  );
  chunk.writeUInt32BE(data.length, 0);
  chunk.write("tEXt", CHUNK_LENGTH_BYTES, "latin1");
  data.copy(chunk, CHUNK_LENGTH_BYTES + CHUNK_TYPE_BYTES);
  chunk.writeUInt32BE(
    crc32(chunk.subarray(CHUNK_LENGTH_BYTES, chunk.length - CHUNK_CRC_BYTES)),
    chunk.length - CHUNK_CRC_BYTES
  );
  return chunk;
}

// Returns a new PNG with one tEXt chunk per entry inserted after IHDR (the
// spec requires IHDR to be the first chunk, so this is always a valid spot).
// Throws on non-PNG input; callers decide whether to fall back.
export function embedPngText(
  png: Buffer,
  entries: Record<string, string>
): Buffer {
  if (!png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error("png-metadata: input is not a PNG");
  }
  const ihdrEnd =
    PNG_SIGNATURE.length +
    CHUNK_LENGTH_BYTES +
    CHUNK_TYPE_BYTES +
    png.readUInt32BE(PNG_SIGNATURE.length) +
    CHUNK_CRC_BYTES;
  const chunks = Object.entries(entries).map(([keyword, value]) =>
    textChunk(keyword, value)
  );
  return Buffer.concat([
    png.subarray(0, ihdrEnd),
    ...chunks,
    png.subarray(ihdrEnd),
  ]);
}
