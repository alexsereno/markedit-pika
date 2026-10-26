import { MarkEdit } from "markedit-api";
import { httpsURL, MEDIA, Pika, PikaError, type Properties, type Source } from "./api";
import { images, replaceImages, splitTitle } from "./markdown";
import { assertOperation, withOperation } from "./operation";
import { type Link, type Pending, Store } from "./store";
import { css } from "./style";

const store = new Store(
  MarkEdit,
  typeof __FILE_PATH__ === "string" ? __FILE_PATH__ : undefined,
  assertOperation,
);
const secretKey = "pika.app-token";
let sheet: HTMLDialogElement | undefined;
let running = false;
let saveGeneration = 0;
let clearManagementApproval = () => {};
let canManagePost = false;
async function refreshManageState() {
  try {
    const info = await MarkEdit.getFileInfo();
    const settings = await store.read();
    canManagePost = !!info && !!settings.links[info.filePath];
  } catch {
    canManagePost = false;
  }
}
const mime: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
function field(parent: HTMLElement, label: string, value = "", type = "text") {
  const wrapper = el("label", label);
  const input = el("input");
  input.type = type;
  input.value = value;
  wrapper.append(input);
  parent.append(wrapper);
  return input;
}
function button(parent: HTMLElement, label: string, action: () => void, primary = false) {
  const node = el("button", label);
  node.type = "button";
  if (primary) node.className = "primary";
  node.addEventListener("click", action);
  parent.append(node);
  return node;
}
function openURL(url: string) {
  window.open(httpsURL(url), "_blank", "noopener,noreferrer");
}
async function confirm(title: string, message: string, action: string) {
  return (await MarkEdit.showAlert({ title, message, buttons: ["Cancel", action] })) === 1;
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(stable));
  if (value && typeof value === "object")
    return JSON.stringify(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v)]),
    );
  return JSON.stringify(value);
}

function mount(title: string) {
  clearManagementApproval();
  sheet?.close();
  const view = MarkEdit.editorView;
  const dialog = el("dialog");
  sheet = dialog;
  dialog.className = "markedit-pika";
  const style = el("style");
  style.textContent = css;
  dialog.append(style);
  const heading = el("h1", title);
  heading.id = `pika-${crypto.randomUUID()}`;
  dialog.setAttribute("aria-labelledby", heading.id);
  dialog.append(heading);
  let busy = false;
  let dismissing = false;
  async function dismiss() {
    if (busy || dismissing) return;
    dismissing = true;
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
      await dialog
        .animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 160,
          easing: "ease-out",
          fill: "forwards",
        })
        .finished.catch(() => {});
    dialog.close();
  }
  const close = button(dialog, "", () => void dismiss());
  close.className = "cm-previewClose";
  close.title = "Close";
  close.setAttribute("aria-label", "Close");
  const content = el("div");
  dialog.append(content);
  const status = el("p");
  status.className = "status";
  status.hidden = true;
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  dialog.append(status);
  const footer = el("footer");
  dialog.append(footer);
  const theme = () => {
    if (!view.dom) return;
    const colors = getComputedStyle(view.dom);
    if (colors.backgroundColor !== "rgba(0, 0, 0, 0)")
      dialog.style.setProperty("--pika-background", colors.backgroundColor);
    dialog.style.setProperty("--pika-text", colors.color);
    const rgb = colors.color
      .match(/[\d.]+/g)
      ?.slice(0, 3)
      .map(Number);
    if (rgb?.length === 3)
      dialog.style.colorScheme =
        (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 140 ? "dark" : "light";
  };
  theme();
  window.addEventListener("editor-colors-changed", theme);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    void dismiss();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Tab") dialog.classList.add("cm-previewKeyboardFocus");
  });
  dialog.addEventListener(
    "close",
    () => {
      window.removeEventListener("editor-colors-changed", theme);
      for (const input of dialog.querySelectorAll<HTMLInputElement>('input[type="password"]'))
        input.value = "";
      dialog.remove();
      if (sheet === dialog) sheet = undefined;
      view.focus?.();
    },
    { once: true },
  );
  function report(message: string, error = false) {
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle("error", error);
  }
  async function run(
    action: () => Promise<void>,
    secret?: HTMLInputElement,
    alreadyExclusive = false,
  ) {
    if (busy) return;
    busy = true;
    dialog.setAttribute("aria-busy", "true");
    const controls = [
      ...dialog.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input,button"),
    ];
    for (const control of controls) control.disabled = true;
    try {
      if (alreadyExclusive) await action();
      else await exclusive(action);
    } catch (error) {
      let message = error instanceof Error ? error.message : String(error);
      if (secret?.value) message = message.replaceAll(secret.value, "[token]");
      report(message, true);
    } finally {
      busy = false;
      dialog.removeAttribute("aria-busy");
      for (const control of controls) control.disabled = false;
      await refreshManageState();
    }
  }
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, content, footer, report, run };
}

