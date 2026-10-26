import type { Definition, Image, RootContent } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";

export type LocalImage = {
  path: string;
  from: number;
  to: number;
  alt: string;
  title?: string | null;
  identifier?: string;
};
export function localPath(destination: string, documentPath?: string): string | undefined {
  if (/^https?:\/\//i.test(destination)) return undefined;
  if (destination.startsWith("//")) return undefined;
  let decoded: string;
  if (/^file:/i.test(destination)) {
    const url = new URL(destination);
    if (url.host && url.host !== "localhost")
      throw new Error("Remote file URLs are not supported.");
    decoded = decodeURIComponent(url.pathname);
  } else {
    if (/^[a-z][a-z\d+.-]*:/i.test(destination) || destination.startsWith("#"))
      throw new Error(`Unsupported image URL: ${destination}`);
    decoded = decodeURIComponent(destination).replace(
      /\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~])/g,
      "$1",
    );
  }
  if (!decoded.startsWith("/")) {
    if (!documentPath)
      throw new Error("Save this Markdown document before publishing relative images.");
    decoded = `${documentPath.slice(0, documentPath.lastIndexOf("/"))}/${decoded}`;
  }
  const normalized: string[] = [];
  for (const part of decoded.split("/")) {
    if (part === "..") normalized.pop();
    else if (part && part !== ".") normalized.push(part);
  }
  return `/${normalized.join("/")}`;
}
function walk(nodes: RootContent[], fn: (node: RootContent) => void) {
  for (const node of nodes) {
    fn(node);
    if ("children" in node) walk(node.children as RootContent[], fn);
  }
}
export function images(markdown: string, documentPath?: string): LocalImage[] {
  const root = fromMarkdown(markdown);
  const definitions = new Map<string, Definition>();
  const found: LocalImage[] = [];
  const seen = new Set<number>();
  walk(root.children, (node) => {
    if (node.type === "definition") definitions.set(node.identifier, node);
  });
  walk(root.children, (node) => {
    if (node.type === "html" && /<img\b/i.test(node.value)) {
      for (const match of node.value.matchAll(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
        if (localPath(match[1] ?? match[2] ?? match[3], documentPath))
          throw new Error("Local images in HTML must use Markdown image syntax before publishing.");
      }
    }
    if (node.type !== "image" && node.type !== "imageReference") return;
    const source: Image | Definition | undefined =
      node.type === "image" ? node : definitions.get(node.identifier);
    if (!source) return;
    const path = localPath(source.url, documentPath);
    if (!path) return;
    const from = source.position?.start.offset;
    const to = source.position?.end.offset;
    if (from === undefined || to === undefined || seen.has(from)) return;
    seen.add(from);
    found.push({
      path,
      from,
      to,
      alt: node.alt ?? "",
      title: source.title,
      identifier: source.type === "definition" ? source.identifier : undefined,
    });
  });
  return found;
}
export function imageMarkdown(alt: string, url: string, title?: string | null): string {
  return `![${alt.replace(/[\\[\]]/g, "\\$&")}](<${url.replaceAll(">", "%3E")}>${title ? ` "${title.replace(/[\\"]/g, "\\$&")}"` : ""})`;
}
export function replaceImages(
  markdown: string,
  replacements: { image: LocalImage; url: string }[],
): string {
  let result = markdown;
  for (const { image, url } of [...replacements].sort((a, b) => b.image.from - a.image.from)) {
    const replacement = image.identifier
      ? `[${image.identifier}]: <${url}>${image.title ? ` "${image.title.replace(/[\\"]/g, "\\$&")}"` : ""}`
      : imageMarkdown(image.alt, url, image.title);
    result = result.slice(0, image.from) + replacement + result.slice(image.to);
  }
  return result;
}
export function splitTitle(markdown: string): { title: string; body: string } {
  const root = fromMarkdown(markdown);
  const first = root.children[0];
  if (first?.type !== "heading") return { title: "", body: markdown };
  const start = first.position?.start.offset ?? 0;
  const end = first.position?.end.offset ?? 0;
  if (markdown.slice(0, start).trim()) return { title: "", body: markdown };
  const plain = (nodes: RootContent[]): string =>
    nodes
      .map((node) =>
        "children" in node
          ? plain(node.children as RootContent[])
          : "value" in node
            ? String(node.value)
            : node.type === "image"
              ? (node.alt ?? "")
              : "",
      )
      .join("");
  return {
    title: plain(first.children as RootContent[]),
    body: markdown.slice(end).replace(/^\r?\n(?:\r?\n)?/, ""),
  };
}
