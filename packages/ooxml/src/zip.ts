import { strFromU8, unzipSync } from "fflate";

/**
 * List every entry name in a zip archive without decompressing its contents
 * (the filter callback is used purely to observe names). Useful for sniffing an
 * OOXML container's type from the parts it contains.
 */
export function listEntries(bytes: Uint8Array): string[] {
  const names: string[] = [];
  unzipSync(bytes, {
    filter: (file) => {
      names.push(file.name);
      return false;
    },
  });
  return names;
}

/**
 * Decompress and UTF-8 decode the zip entries whose name matches `predicate`.
 * Non-matching entries (images, binaries) are skipped, keeping this cheap.
 */
export function readTextEntries(
  bytes: Uint8Array,
  predicate: (name: string) => boolean,
): Map<string, string> {
  const files = unzipSync(bytes, { filter: (file) => predicate(file.name) });
  const out = new Map<string, string>();
  for (const [name, data] of Object.entries(files)) out.set(name, strFromU8(data));
  return out;
}

/** Read all `.xml`/`.rels` parts of an OOXML container into a name→text map. */
export function readXmlParts(bytes: Uint8Array): Map<string, string> {
  return readTextEntries(bytes, (name) => /\.(xml|rels)$/i.test(name));
}

/**
 * Decompress the zip entries whose name matches `predicate` as raw bytes —
 * used to pull embedded media (`word/media/*`, `ppt/media/*`) out of an OOXML
 * container without decoding it.
 */
export function readBinaryEntries(
  bytes: Uint8Array,
  predicate: (name: string) => boolean,
): Map<string, Uint8Array> {
  const files = unzipSync(bytes, { filter: (file) => predicate(file.name) });
  const out = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(files)) out.set(name, data);
  return out;
}

/** Best-effort image MIME type from a file name / path extension. */
export function mimeFromExt(name: string): string | undefined {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    bmp: "image/bmp",
    tif: "image/tiff",
    tiff: "image/tiff",
    emf: "image/emf",
    wmf: "image/wmf",
  };
  return ext ? map[ext] : undefined;
}