async function exclusive<T>(action: () => Promise<T>): Promise<T> {
  if (running) throw new Error("Finish the other Pika action first.");
  running = true;
  try {
    return await withOperation(action);
  } finally {
    running = false;
  }
}

async function api(connectionId?: string, approvedClient?: Pika) {
  const settings = await store.read();
  if (settings.connectionId !== connectionId)
    throw new Error("Your Pika connection changed. Reopen Sync to Pika.");
  if (approvedClient) return approvedClient;
  const token = await MarkEdit.secretStorage.get(secretKey);
  if (!token) throw new Error("Connect to Pika first.");
  const client = new Pika(token);
  return client;
}
async function context(save = false) {
  const view = MarkEdit.editorView;
  const generation = saveGeneration;
  if (save && !(await MarkEdit.saveDocument())) return;
  let info = await MarkEdit.getFileInfo();
  if (generation !== saveGeneration) return;
  if (MarkEdit.editorView !== view) throw new Error("The document changed. Try again.");
  if (!info && save) {
    // MarkEdit can resolve while the first native Save panel is still open.
    // Wait silently only for this action, without adding another modal.
    const deadline = Date.now() + 120_000;
    while (generation === saveGeneration && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (generation !== saveGeneration) return;
      if (MarkEdit.editorView !== view) return;
      info = await MarkEdit.getFileInfo();
      if (generation !== saveGeneration || MarkEdit.editorView !== view) return;
      if (info) return { view, path: info.filePath };
    }
    return;
  }
  if (!info) throw new Error("Save this document first.");
  return { view, path: info.filePath };
}

async function mutate<T>(
  operation: Omit<Pending, "started">,
  action: () => Promise<T>,
  persist: (result: T) => Promise<void>,
) {
  if ((await store.read()).pending)
    throw new Error("Check your last post on Pika before trying again.");
  await store.edit((data) => {
    data.pending = { ...operation, started: new Date().toISOString() };
  });
  let accepted = false;
  try {
    await assertOperation();
    const result = await action();
    accepted = true;
    await persist(result);
    await store.edit((data) => {
      delete data.pending;
    });
    return result;
  } catch (error) {
    // Keep the journal after ambiguous network/server outcomes or failed local persistence.
    if (!accepted && error instanceof PikaError && error.status >= 400 && error.status < 500)
      await store.edit((data) => {
        delete data.pending;
      });
    throw error;
  }
}
async function conflict(client: Pika, link: Link, source?: Properties) {
  const remote = source ?? (await client.source(link.url)).properties;
  if (!link.baseline || stable(remote) !== stable(link.baseline))
    return confirm(
      "This post changed on Pika",
      "Replace it with the version in this document?",
      "Replace Post",
    );
  return true;
}
function livePostURL(value?: string) {
  if (!value) return;
  const url = new URL(httpsURL(value));
  // The shared Pika host serves its dashboard; blogs use subdomains or custom domains.
  if (["pika.page", "www.pika.page"].includes(url.hostname)) return;
  return url.href;
}
function showResult(ui: ReturnType<typeof mount>, message: string, url?: string) {
  ui.content.replaceChildren(el("p", message));
  const heading = ui.dialog.querySelector("h1");
  if (heading) heading.textContent = "Pika";
  ui.footer.replaceChildren();
  ui.report("");
  if (url)
    button(
      ui.footer,
      "Open in Pika",
      () => {
        openURL(url);
        ui.dialog.close();
      },
      true,
    );
}
async function synchronized(
  client: Pika,
  url: string,
  fallback: Properties,
  updated?: Source,
): Promise<Link> {
  const target =
    fallback["post-status"]?.[0] === "published" ? (livePostURL(updated?.url) ?? url) : url;
  try {
    const source = await client.source(target);
    return {
      url:
        source.properties["post-status"]?.[0] === "published"
          ? (livePostURL(source.url) ?? target)
          : target,
      baseline: source.properties,
    };
  } catch {
    return { url: target, baseline: undefined, lastSent: fallback };
  }
}

