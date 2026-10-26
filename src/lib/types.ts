export type TaskMode = 'search' | 'links' | 'country';
export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type BrowserMode = 'auto' | 'visible' | 'hidden';
export type NoticeType = 'info' | 'warning' | 'error';

export interface Socials {
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  twitter?: string;
  youtube?: string;
  tiktok?: string;
  [key: string]: string | undefined;
}

export interface Review {
  id: string;
  author: string;
  rating: number | null;
  date: string;
  text: string;
  ownerResponse: string;
  ownerResponseDate: string;
  authorUrl: string;
  photos: number;
  meta: string;
}

export interface Business {
  id: string;
  name: string;
  category: string;
  address: string;
  phone: string;
  website: string;
  rating: number | null;
  reviewCount: number | null;
  mapsUrl: string;
  placeId: string | null;
  cid?: string | null;
  latitude: number | null;
  longitude: number | null;
  plusCode: string;
  hours: string;
  priceLevel: string;
  sourceQuery: string;
  collectedAt: string;
  email: string | null;
  emails: string[];
  socials: Socials;
  reviews: Review[];
  reviewsTotal: number | null;
  reviewsLimited: boolean;
  enrichment?: { pagesChecked: number; error: string | null } | null;
}

export interface TaskOptions {
  maxResults: number;
  maxResultsPerCity: number;
  reviews: boolean;
  maxReviews: number;
  enrich: boolean;
  browserMode: BrowserMode;
}

export interface TaskInput {
  query?: string;
  links?: string[];
  businessType?: string;
  country?: string;
  cities?: string[];
}

export interface TaskProgress {
  phase: string;
  percent: number;
  message: string;
  current: number;
  total: number;
  found: number;
}

export interface TaskCounts {
  results: number;
  withEmail: number;
  withWebsite: number;
  reviews: number;
  avgRating: number;
}

export interface TaskError {
  code: string;
  message: string;
}

export interface Notice {
  type: NoticeType;
  message: string;
}

export interface LogEntry {
  time: string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'success' | string;
  message: string;
}

export interface TaskSummary {
  id: string;
  title: string;
  mode: TaskMode;
  status: TaskStatus;
  input: TaskInput;
  options: TaskOptions;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  progress: TaskProgress;
  counts: TaskCounts;
  error: TaskError | null;
  notices: Notice[];
}

export interface Task extends TaskSummary {
  logs: LogEntry[];
  results: Business[];
}

export interface Settings {
  maxResults: number;
  maxResultsPerCity: number;
  reviews: boolean;
  maxReviews: number;
  enrich: boolean;
  browserMode: BrowserMode;
  apiPort: number;
  apiToken: string;
  minimizeBrowser: boolean;
  windowBounds?: { x: number; y: number; width: number; height: number } | null;
}

export interface ChromeInfo {
  found: boolean;
  name: string | null;
  path: string | null;
  version: string | null;
  channel: string | null;
}

export interface ApiInfo {
  url: string | null;
  port: number | null;
  error: string | null;
}

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  packaged: boolean;
  paths: { dataDir: string; profileDir: string; documents: string };
  chrome: ChromeInfo;
  api: ApiInfo;
  apiTokenRequired: boolean;
  activeTaskId: string | null;
  disclaimer: string;
  reviewNote: string;
}

export interface CreateTaskPayload {
  mode: TaskMode;
  query?: string;
  links?: string | string[];
  businessType?: string;
  country?: string;
  cities?: string[];
  options?: Partial<TaskOptions>;
}

export interface ExportResult {
  saved: boolean;
  path?: string;
  filename?: string;
}

export interface SignInCheck {
  signedIn: boolean;
  error?: string;
}

export interface BridgeResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface MapScraperBridge {
  platform: string;
  app: {
    info: () => Promise<BridgeResponse<AppInfo>>;
    openExternal: (url: string) => Promise<BridgeResponse<boolean>>;
    openDataFolder: () => Promise<BridgeResponse<boolean>>;
    openProfileFolder: () => Promise<BridgeResponse<boolean>>;
    copyText: (text: string) => Promise<BridgeResponse<boolean>>;
    openSignIn: () => Promise<BridgeResponse<boolean>>;
    checkSignIn: () => Promise<BridgeResponse<SignInCheck>>;
  };
  tasks: {
    list: () => Promise<BridgeResponse<TaskSummary[]>>;
    get: (id: string) => Promise<BridgeResponse<Task>>;
    create: (payload: CreateTaskPayload) => Promise<BridgeResponse<TaskSummary>>;
    cancel: (id: string) => Promise<BridgeResponse<boolean>>;
    delete: (id: string) => Promise<BridgeResponse<boolean>>;
    rerun: (id: string) => Promise<BridgeResponse<TaskSummary>>;
    export: (id: string, kind: 'leads' | 'reviews') => Promise<BridgeResponse<ExportResult>>;
    clearAll: () => Promise<BridgeResponse<boolean>>;
  };
  settings: {
    get: () => Promise<BridgeResponse<Settings>>;
    save: (patch: Partial<Settings>) => Promise<BridgeResponse<{ settings: Settings; api: ApiInfo }>>;
  };
  onTaskUpdate: (callback: (summary: TaskSummary) => void) => () => void;
  onTaskLog: (callback: (payload: { taskId: string; entry: LogEntry }) => void) => () => void;
  onTaskResult: (callback: (payload: { taskId: string; result: Business }) => void) => () => void;
  onTaskDone: (callback: (payload: { taskId: string; status: TaskStatus; summary: TaskSummary }) => void) => () => void;
  onTaskRemoved: (callback: (payload: { taskId: string }) => void) => () => void;
  onTasksCleared: (callback: () => void) => () => void;
  onAppError: (callback: (payload: { message: string }) => void) => () => void;
  onApiInfo: (callback: (payload: ApiInfo & { tokenRequired?: boolean }) => void) => () => void;
}
