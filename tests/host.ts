import type { MenuItem } from "markedit-api";
import { Pika, PikaError, type Properties } from "../src/api";
import { assertOperation, withOperation } from "../src/operation";

// Match MarkEdit’s actual WebView: secure localhost, but Web Locks is not exposed.
Object.defineProperty(navigator, "locks", { value: undefined, configurable: true });

const global = window as unknown as Record<string, unknown>;
const menus: MenuItem[] = [];
const openedURLs: string[] = [];
window.open = ((url?: string | URL) => {
  openedURLs.push(String(url));
  return null;
}) as typeof window.open;
let contextItems: MenuItem[] = [];
let remoteMissing = false;
let sourceError = 0;
let stored: string | undefined;
let keychain: string | undefined;
let credentialReads = 0;
let remote: Properties = {};
let creates = 0;
let uploads = 0;
let failNextCreate = false;
let dropNextCreate = false;
let failNextRestore = false;
let failNextUpdate = false;
let failNextPublish = false;
let publishProgressSeen = false;
const liveURL = "https://garden.example/posts/one";
const draftURL = "https://pika.page/posts/123/edit";
const remoteURL = () => (remote["post-status"]?.[0] === "published" ? liveURL : draftURL);
let saveFailure = false;
let cancelConfirmation = false;
const confirmations: string[] = [];
const alertDetails: { title: string; message?: string; buttons?: string[] }[] = [];
let selectedDocument = "/test/garden.md";
const requests: { url: string; body?: Record<string, unknown> }[] = [];
let documentText =
  "# Garden\n\nHello **Pika**.\n\n![Fern](images/fern.png)\n\nhttps://open.spotify.com/album/1\n\n```pikahtml\n<div>hello</div>\n```";
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";
const secondPNG = (() => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "blue";
    context.fillRect(0, 0, 1, 1);
  }
  return canvas.toDataURL("image/png").split(",")[1];
})();
let fileInfoReads = 0;
let savedRevision = 1;
let saveAllowed = true;
let documentSaves = 0;
let firstSaveDelay = 0;
let nextSavePath = "/test/garden.md";
let neverFinishSave = false;
let savedText = documentText;
const saveLocal = () => {
  savedText = documentText;
  savedRevision++;
};
let documentPath: string | undefined = "/test/garden.md";
const host = {
  editorView: { state: { doc: { toString: () => documentText } } },
  onAppReady: (action: () => void) => action(),
  onEditorReady: (action: () => void) => action(),
  addMainMenuItem: (menu: MenuItem) => menus.push(menu),
  showContextMenu: (items: MenuItem[]) => {
    contextItems = items;
  },
  getFileInfo: async () => {
    fileInfoReads++;
    return documentPath
      ? {
          filePath: documentPath,
          modificationDate: new Date(savedRevision * 1000),
          fileSize: savedText.length,
        }
      : undefined;
  },
  saveDocument: async () => {
    documentSaves++;
    if (!saveAllowed) return false;
    if (neverFinishSave) return true;
    if (!documentPath && firstSaveDelay) {
      const delay = firstSaveDelay;
      const target = nextSavePath;
      firstSaveDelay = 0;
      setTimeout(() => {
        documentPath = target;
        saveLocal();
      }, delay);
      return true;
    }
    documentPath ??= nextSavePath;
    saveLocal();
    return true;
  },
  showTextBox: async () => undefined,
  getDirectoryPath: () => "/test",
  getFileContent: async (path: string) => (path.endsWith(".settings.json") ? stored : savedText),
  createFile: async ({ string }: { string: string }) => {
    if (saveFailure) return false;
    stored = string;
    return true;
  },
  getFileObject: async (path: string) =>
    path.endsWith("fern.png")
      ? { data: png, mimeType: "image/png" }
      : path.endsWith("new.png")
        ? { data: secondPNG, mimeType: "image/png" }
        : undefined,
  showAlert: async (details: { title: string; message?: string; buttons?: string[] }) => {
    confirmations.push(details.title);
    alertDetails.push(details);
    return cancelConfirmation ? 0 : 1;
  },
  showOpenPanel: async () => [selectedDocument],
  showSavePanel: async () => true,
  secretStorage: {
    has: async () => !!keychain,
    get: async () => {
      credentialReads++;
      return keychain;
    },
    set: async (_key: string, value: string) => {
      keychain = value;
    },
    delete: async () => {
      keychain = undefined;
      return true;
    },
  },
};
global.__FILE_PATH__ = "/test/scripts/markedit-pika.js";
global.require = (name: string) => {
  if (name === "markedit-api") return { MarkEdit: host };
  throw new Error(name);
};
const nativeFetch = window.fetch;
window.fetch = (async (resource: string | URL | Request, options?: RequestInit) => {
  const url = String(resource);
  const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(data), { status, headers });
  if (url.endsWith("?q=config")) {
    if ((options?.headers as Record<string, string>)?.Authorization === "Bearer rejected-token")
      return json({ error: "unauthorized" }, 401);
    return json({ "media-endpoint": "https://pika.page/micropub/media" });
  }
  if (url.includes("q=source"))
    return remoteMissing || sourceError
      ? json({ error: "invalid_request" }, sourceError || 404)
      : json({ properties: { ...remote, url: [remoteURL()] } });
  if (url.startsWith("https://pika.page/micropub/media/"))
    return new Response(
      Uint8Array.from(atob(png), (c) => c.charCodeAt(0)),
      { headers: { "Content-Type": "image/png" } },
    );
  if (url.endsWith("/media")) {
    uploads++;
    return new Response(null, {
      status: 201,
      headers: { Location: `https://pika.page/micropub/media/image-${uploads}` },
    });
  }
  const data = JSON.parse(String(options?.body));
  requests.push({ url, body: data });
  if (!data.action) {
    creates++;
    if (failNextCreate) {
      failNextCreate = false;
      return json({ error: "invalid_request", error_description: "Rejected test" }, 422);
    }
    remoteMissing = false;
    remote = {
      ...data.properties,
      category: ["existing-tag"],
      published: data.properties.published ?? ["2026-10-26T12:00:00Z"],
    };
    if (dropNextCreate) {
      dropNextCreate = false;
      throw new Error("Network disconnected after creation");
    }
    return new Response(null, {
      status: 201,
      headers: {
        Location: creates === 1 ? draftURL : `https://garden.example/posts/new-${creates}`,
      },
    });
  }
  if (data.action === "delete") return new Response(null, { status: 204 });
  if (data.action === "undelete") {
    if (failNextRestore) {
      failNextRestore = false;
      return json({ error_description: "Restore rejected" }, 422);
    }
    remote["post-status"] = ["draft"];
    return new Response(null, { status: 204 });
  }
  if (data.replace?.["post-status"]?.[0] === "published") {
    publishProgressSeen =
      document.querySelector("dialog .status")?.textContent === "Publishing post…" &&
      !!document.querySelector<HTMLButtonElement>("dialog .cm-previewClose")?.disabled;
    await new Promise((resolve) => setTimeout(resolve, 30));
    if (failNextPublish) {
      failNextPublish = false;
      return json({ error_description: "Publish rejected" }, 422);
    }
  }
  if (failNextUpdate) {
    failNextUpdate = false;
    return json({ error_description: "Update rejected" }, 422);
  }
  Object.assign(remote, data.replace ?? {});
  for (const [key, value] of Object.entries(data.add ?? {})) {
    if (key === "photo")
      remote.content = [
        `${remote.content?.[0]}\n\n![Photo](https://pika.page/micropub/media/image)`,
      ];
    else
      (remote as Record<string, unknown[]>)[key] = [
        ...((remote as Record<string, unknown[]>)[key] ?? []),
        ...(value as unknown[]),
      ];
  }
  if (Array.isArray(data.delete))
    for (const key of data.delete) delete (remote as Record<string, unknown>)[key];
  else
    for (const [key, value] of Object.entries(data.delete ?? {}))
      (remote as Record<string, unknown[]>)[key] = (
        (remote as Record<string, unknown[]>)[key] ?? []
      ).filter((item) => !(value as unknown[]).includes(item));
  return json({ properties: { ...remote, url: [remoteURL()] } });
}) as typeof fetch;