async function connect(after?: () => Promise<void>, replacing = false) {
  if (!MarkEdit.secretStorage) throw new Error("Update MarkEdit to connect to Pika.");
  const ui = mount(replacing ? "Replace Pika token" : "Connect to Pika");
  const token = field(ui.content, "App token", "", "password");
  token.autocomplete = "off";
  token.spellcheck = false;
  const help = el("a", "Get an app token");
  help.className = "token-help";
  help.href = "https://pika.page/manual/micropub#setup";
  help.target = "_blank";
  help.rel = "noopener noreferrer";
  help.setAttribute("aria-label", "Get an app token (opens in your browser)");
  ui.content.append(help);
  button(
    ui.footer,
    "Connect",
    () =>
      void ui
        .run(async () => {
          const next = token.value.trim();
          if (!next || /\s/.test(next)) throw new Error("Enter your app token.");
          const saved = await store.read();
          if (saved.pending)
            throw new Error("Resolve the interrupted Pika action before replacing your token.");
          const client = new Pika(next);
          ui.report("Connecting…");
          await client.config();
          const linked = Object.values(saved.links);
          if (linked.length) {
            const probe = linked.find((post) => !post.trashed);
            let verified = false;
            if (probe) {
              try {
                await client.source(probe.url);
                verified = true;
              } catch (error) {
                if (!(error instanceof PikaError) || error.status !== 404) throw error;
              }
            }
            if (
              !verified &&
              !(await confirm(
                "Is this token for the same Pika blog?",
                "Pika could not verify the blog from your saved posts. Replace the token only if it is for the same blog. To switch blogs, cancel and disconnect first.",
                "Replace Token",
              ))
            )
              return;
          }
          // Roll back a replacement if settings cannot be saved.
          let previousToken: string | undefined;
          if (await MarkEdit.secretStorage.has(secretKey))
            previousToken = await MarkEdit.secretStorage.get(secretKey);
          await assertOperation();
          await MarkEdit.secretStorage.set(secretKey, next);
          try {
            await store.edit((data) => {
              data.connectionId = crypto.randomUUID();
              delete data.blog;
            });
          } catch (error) {
            if (previousToken) await MarkEdit.secretStorage.set(secretKey, previousToken);
            else await MarkEdit.secretStorage.delete(secretKey);
            throw error;
          }
          token.value = "";
          ui.dialog.close();
          if (!after) await MarkEdit.showAlert({ title: "Connected to Pika" });
        }, token)
        .then(async () => {
          if (!ui.dialog.open && after) await after();
        })
        .catch((error) =>
          MarkEdit.showAlert({
            title: "Pika",
            message: error instanceof Error ? error.message : String(error),
          }),
        ),
  );
  token.focus();
}

async function prepareImages(
  markdown: string,
  path: string,
  client: Pika,
  report: (message: string) => void,
) {
  const references = images(markdown, path);
  const files = new Map<string, { blob: Blob; hash: string }>();
  for (const reference of references) {
    if (files.has(reference.path)) continue;
    const file = await MarkEdit.getFileObject(reference.path);
    if (!file)
      throw new Error(
        `Couldn’t read image: ${reference.path.split("/").pop()}. Check that it still exists.`,
      );
    const type = mime[reference.path.split(".").pop()?.toLowerCase() ?? ""];
    if (!type) throw new Error("Pika accepts JPEG, PNG, GIF, and WebP images.");
    const bytes = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    files.set(reference.path, { blob: new Blob([bytes], { type }), hash });
  }
  const urls = new Map<string, string>();
  let count = 0;
  const config = files.size ? await client.config() : {};
  const endpoint = config["media-endpoint"] ?? MEDIA;
  for (const [file, prepared] of files) {
    report(`Uploading image ${++count} of ${files.size}…`);
    const cached = (await store.read()).uploads[prepared.hash];
    await assertOperation();
    const url =
      cached ?? (await client.upload(prepared.blob, file.split("/").pop() ?? "image", endpoint));
    if (!cached)
      await store.edit((data) => {
        data.uploads[prepared.hash] = url;
      });
    urls.set(file, url);
  }
  return replaceImages(
    markdown,
    references.map((image) => ({ image, url: urls.get(image.path) as string })),
  );
}

