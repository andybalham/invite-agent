export const LOCATION_MAX_CODE_POINTS = 4_000;

export type LocationValidationCode =
  | "LOCATION_TOO_LONG"
  | "LOCATION_HTML_NOT_ALLOWED"
  | "LOCATION_LINK_UNSAFE"
  | "LOCATION_MARKDOWN_INVALID";

export interface LocationValidationIssue {
  readonly code: LocationValidationCode;
  readonly message: string;
}

const rawHtmlPattern = /<\/?[a-z!][^>]*>/i;
const unsupportedBlockPattern = /^(?:#{1,6}\s|>\s|```|~~~)/m;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeHttpsUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) {
      return undefined;
    }
    return url.href;
  } catch {
    return undefined;
  }
}

function parseInline(source: string): string {
  let output = "";
  let cursor = 0;
  while (cursor < source.length) {
    if (source.startsWith("**", cursor)) {
      const end = source.indexOf("**", cursor + 2);
      if (end < 0 || end === cursor + 2) {
        throw new Error("markdown");
      }
      output += `<strong>${parseInline(source.slice(cursor + 2, end))}</strong>`;
      cursor = end + 2;
      continue;
    }
    if (source[cursor] === "*") {
      const end = source.indexOf("*", cursor + 1);
      if (end < 0 || end === cursor + 1) {
        throw new Error("markdown");
      }
      output += `<em>${parseInline(source.slice(cursor + 1, end))}</em>`;
      cursor = end + 1;
      continue;
    }
    if (source[cursor] === "[") {
      const labelEnd = source.indexOf("](", cursor + 1);
      const targetEnd = labelEnd < 0 ? -1 : source.indexOf(")", labelEnd + 2);
      if (labelEnd < 0 || targetEnd < 0 || labelEnd === cursor + 1) {
        throw new Error("markdown");
      }
      const label = source.slice(cursor + 1, labelEnd);
      const target = source.slice(labelEnd + 2, targetEnd);
      const href = safeHttpsUrl(target);
      if (!href) {
        throw new Error("link");
      }
      output += `<a href="${escapeHtml(href)}" rel="noopener noreferrer" target="_blank">${parseInline(label)}</a>`;
      cursor = targetEnd + 1;
      continue;
    }
    if (source[cursor] === "]" || source[cursor] === "`" || source.startsWith("![", cursor)) {
      throw new Error("markdown");
    }
    output += escapeHtml(source[cursor] ?? "");
    cursor += 1;
  }
  return output;
}

export function validateLocationMarkdown(source: string): LocationValidationIssue | undefined {
  if (Array.from(source).length > LOCATION_MAX_CODE_POINTS) {
    return {
      code: "LOCATION_TOO_LONG",
      message: "Enter location details using 4,000 characters or fewer"
    };
  }
  if (rawHtmlPattern.test(source)) {
    return {
      code: "LOCATION_HTML_NOT_ALLOWED",
      message: "Raw HTML and executable content are not allowed in location details"
    };
  }
  if (unsupportedBlockPattern.test(source)) {
    return {
      code: "LOCATION_MARKDOWN_INVALID",
      message: "Use paragraphs, lists, emphasis, and secure HTTPS links only"
    };
  }
  try {
    for (const line of source.split(/\r?\n/)) {
      const content = line.replace(/^(?:[-+*]|\d+\.)\s+/, "");
      parseInline(content);
    }
  } catch (error) {
    return error instanceof Error && error.message === "link"
      ? {
          code: "LOCATION_LINK_UNSAFE",
          message: "Location links must use secure HTTPS addresses"
        }
      : {
          code: "LOCATION_MARKDOWN_INVALID",
          message: "Use valid Markdown paragraphs, lists, emphasis, and secure HTTPS links"
        };
  }
  return undefined;
}

export function renderSafeLocationMarkdown(source: string): string {
  const issue = validateLocationMarkdown(source);
  if (issue) {
    throw new Error(issue.message);
  }
  if (source.length === 0) {
    return "";
  }

  const blocks: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listType: "ol" | "ul" | undefined;

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      blocks.push(`<p>${paragraph.map(parseInline).join("<br>")}</p>`);
      paragraph = [];
    }
  };
  const flushList = (): void => {
    if (listType && listItems.length > 0) {
      blocks.push(`<${listType}>${listItems.map((item) => `<li>${parseInline(item)}</li>`).join("")}</${listType}>`);
      listItems = [];
      listType = undefined;
    }
  };

  for (const line of source.split(/\r?\n/)) {
    const unordered = /^(?:[-+*])\s+(.+)$/.exec(line);
    const ordered = /^\d+\.\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const nextType = unordered ? "ul" : "ol";
      if (listType && listType !== nextType) {
        flushList();
      }
      listType = nextType;
      listItems.push((unordered?.[1] ?? ordered?.[1]) as string);
    } else if (line.trim().length === 0) {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks.join("");
}
