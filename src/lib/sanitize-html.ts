/**
 * Centralised HTML sanitisation for any code path that renders user-controlled
 * markup via `dangerouslySetInnerHTML`. Wraps isomorphic-dompurify with a
 * strict allow-list suitable for blog content, admin previews and rich-text
 * surfaces.
 *
 * Always prefer `sanitizeHtml(html)` over passing raw strings into
 * `dangerouslySetInnerHTML`, even when the source looks "safe" (e.g. server
 * markdown). Defence in depth: if any upstream step ever forgets to escape,
 * this layer still blocks stored XSS.
 */
import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
];

const ALLOWED_ATTR = [
  "href",
  "title",
  "alt",
  "src",
  "width",
  "height",
  "class",
  "target",
  "rel",
  "colspan",
  "rowspan",
];

const COMMON_OPTS = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  // Reject any javascript: / data: URLs that aren't images.
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|ftp):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "style"],
  KEEP_CONTENT: true,
  RETURN_TRUSTED_TYPE: false,
};

/**
 * Sanitise an HTML string for safe use with `dangerouslySetInnerHTML`.
 * Returns an empty string on `null` / `undefined`.
 */
export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return "";
  return DOMPurify.sanitize(input, COMMON_OPTS) as unknown as string;
}

/**
 * Sanitise JSON-LD payloads embedded inside `<script>` tags. Strips the
 * dangerous `</script` sequence and any U+2028/U+2029 line separators that
 * break inline scripts in some browsers.
 */
export function sanitizeJsonLd(payload: unknown): string {
  return JSON.stringify(payload)
    .replace(/<\/script/gi, "<\\/script")
    .replace(/[\u2028\u2029]/g, "");
}
