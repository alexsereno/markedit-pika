// IndexedDB read/write transactions serialize lock acquisition across MarkEdit windows.
// Unlike Web Locks, IndexedDB is exposed by MarkEdit's loadHTMLString WebView.
const databaseName = "markedit-pika.runtime";
const table = "operations";
const key = "pika";
const leaseMs = 120_000;
let database: Promise<IDBDatabase> | undefined;
let active: { id: string; lost: boolean } | undefined;

function openDatabase() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(table);
    request.onerror = () => reject(new Error("Pika could not open its local operation lock."));
    request.onblocked = () => reject(new Error("Close other MarkEdit windows and try Pika again."));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        database = undefined;
      };
      resolve(db);
    };
  }).catch((error) => {
    database = undefined;
    throw error;
  });
  return database;
}

async function lease(id: string, mode: "acquire" | "renew" | "release") {
  const db = await openDatabase();
  return new Promise<boolean>((resolve, reject) => {
    const transaction = db.transaction(table, "readwrite");
    const store = transaction.objectStore(table);
    let allowed = false;
    transaction.oncomplete = () => resolve(allowed);
    transaction.onabort = transaction.onerror = () =>
      reject(new Error("Pika’s operation lock could not be saved."));
    const request = store.get(key);
    request.onsuccess = () => {
      const previous = request.result as { id: string; expires: number } | undefined;
      if (mode === "release") {
        if (previous?.id === id) store.delete(key);
        allowed = true;
        return;
      }
      const now = Date.now();
      allowed =
        mode === "acquire"
          ? !previous || previous.expires <= now
          : previous?.id === id && previous.expires > now;
      if (allowed) store.put({ id, expires: now + leaseMs }, key);
    };
  });
}

export async function assertOperation() {
  const current = active;
  if (!current || current.lost || !(await lease(current.id, "renew"))) {
    if (current) current.lost = true;
    throw new Error("This Pika operation expired. Check Pika before trying again.");
  }
}

export async function withOperation<T>(action: () => Promise<T>): Promise<T> {
  if (active) throw new Error("Finish the other Pika action first.");
  const current = { id: crypto.randomUUID(), lost: false };
  if (!(await lease(current.id, "acquire")))
    throw new Error("Pika is busy in another window. Try again shortly.");
  active = current;
  const timer = setInterval(() => {
    void lease(current.id, "renew")
      .then((allowed) => {
        if (!allowed) current.lost = true;
      })
      .catch(() => {
        current.lost = true;
      });
  }, 30_000);
  try {
    return await action();
  } finally {
    clearInterval(timer);
    active = undefined;
    // Release only this owner's lease; a failed release expires naturally.
    await lease(current.id, "release").catch(() => {});
  }
}
