import { readXmlParts } from "@docmarrow/ooxml";

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
  return {
    document,
    ...(styles !== undefined ? { styles } : {}),
    ...(numbering !== undefined ? { numbering } : {}),
    ...(core !== undefined ? { core } : {}),
  };
}
