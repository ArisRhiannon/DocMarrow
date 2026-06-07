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
