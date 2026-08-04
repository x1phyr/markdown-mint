import type { Locale, OutputFormat } from "./export-types";

export interface DraftRecord {
  accentColor: string;
  author: string;
  features: {
    cover: boolean;
    footer: boolean;
    header: boolean;
    pageNumber: boolean;
    toc: boolean;
  };
  fileName: string;
  id: "active";
  locale: Locale;
  markdown: string;
  margin: "compact" | "normal" | "relaxed";
  orientation: "landscape" | "portrait";
  outputFormat: OutputFormat;
  pageSize: "A4" | "Letter";
  selectedThemeId: string;
  subtitle: string;
  title: string;
  updatedAt: number;
}

export function openDraftDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open("markdown-mint", 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("drafts")) {
        database.createObjectStore("drafts", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb-open-failed"));
  });
}

export async function readDraft(database: IDBDatabase): Promise<DraftRecord | undefined> {
  const request = database.transaction("drafts", "readonly").objectStore("drafts").get("active");
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as DraftRecord | undefined);
    request.onerror = () => reject(request.error ?? new Error("indexeddb-read-failed"));
  });
}

export async function writeDraft(database: IDBDatabase, record: DraftRecord): Promise<void> {
  const transaction = database.transaction("drafts", "readwrite");
  transaction.objectStore("drafts").put(record);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("indexeddb-write-failed"));
  });
}

export async function deleteDraft(database: IDBDatabase): Promise<void> {
  const transaction = database.transaction("drafts", "readwrite");
  transaction.objectStore("drafts").delete("active");
  await new Promise<void>((resolve) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}
