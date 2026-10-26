import { expect, test } from "bun:test";
import type { MarkEdit } from "markedit-api";
import { Store } from "../src/store";

function fixture(initial?: string) {
  let raw = initial;
  let fail = false;
  const host = {
    getDirectoryPath: () => "/app/documents",
    getFileContent: async () => raw,
    createFile: async ({ string }: { string: string }) => {
      if (fail) return false;
      raw = string;
      return true;
    },
  } as unknown as MarkEdit;
  return {
    store: new Store(host, "/scripts/markedit-pika.js"),
    raw: () => raw,
    fail: () => {
      fail = true;
    },
  };
}
test("missing settings initialize beside the script; edits merge fresh data", async () => {
  const { store } = fixture();
  expect(store.path).toBe("/scripts/markedit-pika.settings.json");
  await store.edit((data) => {
    data.blog = "https://example.com";
  });
  await store.edit((data) => {
    data.pending = { started: "2026-10-26T12:00:00Z" };
  });
  expect((await store.read()).blog).toBe("https://example.com");
  expect((await store.read()).pending).toBeDefined();
});
test("malformed settings are preserved", async () => {
  for (const bad of [
    "{",
    "null",
    '{"version":1,"links":[],"uploads":{}}',
    '{"version":1,"links":{"x":{"url":"http://bad.example"}},"uploads":{}}',
  ]) {
    const { store, raw } = fixture(bad);
    await expect(
      store.edit((data) => {
        data.blog = "https://example.com";
      }),
    ).rejects.toThrow();
    expect(raw()).toBe(bad);
  }
});
test("failed persistence is surfaced and never silently acknowledged", async () => {
  const { store, fail } = fixture();
  fail();
  await expect(
    store.edit((data) => {
      data.blog = "https://example.com";
    }),
  ).rejects.toThrow("could not be saved");
});

test("interrupted operations preserve their original document and action", async () => {
  const { store } = fixture();
  await store.edit((data) => {
    data.pending = {
      action: "publish",
      path: "/docs/post.md",
      url: "https://blog.example/post",
      started: "2026-10-26T12:00:00Z",
    };
  });
  expect((await store.read()).pending).toMatchObject({ action: "publish", path: "/docs/post.md" });
});

test("malformed new recovery fields are rejected and legacy records remain readable", async () => {
  for (const pending of [
    { path: 1 },
    { path: "relative.md" },
    { action: "anything" },
    { url: "javascript:bad" },
  ]) {
    const { store } = fixture(
      JSON.stringify({
        version: 1,
        links: {},
        uploads: {},
        pending: { started: "now", ...pending },
      }),
    );
    await expect(store.read()).rejects.toThrow();
  }
  const { store } = fixture(
    JSON.stringify({ version: 1, links: {}, uploads: {}, pending: { started: "now" } }),
  );
  expect((await store.read()).pending?.path).toBeUndefined();
});
