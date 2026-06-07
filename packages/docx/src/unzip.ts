import { readBinaryEntries, readXmlParts } from "@docmarrow/ooxml";

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
  /** `word/_rels/document.xml.rels` — relationship ids → targets (e.g. media). */
  rels?: string;
  /** Embedded media (`word/media/*`) as raw bytes, keyed by full part name. */
  media: Map<string, Uint8Array>;
}

/**
 * Extract the relevant XML parts from DOCX (OOXML) bytes. Throws when the bytes
 * are not a valid DOCX (no `word/document.xml`).
 */
export function readDocxParts(bytes: Uint8Array): DocxParts {
  let files: Map<string, string>;
  try {
    files = readXmlParts(bytes);
  } catch (err) {
    throw new Error(
      `Not a valid DOCX (failed to read the OOXML zip container): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const document = files.get("word/document.xml");
  if (document === undefined) {
    throw new Error("Not a valid DOCX: the archive has no word/document.xml part.");
  }

  const styles = files.get("word/styles.xml");
  const numbering = files.get("word/numbering.xml");
  const core = files.get("docProps/core.xml");
  const rels = files.get("word/_rels/document.xml.rels");

  // Embedded images are binary, so they need a separate raw read (the XML pass
  // skips them). Absent or empty in text-only documents.
  let media = new Map<string, Uint8Array>();
  try {
    media = readBinaryEntries(bytes, (name) => name.startsWith("word/media/"));
  } catch {
    // No media or unreadable; figures simply won't carry bytes.
  }

  return {
    document,
    ...(styles !== undefined ? { styles } : {}),
    ...(numbering !== undefined ? { numbering } : {}),
    ...(core !== undefined ? { core } : {}),
    ...(rels !== undefined ? { rels } : {}),
    media,
  };
}
