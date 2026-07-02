// IndexedDB — the application's local database.
// One repository object per object store; add stores by bumping DB_VERSION.

const DB_NAME = "outerbound";
const DB_VERSION = 8;

export type Lead = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  company: string;
  website: string;
  email: string;
  phone: string;
  linkedin: string;
  country: string;
  city: string;
  industry: string;
  jobTitle: string;
  source: string;
  tags: string[];
  notes: string;
  importedAt: string;
  updatedAt: string;
};

export type Template = {
  id: string;
  name: string;
  subject: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type Campaign = {
  id: string;
  name: string;
  description: string;
  templateId: string;
  leadIds: string[];
  leadCount: number;
  createdAt: string;
  updatedAt: string;
};

export type SmtpEncryption = "none" | "ssl" | "starttls";

export type SmtpAccount = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: SmtpEncryption;
  senderName: string;
  senderEmail: string;
  replyTo: string;
  dailyLimit: number; // 0 = no limit
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type QueueStatus = "pending" | "sending" | "sent" | "failed" | "cancelled";

export type QueueItem = {
  id: string;
  campaignId: string;
  leadId: string;
  templateId: string;
  smtpAccountId: string;
  email: string; // snapshot at queue time
  status: QueueStatus;
  attempts: number;
  error: string;
  sentAt: string | null;
  lastAttemptAt?: number;
  nextRetryAt?: number;
  createdAt: string;
};

export type ConversationStatus = "waiting" | "replied" | "closed";
export type MessageType = "outgoing" | "incoming" | "system";

export type ConversationMessage = {
  id: string;
  type: MessageType;
  subject?: string;
  body: string;
  at: string;
};

export type Conversation = {
  id: string;
  leadId: string;
  campaignId: string;
  subject: string;
  lastMessage: string;
  status: ConversationStatus;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
};

// Permanent, immutable send history. QueueItems are temporary;
// Reports read only EmailLogs.
export type EmailLog = {
  id: string;
  queueItemId: string;
  campaignId: string;
  leadId: string;
  templateId: string;
  smtpId: string;
  recipient: string;
  subject: string;
  status: "sent" | "failed";
  sentAt: string;
  duration: number; // ms
  attempts: number;
  error: string;
};

export type AppSettings = {
  id: string; // single record: "app"
  appName: string;
  timezone: string;
  dateFormat: string;
  defaultSmtpId: string; // "" = use the account marked Default
  batchSize: number;
  defaultDelaySeconds: number;
  stopOnFirstError: boolean;
  defaultSource: string;
  rememberMapping: boolean;
  skipDuplicateDetection: boolean;
  theme: "light" | "dark" | "system";
  density: "compact" | "comfortable";
  updatedAt: string;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("leads")) {
          const store = db.createObjectStore("leads", { keyPath: "id" });
          store.createIndex("email", "email", { unique: false });
        }
        if (!db.objectStoreNames.contains("templates")) {
          db.createObjectStore("templates", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("campaigns")) {
          db.createObjectStore("campaigns", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("smtp")) {
          db.createObjectStore("smtp", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("queue")) {
          db.createObjectStore("queue", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("conversations")) {
          db.createObjectStore("conversations", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("emailLogs")) {
          db.createObjectStore("emailLogs", { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("Failed to open the local database"));
    });
  }
  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(message));
  });
}

function txDone(tx: IDBTransaction, message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(message));
    tx.onabort = () => reject(tx.error ?? new Error(message));
  });
}

// Generic repository for simple id-keyed stores.
function storeRepo<T extends { id: string }>(storeName: string) {
  return {
    async getAll(): Promise<T[]> {
      const db = await openDb();
      const tx = db.transaction(storeName, "readonly");
      return requestToPromise(
        tx.objectStore(storeName).getAll() as IDBRequest<T[]>,
        `Failed to read ${storeName}`
      );
    },

    async put(value: T): Promise<void> {
      const db = await openDb();
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(value);
      await txDone(tx, `Failed to save ${storeName}`);
    },

    async remove(id: string): Promise<void> {
      const db = await openDb();
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(id);
      await txDone(tx, `Failed to delete ${storeName}`);
    },

    async putMany(values: T[]): Promise<void> {
      const db = await openDb();
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      for (const value of values) store.put(value);
      await txDone(tx, `Failed to save ${storeName}`);
    },

    async removeMany(ids: string[]): Promise<void> {
      const db = await openDb();
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      for (const id of ids) store.delete(id);
      await txDone(tx, `Failed to delete ${storeName}`);
    },
  };
}

export const templatesRepo = storeRepo<Template>("templates");
export const campaignsRepo = storeRepo<Campaign>("campaigns");
export const smtpRepo = storeRepo<SmtpAccount>("smtp");
export const queueRepo = storeRepo<QueueItem>("queue");
export const conversationsRepo = storeRepo<Conversation>("conversations");
export const settingsRepo = storeRepo<AppSettings>("settings");
export const emailLogsRepo = storeRepo<EmailLog>("emailLogs");

const leadsBase = storeRepo<Lead>("leads");

export const leadsRepo = {
  ...leadsBase,
  update: (lead: Lead) => leadsBase.put(lead),
  addMany: (leads: Lead[]) => leadsBase.putMany(leads),
};