global.runSmoke = async () => {
  const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  };
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const dialog = () => document.querySelector("dialog") as HTMLDialogElement | null;
  const until = async (condition: () => boolean, message: string) => {
    for (let i = 0; i < 400; i++) {
      await wait(10);
      if (condition()) return;
    }
    throw new Error(message);
  };
  const field = (label: string) => {
    const wrapper = [...(dialog()?.querySelectorAll("label") ?? [])].find(
      (node) => node.firstChild?.textContent === label,
    );
    if (!wrapper) throw new Error(`Missing field ${label}`);
    return wrapper.querySelector("input") as HTMLInputElement;
  };
  const click = async (label: string) => {
    const node = [...(dialog()?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === label || button.getAttribute("aria-label") === label,
    );
    if (!node) throw new Error(`Missing button ${label}`);
    node.click();
    await until(() => dialog()?.getAttribute("aria-busy") !== "true", `Timed out: ${label}`);
    // A successful connection transitions directly into the publishing sheet.
    await wait(30);
  };
  const dismiss = async () => {
    await click("Close");
    await until(() => !dialog(), "Close did not dismiss");
  };
  const menu = (
    title: string,
    items = [...(menus[0].children ?? []), ...contextItems],
  ): MenuItem | undefined => {
    for (const item of items) {
      if (item.title === title) return item;
      if (item.children) {
        const found = menu(title, item.children);
        if (found) return found;
      }
    }
    return undefined;
  };
  const invoke = async (title: string) => {
    const topLevel = menus[0].children?.find((item) => item.title === title);
    if (!topLevel) {
      contextItems = [];
      menu("Manage Post…")?.action?.();
      await until(() => contextItems.length > 0, "Post actions did not load");
    }
    const item = topLevel ?? menu(title);
    assert(item?.action, `Missing menu ${title}`);
    if (!topLevel) contextItems = [];
    item?.action?.();
    await wait(100);
  };
  const open = async () => {
    await invoke("Sync to Pika…");
    await until(() => !!dialog()?.open, "Publishing sheet did not open");
    await until(() => dialog()?.getAttribute("aria-busy") !== "true", "Sync did not finish");
  };
  const text = () => dialog()?.textContent ?? "";
  localStorage.removeItem("markedit-pika.operation");
  await wait(100);
  assert(
    menu("Manage Post…")?.state?.().isEnabled === false,
    "Manage is enabled before first sync",
  );
  const alertsBeforeManage = confirmations.length;
  await invoke("Manage Post…");
  assert(
    !contextItems.length && confirmations.length === alertsBeforeManage,
    "Unlinked management asks for a URL or errors",
  );
  await open();
  assert(
    !menus[0].children?.some((item) => item.title === "Open on Pika"),
    "Open on Pika should not compete with Publish for a new document",
  );
  assert(!menu("Open on Pika"), "An unlinked document offers Open on Pika");
  assert(!menu("Preview Image…"), "Image-preview command remains");
  assert(text().includes("Connect to Pika"), "First use did not show connection");
  assert(
    dialog()?.querySelectorAll("input").length === 1,
    "Connection should only ask for a token",
  );
  assert(!dialog()?.querySelector("nav,textarea"), "API tabs or a body editor are exposed");
  assert(
    !text().includes("endpoint") && !text().includes("Keychain") && !text().includes("Settings:"),
    "Technical explanation leaked into setup",
  );
  const close = dialog()?.querySelector(".cm-previewClose");
  assert(
    close?.getAttribute("aria-label") === "Close" && close.textContent === "",
    "Close is not the MarkEdit icon control",
  );
  const help = dialog()?.querySelector<HTMLAnchorElement>("a.token-help");
  assert(
    help?.href === "https://pika.page/manual/micropub#setup" &&
      help.target === "_blank" &&
      help.rel.includes("noopener"),
    "Token help does not open the setup guide separately",
  );
  const beforeConnect = dialog();
  field("App token").value = "test-token-not-real";
  await click("Connect");
  await until(
    () => !!dialog() && dialog() !== beforeConnect && text().includes("Sync to Pika"),
    "Connection did not continue to publishing",
  );
  assert(!stored?.includes("test-token"), "Token was written to settings");
  assert(!dialog()?.querySelector("textarea,nav"), "Publishing copy or tabs remain");
  assert(field("Title").value === "Garden", "Title was not derived from document");
  assert(
    dialog()?.querySelector("footer")?.textContent === "Save Draft",
    "New-post setup exposes an unrelated action",
  );
  assert(
    dialog()?.querySelectorAll("input").length === 2,
    "Publishing sheet has unexpected controls",
  );
  assert(
    ![...(dialog()?.querySelectorAll("button") ?? [])].some((node) =>
      node.textContent?.startsWith("Publish"),
    ),
    "New posts can bypass draft creation",
  );
  assert(
    ![...(dialog()?.querySelectorAll("label") ?? [])].some((node) => node.textContent === "Tags"),
    "Tags field remains",
  );
  const originalText = documentText;
  documentText += "\n\n![Missing](images/missing.png)";
  await click("Save Draft");
  assert(creates === 0 && uploads === 0, "Missing image caused a partial upload or post");
  assert(text().includes("Couldn’t read image"), "Missing image was not explained");
  documentText = "# Only a heading";
  await click("Save Draft");
  assert(
    creates === 0 && !JSON.parse(stored ?? "{}").pending,
    "Empty body created an interrupted send",
  );
  documentText = `${originalText}\n\nLatest editor text.`;
  await click("Save Draft");
  assert(creates === 1 && uploads === 1, `Draft failed: ${text()}`);
  assert(savedText === documentText, "First draft used editor changes that had not been saved");
  assert(
    remote.content?.[0].includes("Latest editor text."),
    "Publishing did not read the editor directly",
  );
  assert(
    remote.content?.[0].includes("https://pika.page/micropub/media/image"),
    "Images were not uploaded automatically",
  );
  assert(remote.content?.[0].includes("pikahtml"), "Custom HTML was lost");
  assert(documentText.includes("images/fern.png"), "Local Markdown changed");
  assert(remote["post-status"]?.[0] === "draft", "Save Draft published publicly");
  assert(text().includes("Draft saved."), "Missing simple success message");
  assert(!JSON.parse(stored ?? "{}").pending, "Success left a pending journal");
  assert(
    dialog()?.querySelectorAll("button").length === 2,
    "Result includes redundant dismissal buttons",
  );
  assert(
    ![...(dialog()?.querySelectorAll("button") ?? [])].some(
      (button) => button.textContent === "Done",
    ),
    "Result still has Done",
  );
  await click("Open in Pika");
  assert(!dialog(), "Open in Pika did not dismiss the result");
  assert(
    openedURLs.at(-1) === JSON.parse(stored ?? "{}").links["/test/garden.md"].url,
    "Open in Pika opened the wrong post",
  );
  // Token renewal preserves all associations and rolls back if persistence fails.
  const linksBeforeReplacement = JSON.parse(stored ?? "{}").links;
  const uploadsBeforeReplacement = JSON.parse(stored ?? "{}").uploads;
  const connectionBeforeReplacement = JSON.parse(stored ?? "{}").connectionId;
  await invoke("Account…");
  await click("Replace Token…");
  field("App token").value = "rejected-token";
  await click("Connect");
  assert(
    keychain === "test-token-not-real" && text().includes("Reconnect"),
    "Rejected replacement changed the credential",
  );
  field("App token").value = "renewed-test-token";
  saveFailure = true;
  await click("Connect");
  saveFailure = false;
  assert(keychain === "test-token-not-real", "Failed replacement did not roll back Keychain");
  await click("Connect");
  assert(!dialog() && keychain === "renewed-test-token", "Replacement did not finish");
  assert(
    JSON.stringify(JSON.parse(stored ?? "{}").links) === JSON.stringify(linksBeforeReplacement) &&
      JSON.stringify(JSON.parse(stored ?? "{}").uploads) ===
        JSON.stringify(uploadsBeforeReplacement) &&
      JSON.parse(stored ?? "{}").connectionId !== connectionBeforeReplacement,
    "Token renewal lost links or failed to invalidate old approvals",
  );
  assert(!stored?.includes("renewed-test-token"), "Replacement leaked its token into settings");
  assert(menu("Manage Post…")?.state?.().isEnabled === true, "Linked post management is disabled");
  await invoke("Manage Post…");
  assert(
    contextItems.some((item) => item.title === "Open on Pika"),
    "Linked post cannot be opened",
  );
  assert(
    !contextItems.some(
      (item) =>
        item.title === "Return to Draft…" ||
        item.title === "Restore from Trash…" ||
        item.title === "Preview Image…" ||
        item.title === "Open Existing Post…",
    ),
    "Draft menu contains irrelevant actions",
  );
  const beforeAccountChange = JSON.parse(stored ?? "{}");
  const readsBeforeAccountChange = credentialReads;
  const sendsBeforeAccountChange = requests.length;
  stored = JSON.stringify({ ...beforeAccountChange, connectionId: "different-account" });
  contextItems.find((item) => item.title === "Publish…")?.action?.();
  await wait(100);
  assert(
    requests.length === sendsBeforeAccountChange && credentialReads === readsBeforeAccountChange,
    "A stale menu used its approved credential after the account changed",
  );
  assert(
    confirmations.at(-1) === "Pika",
    "Account-change guard did not explain why the menu expired",
  );
  stored = JSON.stringify(beforeAccountChange);
  contextItems = [];
  const beforeLocalSave = requests.length;
  const readsBeforeSave = fileInfoReads;
  documentText += "\n\nSaved locally, not sent.";
  saveLocal();
  await wait(1800);
  assert(requests.length === beforeLocalSave, "Local save contacted Pika");
  assert(fileInfoReads === readsBeforeSave, "File polling is still active");
  saveAllowed = false;
  const readsBeforeCanceledSave = credentialReads;
  await invoke("Sync to Pika…");
  assert(
    !dialog() && requests.length === beforeLocalSave && credentialReads === readsBeforeCanceledSave,
    "Canceled save continued into draft syncing",
  );
  saveAllowed = true;
  const frame = document.createElement("iframe");
  const frameLoaded = new Promise<void>((resolve) =>
    frame.addEventListener("load", () => resolve(), { once: true }),
  );
  frame.src = "about:blank";
  document.body.append(frame);
  await frameLoaded;
  const otherDatabase = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = frame.contentWindow?.indexedDB.open("markedit-pika.runtime", 1);
    if (!request) return reject(new Error("Second context has no IndexedDB"));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const setOtherLease = (value?: { id: string; expires: number }) =>
    new Promise<void>((resolve, reject) => {
      const transaction = otherDatabase.transaction("operations", "readwrite");
      if (value) transaction.objectStore("operations").put(value, "pika");
      else transaction.objectStore("operations").delete("pika");
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
  await setOtherLease({ id: "other-window", expires: Date.now() + 120_000 });
  const requestsBeforeContention = requests.length;
  await open();
  assert(
    text().includes("busy in another window") && requests.length === requestsBeforeContention,
    "Two browsing contexts could mutate concurrently",
  );
  await dismiss();
  // A crashed window’s expired lease can be claimed by the next explicit sync.
  await setOtherLease({ id: "closed-window", expires: 0 });
  otherDatabase.close();
  frame.remove();
  documentText += "\n\nUnsaved local edits to sync.";
  const savesBeforeDraftSync = documentSaves;
  const beforeDraftSync = requests.length;
  const dateBeforeDraftSync = remote.published?.[0];
  await open();
  assert(
    documentSaves === savesBeforeDraftSync + 1 && savedText === documentText,
    "Sync did not save current edits before updating the draft",
  );
  assert(!dialog()?.querySelector("input"), "Existing draft asks for metadata again");
  assert(text().includes("Draft saved."), "Existing draft did not sync directly");
  assert(
    requests.length === beforeDraftSync + 1 && creates === 1,
    "Draft sync did not update the existing post exactly once",
  );
  assert(
    remote.published?.[0] === dateBeforeDraftSync &&
      !(requests.at(-1)?.body?.replace as Properties)?.published,
    "Draft sync overwrote the publication date",
  );
  assert(
    (requests.at(-1)?.body?.replace as Properties)?.content?.[0].includes(
      "Saved locally, not sent.",
    ),
    "Direct draft sync missed current editor content",
  );
  assert(!dialog()?.querySelector('input[type="checkbox"]'), "Sync toggle remains visible");
  assert(
    ![...(dialog()?.querySelectorAll("button") ?? [])].some((node) =>
      node.textContent?.startsWith("Publish"),
    ),
    "Sync sheet still offers publication",
  );
  await dismiss();
  saveAllowed = false;
  const sendsBeforeCanceledPublishSave = requests.length;
  await invoke("Publish…");
  assert(
    requests.length === sendsBeforeCanceledPublishSave && remote["post-status"]?.[0] === "draft",
    "Canceled document save still published the draft",
  );
  saveAllowed = true;
  cancelConfirmation = true;
  const beforePublish = requests.length;
  const readsBeforePublish = credentialReads;
  await invoke("Publish…");
  assert(
    credentialReads === readsBeforePublish + 1,
    "Manage and Publish read the credential twice",
  );
  cancelConfirmation = false;
  assert(
    confirmations.at(-1) === "Publish this post?",
    "Management publication did not require confirmation",
  );
  assert(
    requests.length === beforePublish && remote["post-status"]?.[0] === "draft",
    "Cancelling publication made a public post",
  );
  failNextUpdate = true;
  const beforeFailedDraftSync = requests.length;
  await invoke("Publish…");
  await until(() => dialog()?.getAttribute("aria-busy") !== "true", "Failed publish stayed busy");
  assert(
    text().includes("Update rejected") &&
      !text().includes("Post published.") &&
      !text().includes("Open in Pika") &&
      remote["post-status"]?.[0] === "draft",
    "Failed publication showed a success result",
  );
  assert(
    requests.length === beforeFailedDraftSync + 1 &&
      !(requests.at(-1)?.body?.replace as Properties)?.["post-status"],
    "A failed draft sync continued into publication",
  );
  await dismiss();
  failNextPublish = true;
  await invoke("Publish…");
  await until(
    () => dialog()?.getAttribute("aria-busy") !== "true",
    "Failed final publish stayed busy",
  );
  assert(
    text().includes("Publish rejected") && remote["post-status"]?.[0] === "draft",
    "A failed final publication did not leave the synced draft private",
  );
  await dismiss();
  documentText += "\n\nLatest text to publish.\n\n![New](images/new.png)";
  const savesBeforePublish = documentSaves;
  await invoke("Publish…");
  await until(() => text().includes("Post published."), "Publish did not show its result sheet");
  assert(
    alertDetails.some(
      (alert) =>
        alert.title === "Publish this post?" && alert.message?.includes("synced to the Pika draft"),
    ),
    "Publication confirmation does not describe sync then publish",
  );
  assert(publishProgressSeen, "Publish did not show busy progress while publishing");
  assert(
    dialog()?.querySelectorAll("button").length === 2,
    "Published result has redundant buttons",
  );
  assert(
    JSON.parse(stored ?? "{}").links["/test/garden.md"].url === liveURL,
    "Published post kept its dashboard URL",
  );
  await click("Open in Pika");
  assert(
    !dialog() && openedURLs.at(-1) === liveURL && openedURLs.at(-1) !== draftURL,
    "Published result opened the editor or failed to close",
  );
  assert(
    documentSaves === savesBeforePublish + 1 && savedText === documentText,
    "Publish did not save the current document first",
  );
  assert(
    credentialReads === readsBeforePublish + 4,
    "Separate management interactions shared a credential or prompted twice",
  );
  assert(
    remote.content?.[0].includes("Latest text to publish.") &&
      remote.content?.[0].includes("https://pika.page/micropub/media/image-2") &&
      !remote.content?.[0].includes("images/new.png"),
    "Publication did not sync the latest text and new image",
  );
  assert(
    creates === 1 && uploads === 2,
    "Publishing duplicated the post or failed to upload the new image",
  );
  assert(
    requests.at(-2)?.body?.action === "update" &&
      (requests.at(-2)?.body?.replace as Properties)?.content?.[0].includes(
        "Latest text to publish.",
      ) &&
      (requests.at(-1)?.body?.replace as Properties)?.["post-status"]?.[0] === "published",
    "Publication did not sync content before changing the status",
  );
  assert(remote["post-status"]?.[0] === "published", "Publish did not change status");
  assert(remote.category?.includes("existing-tag"), "Removing the tags UI cleared existing tags");
  assert(
    !requests.some(
      (request) =>
        (request.body?.properties as Properties | undefined)?.category ||
        (request.body?.replace as Properties | undefined)?.category,
    ),
    "Publishing unexpectedly changed tags",
  );
  remote.content = ["Changed in Pika"];
  cancelConfirmation = true;
  const before = requests.length;
  await invoke("Sync to Pika…");
  await until(() => !dialog(), "Canceled published update left an empty sheet");
  cancelConfirmation = false;
  assert(requests.length === before, "Cancelled confirmation overwrote remote text");
  assert(confirmations.at(-1) === "Update published post?", "Public update skipped confirmation");
  await open();
  assert(!dialog()?.querySelector("input"), "Existing published post asks for metadata again");
  assert(
    text().includes("Post updated.") && remote["post-status"]?.[0] === "published",
    "Sync did not preserve the published state",
  );
  await dismiss();
  await invoke("Return to Draft…");
  assert(remote["post-status"]?.[0] === "draft", "Native management action failed");
  await invoke("Publish…");
  await until(() => text().includes("Post published."), "Second publish did not finish");
  await dismiss();
  remoteMissing = true;
  await invoke("Manage Post…");
  assert(
    contextItems.length === 1 && contextItems[0].title === "Create New Draft…",
    "Missing-post menu offers invalid actions",
  );
  contextItems = [];
  const oldURL = JSON.parse(stored ?? "{}").links["/test/garden.md"].url;
  const createsBeforeMissing = creates;
  cancelConfirmation = true;
  await invoke("Sync to Pika…");
  await until(() => !dialog(), "Canceled replacement left an empty sheet");
  cancelConfirmation = false;
  assert(
    confirmations.at(-1) === "This post is no longer on Pika",
    "Missing-post recovery was not offered",
  );
  assert(
    creates === createsBeforeMissing &&
      JSON.parse(stored ?? "{}").links["/test/garden.md"].url === oldURL,
    "Cancelling replacement changed the link or created a post",
  );
  remoteMissing = false;
  sourceError = 401;
  await open();
  assert(creates === createsBeforeMissing, "Authentication failure created a replacement");
  await dismiss();
  sourceError = 0;
  remoteMissing = true;
  await open();
  assert(
    creates === createsBeforeMissing + 1 && remote["post-status"]?.[0] === "draft",
    "Replacement was not created as a draft",
  );
  assert(
    JSON.parse(stored ?? "{}").links["/test/garden.md"].url !== oldURL,
    "Replacement did not save its new link",
  );
  assert(
    !(requests.at(-1)?.body?.properties as Properties | undefined)?.published,
    "Replacement reused the old publication date",
  );
  await dismiss();
  await invoke("Move to Trash…");
  assert(JSON.parse(stored ?? "{}").links["/test/garden.md"].trashed, "Trash failed");
  await invoke("Manage Post…");
  assert(
    contextItems.length === 1 && contextItems[0].title === "Restore from Trash…",
    "Trashed-post menu contains invalid actions",
  );
  contextItems = [];
  cancelConfirmation = true;
  const sendsBeforeRestore = requests.length;
  await invoke("Sync to Pika…");
  await until(() => !dialog(), "Canceled restoration left an empty sheet");
  cancelConfirmation = false;
  assert(
    confirmations.at(-1) === "This post is in Pika’s trash" &&
      requests.length === sendsBeforeRestore,
    "Canceling restore changed the remote post",
  );
  assert(
    JSON.parse(stored ?? "{}").links["/test/garden.md"].trashed,
    "Canceling cleared the trash link",
  );
  failNextRestore = true;
  await open();
  assert(
    text().includes("Restore rejected") && requests.length === sendsBeforeRestore + 1,
    "Failed restoration continued into syncing",
  );
  assert(
    JSON.parse(stored ?? "{}").links["/test/garden.md"].trashed,
    "Failed restore cleared trash state",
  );
  await dismiss();
  // Once restore succeeds, persist it even if the separate update is rejected.
  failNextUpdate = true;
  await open();
  assert(text().includes("Update rejected"), "Failed post-restore sync was hidden");
  assert(
    !JSON.parse(stored ?? "{}").links["/test/garden.md"].trashed,
    "A successful restore was lost after an update failure",
  );
  await dismiss();
  await invoke("Move to Trash…");
  documentText += "\n\nChanges made while this post was in trash.";
  const beforeRestoreSync = requests.length;
  const readsBeforeRestoreSync = credentialReads;
  const createsBeforeRestoreSync = creates;
  await open();
  assert(
    text().includes("Draft saved.") && !dialog()?.querySelector("input"),
    "Restore did not sync directly",
  );
  assert(
    requests.length === beforeRestoreSync + 2 &&
      requests[beforeRestoreSync].body?.action === "undelete" &&
      requests[beforeRestoreSync + 1].body?.action === "update",
    "Restore and sync did not run in order",
  );
  assert(
    credentialReads === readsBeforeRestoreSync + 1 && creates === createsBeforeRestoreSync,
    "Restore and sync prompted twice or created a duplicate post",
  );
  assert(
    savedText === documentText &&
      remote.content?.[0].includes("Changes made while this post was in trash."),
    "Restored draft did not receive current saved edits",
  );
  assert(
    remote["post-status"]?.[0] === "draft" &&
      !JSON.parse(stored ?? "{}").links["/test/garden.md"].trashed &&
      !JSON.parse(stored ?? "{}").pending,
    "Restore and sync did not persist a clean draft association",
  );
  await dismiss();
  await invoke("Create Separate Draft…");
  await invoke("Manage Post…");
  assert(
    contextItems.length === 0 && menu("Manage Post…")?.state?.().isEnabled === false,
    "Unlinked management remains available",
  );
  contextItems = [];
  await open();
  failNextCreate = true;
  await click("Save Draft");
  assert(text().includes("Rejected test"), "Rejected creation was hidden");
  assert(!JSON.parse(stored ?? "{}").pending, "Definite rejection blocked recovery");
  dropNextCreate = true;
  await click("Save Draft");
  assert(text().includes("may have received"), "Uncertain creation was not reported");
  const created = creates;
  await click("Save Draft");
  assert(creates === created, "Uncertain creation was repeated");
  await click("Close");
  await until(() => !dialog(), "Close icon did not dismiss");
  const interrupted = JSON.parse(stored ?? "{}").pending;
  assert(
    interrupted.path === "/test/garden.md" && interrupted.action === "create",
    "Interrupted creation lost its document or action",
  );
  documentPath = "/test/unrelated.md";
  await open();
  assert(
    text().includes("Check your last Pika action"),
    "Interrupted send did not show contextual recovery",
  );
  field("Post URL").value = "https://garden.example/posts/one";
  await click("Link Post");
  assert(!JSON.parse(stored ?? "{}").pending, "Recovery did not clear pending journal");
  assert(
    !JSON.parse(stored ?? "{}").links["/test/unrelated.md"],
    "Recovery linked the wrong open document",
  );
  documentPath = "/test/garden.md";
  saveFailure = true;
  const sent = requests.length;
  await open();
  saveFailure = false;
  assert(requests.length === sent, "A request was sent without saving its pending journal");
  await click("Close");
  await until(() => !dialog(), "Close did not finish");
  // MarkEdit can return true before the user finishes the first native Save dialog.
  documentPath = undefined;
  firstSaveDelay = 600;
  const savesBeforeFirstSave = documentSaves;
  const requestsBeforeFirstSave = requests.length;
  const alertsBeforeFirstSave = confirmations.length;
  await invoke("Sync to Pika…");
  assert(
    !dialog() && requests.length === requestsBeforeFirstSave,
    "First save showed an extra modal or sent before the file was ready",
  );
  await until(
    () => text().includes("Draft saved."),
    "Sync did not resume when the first save completed",
  );
  assert(
    documentPath === "/test/garden.md" && documentSaves === savesBeforeFirstSave + 1,
    "First save reopened the native Save dialog",
  );
  assert(
    !confirmations.slice(alertsBeforeFirstSave).includes("Pika"),
    "Successful first save produced a save-first error",
  );
  dialog()?.dispatchEvent(new Event("cancel", { cancelable: true }));
  await until(() => !dialog(), "Escape cancellation did not dismiss");
  documentPath = undefined;
  neverFinishSave = true;
  const sendsBeforeCanceledFirstSave = requests.length;
  await invoke("Sync to Pika…");
  assert(!dialog(), "Waiting for the native Save dialog showed an extra modal");
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  await wait(450);
  assert(
    requests.length === sendsBeforeCanceledFirstSave && !dialog(),
    "Canceled first save continued syncing",
  );
  neverFinishSave = false;
  documentPath = "/test/garden.md";
  await invoke("Manage Post…");
  assert(
    !contextItems.some(
      (item) => item.title === "Link Existing Post…" || item.title === "Preview Image…",
    ),
    "Linked post menu contains unrelated actions",
  );
  contextItems = [];
  const beforeRecoveryCases = stored;
  for (const action of ["update", "publish", "draft", "restore"]) {
    const state = JSON.parse(beforeRecoveryCases ?? "{}");
    state.pending = {
      path: "/test/garden.md",
      url: draftURL,
      action,
      started: new Date().toISOString(),
    };
    stored = JSON.stringify(state);
    documentPath = "/test/unrelated.md";
    await open();
    assert(
      !text().includes("No post was created"),
      "Non-creation recovery uses creation instructions",
    );
    field("Post URL").value = draftURL;
    await click("Link Post");
    assert(
      !JSON.parse(stored ?? "{}").pending && !JSON.parse(stored ?? "{}").links[documentPath],
      "Operation recovery modified the wrong document",
    );
  }
  const trashState = JSON.parse(beforeRecoveryCases ?? "{}");
  trashState.pending = {
    path: "/test/garden.md",
    url: trashState.links["/test/garden.md"].url,
    action: "trash",
    started: new Date().toISOString(),
  };
  stored = JSON.stringify(trashState);
  await open();
  await click("Post Is in Trash");
  assert(
    !JSON.parse(stored ?? "{}").pending &&
      JSON.parse(stored ?? "{}").links["/test/garden.md"].trashed,
    "Trash recovery did not mark the original post as trashed",
  );
  const legacyState = JSON.parse(beforeRecoveryCases ?? "{}");
  legacyState.pending = { started: new Date().toISOString(), url: draftURL };
  stored = JSON.stringify(legacyState);
  await open();
  await click("Link Post");
  assert(
    text().includes("Choose the original Markdown document first") &&
      JSON.parse(stored ?? "{}").pending,
    "Legacy recovery silently chose the active document",
  );
  selectedDocument = "/test/garden.md";
  await click("Choose Original Document…");
  await click("Link Post");
  assert(
    !JSON.parse(stored ?? "{}").pending && !JSON.parse(stored ?? "{}").links["/test/unrelated.md"],
    "Legacy recovery did not respect explicit document selection",
  );
  stored = beforeRecoveryCases;
  documentPath = "/test/garden.md";
  await invoke("Account…");
  assert(text().includes("Connected to Pika."), "Account sheet failed");
  assert(
    !text().includes("API:") && !text().includes("Settings:"),
    "Account details expose technical state",
  );
  await dismiss();
  // A genuinely new file must continue from the delayed native save into setup.
  documentPath = undefined;
  nextSavePath = "/test/first-save-post.md";
  firstSaveDelay = 600;
  const newFileSaves = documentSaves;
  const newFileAlerts = confirmations.length;
  const newFileCreates = creates;
  await invoke("Sync to Pika…");
  await until(
    () => !!dialog()?.querySelector('input[type="text"]'),
    "New first save did not continue into draft setup",
  );
  assert(
    documentSaves === newFileSaves + 1 &&
      documentPath === nextSavePath &&
      !confirmations.slice(newFileAlerts).includes("Pika"),
    "New first save asked the user to save again",
  );
  await click("Save Draft");
  assert(
    text().includes("Draft saved.") &&
      creates === newFileCreates + 1 &&
      JSON.parse(stored ?? "{}").links[nextSavePath],
    "New first-save document was not linked to its draft",
  );
  await dismiss();
  documentPath = "/test/garden.md";
  nextSavePath = "/test/garden.md";
  const supportedSave = host.saveDocument;
  const compatibilityHost = host as Partial<typeof host>;
  delete compatibilityHost.saveDocument;
  const sendsBeforeCompatibilityCheck = requests.length;
  await invoke("Sync to Pika…");
  assert(
    !dialog() &&
      requests.length === sendsBeforeCompatibilityCheck &&
      alertDetails.at(-1)?.message?.includes("document-saving API is unavailable"),
    "Unsupported host did not fail before publishing with a clear compatibility message",
  );
  compatibilityHost.saveDocument = supportedSave;
  // Losing the lease stops work, and cleanup never releases a different owner’s lock.
  const lockDatabase = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("markedit-pika.runtime", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const lockStore = (work: (store: IDBObjectStore) => void) =>
    new Promise<void>((resolve, reject) => {
      const transaction = lockDatabase.transaction("operations", "readwrite");
      work(transaction.objectStore("operations"));
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
  await withOperation(async () => {
    await assertOperation();
    await lockStore((store) =>
      store.put({ id: "new-owner", expires: Date.now() + 120_000 }, "pika"),
    );
    let rejected = false;
    try {
      await assertOperation();
    } catch {
      rejected = true;
    }
    assert(rejected, "A lost operation lease still authorized writes");
  });
  const survivingOwner = await new Promise<unknown>((resolve) => {
    const request = lockDatabase.transaction("operations").objectStore("operations").get("pika");
    request.onsuccess = () => resolve(request.result?.id);
  });
  assert(survivingOwner === "new-owner", "Cleanup released another operation’s lock");
  await lockStore((store) => store.delete("pika"));
  lockDatabase.close();
  // Final representative first-sync view for visual inspection.
  const finalSettings = JSON.parse(stored ?? "{}");
  finalSettings.links = {};
  stored = JSON.stringify(finalSettings);
  await open();
  let liveStatus = 0;
  try {
    await new Pika("markedit-pika-connectivity-test-invalid", nativeFetch).config();
  } catch (error) {
    if (error instanceof PikaError) liveStatus = error.status;
  }
  assert(
    liveStatus === 401,
    `Real WebKit API client probe returned ${liveStatus}; fetch may have lost its Window receiver`,
  );
  return {
    ok: true,
    creates,
    uploads,
    apiRequests: requests.length,
    liveUnauthenticatedStatus: liveStatus,
    origin: location.origin,
    webLocks: typeof navigator.locks,
    operationStorage: "IndexedDB",
  };
};
