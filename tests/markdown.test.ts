import { expect, test } from "bun:test";
import { imageMarkdown, images, localPath, replaceImages, splitTitle } from "../src/markdown";

test("inline and reference images resolve against saved document; code remains untouched", () => {
  const text =
    '![Garden](<images/my garden.png> "caption")\n\n![Other][photo]\n\n[photo]: ../photo.jpg\n\n`![code](bad.png)`\n\n```md\n![code](bad.png)\n```\n\n![Web](https://example.com/a.png)';
  const refs = images(text, "/Users/alex/posts/post.md");
  expect(refs.map((r) => r.path)).toEqual([
    "/Users/alex/posts/images/my garden.png",
    "/Users/alex/photo.jpg",
  ]);
  const outgoing = replaceImages(
    text,
    refs.map((image, i) => ({ image, url: `https://pika.page/micropub/media/${i}` })),
  );
  expect(outgoing).toContain('![Garden](<https://pika.page/micropub/media/0> "caption")');
  expect(outgoing).toContain("[photo]: <https://pika.page/micropub/media/1>");
  expect(outgoing).toContain("`![code](bad.png)`");
  expect(text).toContain("images/my garden.png");
});
test("shared references upload once while retaining labels and definitions", () => {
  const text = "![a][shared]\n![b][shared]\n\n[shared]: test.png";
  expect(images(text, "/docs/post.md")).toHaveLength(1);
});
test("nested parentheses, escaped alt text, and percent-encoded filenames", () => {
  const found = images(
    "![A \\[bracket\\]](images/a(b).png)\n![Space](my%20photo.jpg)",
    "/docs/a.md",
  );
  expect(found.map((x) => x.path)).toEqual(["/docs/images/a(b).png", "/docs/my photo.jpg"]);
  expect(imageMarkdown("a[b]", "https://example.com/a.png")).toBe(
    "![a\\[b\\]](<https://example.com/a.png>)",
  );
});
test("relative unsaved images and unsafe schemes fail before publication", () => {
  expect(() => images("![a](image.png)")).toThrow("Save this Markdown");
  expect(() => localPath("data:image/png;base64,abc", "/docs/a.md")).toThrow("Unsupported");
  expect(() => images('<img src="local.png">', "/docs/a.md")).toThrow("Markdown image syntax");
  expect(localPath("file:///Users/alex/my%20image.png")).toBe("/Users/alex/my image.png");
  expect(localPath("//example.com/a.png")).toBeUndefined();
});
test("title extraction handles formatting, setext headings, and content boundaries", () => {
  expect(splitTitle("# My **great** title\n\nBody")).toEqual({
    title: "My great title",
    body: "Body",
  });
  expect(splitTitle("Title\n=====\n\nBody")).toEqual({ title: "Title", body: "Body" });
  expect(splitTitle("Intro\n\n# Heading")).toEqual({ title: "", body: "Intro\n\n# Heading" });
});
test("Pika embeds and custom HTML round-trip verbatim", () => {
  const content = "https://open.spotify.com/album/1\n\n```pikahtml\n<script>hello()</script>\n```";
  expect(replaceImages(content, [])).toBe(content);
});