async function recovery() {
  const settings = await store.read();
  const pending = settings.pending;
  if (!pending) return;
  const ui = mount("Check your last Pika action");
  const labels = {
    create: "Creating a draft",
    update: "Syncing changes",
    publish: "Publishing",
    draft: "Returning to draft",
    trash: "Moving to trash",
    restore: "Restoring from trash",
  };
  ui.content.append(
    el(
      "p",
      `${pending.action ? labels[pending.action] : "The last action"} didn’t finish. Check Pika before continuing.`,
    ),
  );
  let path = pending.path;
  const documentLabel = el(
    "p",
    path
      ? `Document: ${path.split("/").pop()}`
      : "Choose the original Markdown document to link this post.",
  );
  ui.content.append(documentLabel);
  if (!path)
    button(
      ui.content,
      "Choose Original Document…",
      () =>
        void ui.run(async () => {
          const selected = await MarkEdit.showOpenPanel({
            title: "Choose the original Markdown document",
            allowsMultipleSelection: false,
          });
          if (!selected?.[0]) return;
          path = selected[0];
          documentLabel.textContent = `Document: ${path.split("/").pop()}`;
        }),
    );
  const url = field(ui.content, "Post URL", pending.url ?? "", "url");
  const finish = async (change?: (data: Awaited<ReturnType<typeof store.read>>) => void) => {
    await store.edit((data) => {
      if (stable(data.pending) !== stable(pending) || data.connectionId !== settings.connectionId)
        throw new Error("The interrupted action changed. Reopen Pika.");
      change?.(data);
      delete data.pending;
    });
    ui.dialog.close();
  };
  button(ui.footer, "Open Pika", () => openURL(pending.url ?? "https://pika.page"));
  if (pending.action === "trash") {
    button(
      ui.footer,
      "Post Is in Trash",
      () =>
        void ui.run(async () => {
          if (!pending.path || !pending.url)
            throw new Error("The original post details are unavailable.");
          if (
            !(await confirm(
              "Did you check Pika’s trash?",
              "Only confirm if this post is in Pika’s trash.",
              "Confirm",
            ))
          )
            return;
          await finish((data) => {
            const original = data.links[pending.path as string];
            if (!original || original.url !== pending.url)
              throw new Error("The original post link changed.");
            original.trashed = true;
          });
        }),
      true,
    );
  } else {
    button(
      ui.footer,
      "Link Post",
      () =>
        void ui.run(async () => {
          if (!path) throw new Error("Choose the original Markdown document first.");
          const client = await api(settings.connectionId);
          const post = httpsURL(url.value.trim());
          const source = await client.source(post);
          const target =
            source.properties["post-status"]?.[0] === "published"
              ? (livePostURL(source.url) ?? post)
              : post;
          await finish((data) => {
            data.links[path as string] = {
              ...data.links[path as string],
              url: target,
              baseline: source.properties,
              trashed: false,
            };
          });
        }),
      true,
    );
  }
  const wasCreation = pending.action === "create";
  button(
    ui.footer,
    wasCreation ? "No post was created" : "I’ve Checked Pika",
    () =>
      void ui.run(async () => {
        if (
          !(await confirm(
            wasCreation ? "Start a new post?" : "Clear this interrupted action?",
            wasCreation
              ? "Only continue if you checked Pika and no post was created."
              : "Only continue after checking the result on Pika. The action will not be retried automatically.",
            "Continue",
          ))
        )
          return;
        await finish();
      }),
  );
}

