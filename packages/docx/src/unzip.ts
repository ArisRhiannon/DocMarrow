import { strFromU8, unzipSync } from "fflate";

/** The XML parts of a DOCX container that the backend reads. */
export interface DocxParts {
  /** `word/document.xml` — the main body. Always present in a valid DOCX. */
  document: string;
  /** `word/styles.xml` — style definitions (heading/quote/code mapping). */
  styles?: string;
  /** `word/numbering.xml` — list numbering definitions (ordered vs bullet). */
  numbering?: string;
  /** `docProps/core.xml` — core properties (title, author, …). */
  core?: string;
}

/**
 * Extract the relevant XML parts from DOCX (OOXML) bytes.
 *
 * Only `.xml`/`.rels` entries are decompressed (images and other binaries are
 * skipped), so this stays cheap even on media-heavy documents. Throws when the
 * bytes are not a valid DOCX (no `word/document.xml`).
 */
export function readDocxParts(bytes: Uint8Array): DocxParts {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => /\.(xml|rels)$/i.test(f.name) });
  } catch (err) {
    throw new Error(
      `Not a valid DOCX (failed to read the OOXML zip container): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const get = (name: string): string | undefined => {
    const data = files[name];
    return data ? strFromU8(data) : undefined;
  };

  const document = get("word/document.xml");
  if (document === undefined) {
    throw new Error("Not a valid DOCX: the archive has no word/document.xml part.");
  }

  return {
    document,
    ...(get("word/styles.xml") !== undefined ? { styles: get("word/styles.xml") } : {}),
    ...(get("word/numbering.xml") !== undefined
      ? { numbering: get("word/numbering.xml") }
      : {}),
    ...(get("docProps/core.xml") !== undefined ? { core: get("docProps/core.xml") } : {}),
  };
}
