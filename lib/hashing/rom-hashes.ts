import {
  ZipError,
  findSingleRomEntry,
  openZipEntry,
  readZipEntries,
} from "../archives/zip.ts";
import {
  DEFAULT_ALGORITHMS,
  hashFile,
  hashStream,
  type FileHashes,
  type HashAlgorithm,
} from "./file-hashes.ts";

export interface RomHashResult {
  hashes: FileHashes;
  hashedEntry: string | null;
  warning: string | null;
}

export async function hashRomFile(
  absolutePath: string,
  extension: string,
  platformExtensions: readonly string[],
  algorithms: readonly HashAlgorithm[] = DEFAULT_ALGORITHMS,
): Promise<RomHashResult> {
  if (extension.toLowerCase() !== ".zip") {
    return {
      hashes: await hashFile(absolutePath, algorithms),
      hashedEntry: null,
      warning: null,
    };
  }
  try {
    const entries = await readZipEntries(absolutePath);
    const rom = findSingleRomEntry(entries, platformExtensions);
    if (!rom) {
      return {
        hashes: await hashFile(absolutePath, algorithms),
        hashedEntry: null,
        warning:
          entries.length === 0
            ? "Archive is empty; hashed the archive itself."
            : "Archive does not hold exactly one supported ROM; hashed the archive itself.",
      };
    }
    const stream = await openZipEntry(absolutePath, rom);
    return {
      hashes: await hashStream(stream, algorithms),
      hashedEntry: rom.name,
      warning: null,
    };
  } catch (error) {
    return {
      hashes: await hashFile(absolutePath, algorithms),
      hashedEntry: null,
      warning:
        error instanceof ZipError
          ? `${error.message} Hashed the archive itself.`
          : "Archive could not be read; hashed the archive itself.",
    };
  }
}