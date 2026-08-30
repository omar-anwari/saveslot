import { realpath } from "node:fs/promises";
import path from "node:path";

export class PathEscapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathEscapeError";
  }
}

export function isWithinRoot(root: string, candidate: string): boolean {
  const normalizedRoot = path.resolve(root);
  const normalizedCandidate = path.resolve(candidate);
  if (normalizedCandidate === normalizedRoot) return true;
  return normalizedCandidate.startsWith(normalizedRoot + path.sep);
}

export function resolveWithinRoot(root: string, relativePath: string): string {
  if (relativePath.includes("\0")) {
    throw new PathEscapeError("Path contains a null byte.");
  }
  if (path.isAbsolute(relativePath)) {
    throw new PathEscapeError("Absolute paths are not accepted.");
  }
  const resolved = path.resolve(root, relativePath);

  if (!isWithinRoot(root, resolved)) {
    throw new PathEscapeError("Resolved path escapes its configured root.");
  }
  return resolved;
}

export async function resolveRealPathWithinRoot(
  root: string,
  relativePath: string,
): Promise<string> {
  const resolved = resolveWithinRoot(root, relativePath);
  const realRoot = await realpath(root);
  const realTarget = await realpath(resolved);
  if (!isWithinRoot(realRoot, realTarget)) {
    throw new PathEscapeError(
      "Resolved path escapes its configured root through a symlink.",
    );
  }
  return realTarget;
}

export function toPosixRelative(root: string, absolutePath: string): string {
  const relative = path.relative(path.resolve(root), path.resolve(absolutePath));
  return relative.split(path.sep).join("/");
}