async function syncToPika(): Promise<void> {
  if (sheet?.open) {
    sheet.focus();
    return;
  }
  if (!MarkEdit.secretStorage) return connect(() => syncToPika());
  if (!(await MarkEdit.secretStorage.has(secretKey))) return connect(() => syncToPika());
  if ((await store.read()).pending) return recovery();
  const loaded = await context(true);
  if (!loaded) return;
  const doc = loaded;
  const settings = await store.read();
  const link = settings.links[doc.path];
  let savedContent = doc.view.state.doc.toString();
  const initial = splitTitle(savedContent);
  const ui = mount("Sync to Pika");
  // Only a new post needs metadata setup. Linked posts update in place.
  const title = link ? undefined : field(ui.content, "Title", initial.title);
  let date: HTMLInputElement | undefined;
  if (!link) {
    const details = el("details");
    details.append(el("summary", "Publication date"));
    ui.content.append(details);
    date = field(details, "Date", "", "datetime-local");
  }
  let cachedClient: Pika | undefined;
  ui.dialog.addEventListener(
    "close",
    () => {
      cachedClient = undefined;
    },
    { once: true },
  );
  async function submit() {
    await ui.run(async () => {
      if (!doc.view.state.doc.toString().trim()) throw new Error("Write your post first.");
      const currentInfo = await MarkEdit.getFileInfo();
      if (MarkEdit.editorView !== doc.view || currentInfo?.filePath !== doc.path)
        throw new Error("The document changed. Reopen Sync to Pika.");
      // The first-sync sheet may stay open; save again if its document changed.
      if (doc.view.state.doc.toString() !== savedContent) {
        const saved = await context(true);
        if (!saved) return;
        if (saved.view !== doc.view || saved.path !== doc.path)
          throw new Error("The document changed. Reopen Sync to Pika.");
        savedContent = doc.view.state.doc.toString();
      }
      const latest = await store.read();
      if (latest.connectionId !== settings.connectionId)
        throw new Error("Your Pika connection changed. Reopen Sync to Pika.");
      if (stable(latest.links[doc.path]) !== stable(link))
        throw new Error("This post was updated in another window. Reopen Sync to Pika.");
      cachedClient ??= await api(settings.connectionId);
      const client = cachedClient;
      let targetLink: Link | undefined = link;
      let wasPublished = false;
      let restored = false;
      if (link?.trashed) {
        if (
          !(await confirm(
            "This post is in Pika’s trash",
            "Would you like to restore it and sync your changes to the draft?",
            "Restore and Sync",
          ))
        )
          return;
        ui.report("Restoring draft…");
        await mutate(
          { url: link.url, path: doc.path, action: "restore" },
          () => client.restore(link.url),
          async () => {
            const next = await synchronized(client, link.url, {
              ...link.baseline,
              "post-status": ["draft"],
            });
            await store.edit((data) => {
              data.links[doc.path] = { ...link, ...next, trashed: false };
            });
          },
        );
        restored = true;
      }

      if (link) {
        let remote: Properties | undefined;
        try {
          remote = (await client.source(link.url)).properties;
        } catch (error) {
          if (!(error instanceof PikaError) || error.status !== 404) throw error;
          if (
            !(await confirm(
              "This post is no longer on Pika",
              "Create a new draft from this document?",
              "Create New Draft",
            ))
          )
            return;
          targetLink = undefined;
        }
        if (remote?.["post-status"]?.[0] === "published") {
          wasPublished = true;
          if (
            !(await confirm(
              "Update published post?",
              "This post is already published. Are you sure you want to update it?",
              "Update Post",
            ))
          )
            return;
        } else if (remote && !restored && !(await conflict(client, link, remote))) return;
      }
      const snapshot = splitTitle(doc.view.state.doc.toString());
      if (!snapshot.body.trim()) throw new Error("Write your post first.");
      const props: Properties = { content: [snapshot.body] };
      // Creation is always private; updates preserve the server's existing status.
      if (!targetLink) props["post-status"] = ["draft"];
      const postTitle = title?.value.trim() ?? link?.titleOverride ?? snapshot.title;
      if (postTitle) props.name = [postTitle];
      const remove: (keyof Properties)[] = !props.name ? ["name"] : [];
      // Omitting the date on updates preserves Pika's current value.
      if (date?.value.trim()) {
        const parsed = new Date(date.value);
        if (!Number.isFinite(parsed.getTime())) throw new Error("Enter a valid publication date.");
        props.published = [parsed.toISOString()];
      }
      ui.report("Preparing post…");
      props.content = [await prepareImages(snapshot.body, doc.path, client, ui.report)];
      ui.report(wasPublished ? "Updating post…" : "Saving draft…");
      const save = async (url: string) => {
        const next = await synchronized(client, url, {
          ...props,
          "post-status": [wasPublished ? "published" : "draft"],
        });
        if (postTitle !== snapshot.title) next.titleOverride = postTitle;
        await store.edit((data) => {
          data.links[doc.path] = next;
        });
      };
      let resultURL = targetLink?.url;
      if (targetLink) {
        const existingURL = targetLink.url;
        await mutate(
          { url: existingURL, path: doc.path, action: "update" },
          () =>
            client.update(existingURL, {
              replace: props,
              ...(remove.length ? { delete: remove } : {}),
            }),
          async () => save(existingURL),
        );
      } else {
        resultURL = await mutate(
          { path: doc.path, action: "create" },
          () => client.create(props),
          save,
        );
      }
      showResult(ui, wasPublished ? "Post updated." : "Draft saved.", resultURL);
    });
  }
  if (link) {
    ui.report("Syncing post…");
    await submit();
    // A canceled confirmation leaves no form or action to complete.
    if (
      ui.dialog.open &&
      !ui.footer.children.length &&
      !ui.content.children.length &&
      !ui.dialog.querySelector(".status.error")
    )
      ui.dialog.close();
  } else {
    button(ui.footer, "Save Draft", () => void submit(), true);
    title?.focus();
  }
}

