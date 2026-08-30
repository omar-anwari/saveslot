const REGIONS = new Set([
  "USA", "Europe", "Japan", "World", "Australia", "Brazil", "Canada", "China",
  "France", "Germany", "Italy", "Korea", "Netherlands", "Spain", "Sweden",
  "Taiwan", "UK", "Asia", "Russia", "Denmark", "Norway", "Finland",
]);

const LANGUAGES = new Set([
  "En", "Fr", "De", "Es", "It", "Ja", "Pt", "Sv", "No", "Da", "Fi", "Nl",
  "Zh", "Ko", "Ru", "Pl", "Cs", "Hu", "Tr", "El", "He", "Ar",
]);

const ARTICLES = [
  "The", "A", "An", "Le", "La", "Les", "Los", "Las", "El", "Der", "Die", "Das",
];

const ARTICLE_SUFFIX = new RegExp(`^(?<name>.+),\\s*(?<article>${ARTICLES.join("|")})$`, "i");
const ARTICLE_PREFIX = new RegExp(`^(?:${ARTICLES.join("|")})\\s+`, "i");

const GROUP_PATTERN = /\s*(?:\((?<paren>[^()]*)\)|\[(?<bracket>[^\][]*)\])/g;

const REVISION_PATTERN = /^Rev\s+(?<value>\S+)$/i;
const DISC_PATTERN = /^Dis[ck]\s*(?<value>\d+)$/i;
const YEAR_PATTERN = /^(?:19|20)\d{2}$/;

export interface ParsedFilename {
  extension: string;
  title: string;
  sortTitle: string;
  region: string | null;
  revision: string | null;
  languages: string[];
  discNumber: number | null;
  statusTags: string[];
  year: number | null;
}

function extractExtension(fileName: string): string {
  const match = /\.[A-Za-z0-9]{1,5}$/.exec(fileName);
  return match ? match[0].toLowerCase() : "";
}

function splitParts(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function removeRanges(
  value: string,
  ranges: ReadonlyArray<{ start: number; end: number }>,
): string {
  let result = "";
  let cursor = 0;
  for (const range of ranges) {
    result += value.slice(cursor, range.start);
    cursor = range.end;
  }
  return result + value.slice(cursor);
}

export function parseFilename(fileName: string): ParsedFilename {
  const extension = extractExtension(fileName);
  const base = extension ? fileName.slice(0, -extension.length) : fileName;

  let region: string | null = null;
  let revision: string | null = null;
  let discNumber: number | null = null;
  let year: number | null = null;
  const languages: string[] = [];
  const statusTags: string[] = [];
  const removals: Array<{ start: number; end: number }> = [];

  for (const match of base.matchAll(GROUP_PATTERN)) {
    const start = match.index ?? 0;
    const range = { start, end: start + match[0].length };
    const bracket = match.groups?.bracket;
    const paren = match.groups?.paren;

    if (bracket !== undefined) {
      const value = bracket.trim();
      if (value.length > 0) statusTags.push(value);
      removals.push(range);
      continue;
    }

    if (paren === undefined) continue;
    const value = paren.trim();
    if (value.length === 0) continue;

    const revisionMatch = REVISION_PATTERN.exec(value);
    if (revisionMatch?.groups?.value) {
      revision = revisionMatch.groups.value;
      removals.push(range);
      continue;
    }

    const discMatch = DISC_PATTERN.exec(value);
    if (discMatch?.groups?.value) {
      discNumber = Number.parseInt(discMatch.groups.value, 10);
      removals.push(range);
      continue;
    }

    const parts = splitParts(value);

    if (parts.length > 0 && parts.every((part) => REGIONS.has(part))) {
      region = parts.join(", ");
      removals.push(range);
      continue;
    }

    if (parts.length > 0 && parts.every((part) => LANGUAGES.has(part))) {
      languages.push(...parts);
      removals.push(range);
      continue;
    }

    if (YEAR_PATTERN.test(value)) {
      year = Number.parseInt(value, 10);
      removals.push(range);
      continue;
    }
  }

  let title = removeRanges(base, removals);

  if (!title.includes(" ") && title.includes("_")) {
    title = title.replace(/_/g, " ");
  }

  title = title.replace(/\s+/g, " ").trim();

  const articleMatch = ARTICLE_SUFFIX.exec(title);
  if (articleMatch?.groups?.name && articleMatch.groups.article) {
    title = `${articleMatch.groups.article} ${articleMatch.groups.name}`;
  }

  const sortTitle = title.replace(ARTICLE_PREFIX, "").toLowerCase().trim();

  return {
    extension,
    title,
    sortTitle,
    region,
    revision,
    languages,
    discNumber,
    statusTags,
    year,
  };
}