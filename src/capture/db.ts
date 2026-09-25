export type CapturePhase = "recording" | "saved" | "uploading" | "processing" | "done" | "error";

export type CaptureRecord = {
  id: string;
  filename: string;
  mime: string;
  createdAt: string;
  status: CapturePhase;
  totalChunks: number;
  uploadId: string | null;
  error: string | null;
};

const DB_NAME = "atmosphere-scope";
const DB_VERSION = 1;

function request<T>(query: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    query.onsuccess = () => resolve(query.result);
    query.onerror = () => reject(query.error ?? new Error("IndexedDB request failed."));
  });
}

export function openCaptureDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("captures")) db.createObjectStore("captures", { keyPath: "id" });
      if (!db.objectStoreNames.contains("chunks")) {
        const chunks = db.createObjectStore("chunks", { keyPath: "id" });
        chunks.createIndex("captureId", "captureId", { unique: false });
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error("IndexedDB did not open."));
  });
}

export async function putCapture(record: CaptureRecord): Promise<void> {
  const db = await openCaptureDb();
  await request(db.transaction("captures", "readwrite").objectStore("captures").put(record));
  db.close();
}

export async function getCapture(id: string): Promise<CaptureRecord | null> {
  const db = await openCaptureDb();
  const record = await request(db.transaction("captures").objectStore("captures").get(id) as IDBRequest<CaptureRecord | undefined>);
  db.close();
  return record ?? null;
}

export async function listPendingCaptures(): Promise<CaptureRecord[]> {
  const db = await openCaptureDb();
  const records = await request(db.transaction("captures").objectStore("captures").getAll() as IDBRequest<CaptureRecord[]>);
  db.close();
  return records.filter((record) => record.status !== "done");
}

export async function saveChunk(captureId: string, index: number, blob: Blob): Promise<void> {
  const db = await openCaptureDb();
  await request(db.transaction("chunks", "readwrite").objectStore("chunks").put({ id: `${captureId}:${index}`, captureId, index, blob }));
  db.close();
}

export async function readChunk(captureId: string, index: number): Promise<Blob | null> {
  const db = await openCaptureDb();
  const row = await request(db.transaction("chunks").objectStore("chunks").get(`${captureId}:${index}`) as IDBRequest<{ blob?: Blob } | undefined>);
  db.close();
  return row?.blob ?? null;
}

export async function chunkCount(captureId: string): Promise<number> {
  const db = await openCaptureDb();
  const index = db.transaction("chunks").objectStore("chunks").index("captureId");
  const count = await request(index.count(IDBKeyRange.only(captureId)));
  db.close();
  return count;
}