type PostAction = "open" | "publish" | "draft" | "trash" | "restore" | "new";
type ManagementApproval = {
  client?: Pika;
  connectionId?: string;
  path: string;
  url: string;
};
async function manage(action: PostAction, approval: ManagementApproval) {
  if (sheet?.open) {
    sheet.focus();
    return;
  }
  const settings = await store.read();
  if (settings.pending) return recovery();
  if (!(await MarkEdit.secretStorage.has(secretKey))) return connect();
  await exclusive(async () => {
    const doc = await context(action === "publish");
    if (!doc) return;
    const link = settings.links[doc.path];
    if (
      settings.connectionId !== approval.connectionId ||
      doc.path !== approval.path ||
      link?.url !== approval.url
    )
      throw new Error("This post or account changed. Reopen Manage Post.");
    if (action === "open") {
      if (!link) throw new Error("Sync this document to Pika first.");
      openURL(link.url);
      return;
    }
    if (action === "new") {
      if (
        !link ||
        !(await confirm(
          "Create a separate draft?",
          "The existing Pika post will be kept.",
          "Continue",
        ))
      )
        return;
      await store.edit((data) => {
        if (doc) delete data.links[doc.path];
      });
      return;
    }
    const client = await api(approval.connectionId, approval.client);
    if (!link) throw new Error("Sync or link this document to Pika first.");
    if (action === "publish") {
      const remote = (await client.source(link.url)).properties;
      if (remote["post-status"]?.[0] !== "draft")
        throw new Error("Only a saved draft can be published.");
      if (!(await conflict(client, link, remote))) return;
    }
    if (action === "draft" && !(await conflict(client, link))) return;
    const wording = {
      publish: [
        "Publish this post?",
        "Your document will be synced to the Pika draft, then published on your live site.",
        "Publish",
      ],
      draft: ["Return to draft?", "The post will no longer be public.", "Return to Draft"],
      trash: ["Move post to trash?", "Pika removes trashed posts after 30 days.", "Move to Trash"],
      restore: ["Restore post?", "The post will return as a draft.", "Restore"],
    }[action];
    if (!(await confirm(wording[0], wording[1], wording[2]))) return;
    let savedLink = link;
    const perform = async () => {
      await mutate(
        { url: savedLink.url, path: doc.path, action },
        async () => {
          if (action === "trash") await client.trash(savedLink.url);
          else if (action === "restore") await client.restore(savedLink.url);
          else
            return client.update(savedLink.url, {
              replace: { "post-status": [action === "publish" ? "published" : "draft"] },
            });
        },
        async (updated) => {
          const next =
            action === "trash"
              ? { ...link, trashed: true }
              : await synchronized(
                  client,
                  savedLink.url,
                  {
                    ...savedLink.baseline,
                    "post-status": [action === "publish" ? "published" : "draft"],
                  },
                  updated || undefined,
                );
          savedLink = next;
          await store.edit((data) => {
            if (doc) data.links[doc.path] = { ...link, ...next, trashed: action === "trash" };
          });
        },
      );
    };
    if (action === "publish") {
      const ui = mount("Pika");
      await ui.run(
        async () => {
          ui.report("Syncing draft…");
          const text = doc.view.state.doc.toString();
          const snapshot = splitTitle(text);
          if (!snapshot.body.trim()) throw new Error("Write your post first.");
          const props: Properties = {
            content: [await prepareImages(snapshot.body, doc.path, client, ui.report)],
          };
          const postTitle = link.titleOverride ?? snapshot.title;
          if (postTitle) props.name = [postTitle];
          ui.report("Syncing draft…");
          await mutate(
            { url: link.url, path: doc.path, action: "update" },
            () =>
              client.update(link.url, {
                replace: props,
                ...(!props.name ? { delete: ["name"] } : {}),
              }),
            async (updated) => {
              const next = await synchronized(
                client,
                link.url,
                { ...props, "post-status": ["draft"] },
                updated,
              );
              savedLink = { ...link, ...next };
              await store.edit((data) => {
                data.links[doc.path] = savedLink;
              });
            },
          );
          const synced = await client.source(savedLink.url);
          if (synced.properties["post-status"]?.[0] !== "draft")
            throw new Error(
              "The draft’s status changed on Pika. Check the post before continuing.",
            );
          ui.report("Publishing post…");
          await perform();
          showResult(ui, "Post published.", livePostURL(savedLink.url));
        },
        undefined,
        true,
      );
      return;
    }
    await perform();
    await MarkEdit.showAlert({
      title:
        action === "trash"
          ? "Post moved to trash"
          : action === "restore"
            ? "Post restored"
            : "Post saved as draft",
    });
  });
}
async function manageMenu() {
  clearManagementApproval();
  if (sheet?.open) {
    sheet.focus();
    return;
  }
  const settings = await store.read();
  if (settings.pending) return recovery();
  const info = await MarkEdit.getFileInfo();
  const link = info && settings.links[info.filePath];
  if (!info || !link) return;
  const doc = { path: info.filePath, view: MarkEdit.editorView };
  let approvedClient: Pika | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  const release = () => {
    approvedClient = undefined;
    if (expiry) clearTimeout(expiry);
    if (clearManagementApproval === release) clearManagementApproval = () => {};
  };
  const postCommand = (title: string, action: PostAction) =>
    command(title, () => {
      const client = approvedClient;
      release();
      return manage(action, {
        client,
        connectionId: settings.connectionId,
        path: doc.path,
        url: link.url,
      });
    });
  const items = [];
  if (link.trashed) {
    items.push(postCommand("Restore from Trash…", "restore"));
  } else {
    const remote = await exclusive(async () => {
      const client = await api(settings.connectionId);
      try {
        const source = await client.source(link.url);
        approvedClient = client;
        return source.properties;
      } catch (error) {
        if (error instanceof PikaError && error.status === 404) return undefined;
        throw error;
      }
    });
    if (!remote) {
      items.push(
        command("Create New Draft…", async () => {
          if (
            !(await confirm(
              "This post is no longer on Pika",
              "Start a new draft from this document?",
              "Create New Draft",
            ))
          )
            return;
          await exclusive(async () => {
            await store.edit((data) => {
              if (data.links[doc.path]?.url === link.url) delete data.links[doc.path];
            });
          });
          await syncToPika();
        }),
      );
    } else {
      items.push(postCommand("Open on Pika", "open"));
      if (remote["post-status"]?.[0] === "published")
        items.push(postCommand("Return to Draft…", "draft"));
      else if (remote["post-status"]?.[0] === "draft")
        items.push(postCommand("Publish…", "publish"));
      items.push(postCommand("Move to Trash…", "trash"));
      items.push(postCommand("Create Separate Draft…", "new"));
    }
  }
  // MarkEdit has no context-menu dismissal callback. Bound canceled-menu retention,
  // and discard immediately on selection, another Pika command, or page teardown.
  clearManagementApproval = release;
  expiry = setTimeout(release, 60_000);
  const view = doc.view;
  MarkEdit.showContextMenu(
    items.map((item) => ({
      ...item,
      action: () => {
        if (MarkEdit.editorView !== view) {
          release();
          return;
        }
        item.action();
      },
    })),
  );
}
async function account() {
  if (sheet?.open) {
    sheet.focus();
    return;
  }
  if (!MarkEdit.secretStorage || !(await MarkEdit.secretStorage.has(secretKey))) return connect();
  if ((await store.read()).pending) return recovery();
  const ui = mount("Pika account");
  ui.content.append(el("p", "Connected to Pika."));
  button(ui.footer, "Replace Token…", async () => {
    ui.dialog.close();
    await connect(undefined, true);
  });
  button(
    ui.footer,
    "Disconnect…",
    () =>
      void ui.run(async () => {
        if (
          !(await confirm(
            "Disconnect Pika?",
            "Your posts will stay on Pika. Local post links and upload history will be cleared. To renew a token for the same blog, choose Replace Token instead.",
            "Disconnect",
          ))
        )
          return;
        const previousToken = await MarkEdit.secretStorage.get(secretKey);
        await assertOperation();
        await MarkEdit.secretStorage.delete(secretKey);
        try {
          await store.edit((data) => {
            data.connectionId = crypto.randomUUID();
            delete data.blog;
            data.links = {};
            data.uploads = {};
          });
        } catch (error) {
          if (previousToken) await MarkEdit.secretStorage.set(secretKey, previousToken);
          throw error;
        }
        ui.dialog.close();
      }),
  );
}
function requireHostSupport() {
  if (
    !MarkEdit.secretStorage?.get ||
    !MarkEdit.secretStorage.set ||
    !MarkEdit.secretStorage.has ||
    !MarkEdit.secretStorage.delete
  )
    throw new Error(
      "MarkEdit’s Keychain API is unavailable to this extension. Update MarkEdit, then restart it.",
    );
  if (typeof MarkEdit.saveDocument !== "function")
    throw new Error(
      "MarkEdit’s document-saving API is unavailable. Update MarkEdit, then restart it.",
    );
  if (typeof MarkEdit.showContextMenu !== "function")
    throw new Error(
      "MarkEdit’s context-menu API is unavailable. Update MarkEdit, then restart it.",
    );
  if (typeof indexedDB === "undefined")
    throw new Error(
      "Local operation storage is unavailable in this MarkEdit window. Restart MarkEdit and try again.",
    );
}

function command(title: string, action: () => Promise<void>) {
  return {
    title,
    action: () => {
      saveGeneration++;
      void Promise.resolve()
        .then(() => {
          requireHostSupport();
          return action();
        })
        .catch((error) =>
          MarkEdit.showAlert({
            title: "Pika",
            message: error instanceof Error ? error.message : String(error),
          }),
        )
        .finally(refreshManageState);
    },
  };
}
MarkEdit.onEditorReady(() => {
  canManagePost = false;
  void refreshManageState();
});
window.addEventListener("pagehide", () => {
  saveGeneration++;
  clearManagementApproval();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") saveGeneration++;
});
window.addEventListener("focus", () => void refreshManageState());
MarkEdit.addMainMenuItem({
  title: "Pika",
  children: [
    {
      ...command("Sync to Pika…", async () => {
        clearManagementApproval();
        await syncToPika();
      }),
      key: "b",
      modifiers: ["Control", "Option", "Command"],
    },
    { separator: true },
    {
      ...command("Manage Post…", manageMenu),
      state: () => {
        void refreshManageState();
        return { isEnabled: canManagePost };
      },
    },
    { separator: true },
    command("Account…", async () => {
      clearManagementApproval();
      await account();
    }),
  ],
});
