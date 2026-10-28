import type {
  AppInfo,
  BridgeResponse,
  CreateTaskPayload,
  ExportResult,
  LicenseInfo,
  MapScraperBridge,
  Settings,
  SignInCheck,
  Task,
  TaskSummary,
} from './types';

function bridge(): MapScraperBridge {
  if (!window.mapscraper) {
    throw new Error('Step in Scraper must be opened from its desktop app window.');
  }
  return window.mapscraper;
}

export const isDesktop = () => Boolean(window.mapscraper);

async function unwrap<T>(promise: Promise<BridgeResponse<T>>): Promise<T> {
  const response = await promise;
  if (!response || !response.ok) {
    throw new Error(response?.error || 'Something went wrong. Please try again.');
  }
  return response.data as T;
}

const noopSubscription = () => () => {};

export const api = {
  appInfo: (): Promise<AppInfo> => unwrap(bridge().app.info()),
  openExternal: (url: string): Promise<boolean> => unwrap(bridge().app.openExternal(url)),
  openDataFolder: (): Promise<boolean> => unwrap(bridge().app.openDataFolder()),
  openProfileFolder: (): Promise<boolean> => unwrap(bridge().app.openProfileFolder()),
  copyText: (text: string): Promise<boolean> => unwrap(bridge().app.copyText(text)),
  openSignIn: (): Promise<boolean> => unwrap(bridge().app.openSignIn()),
  checkSignIn: (): Promise<SignInCheck> => unwrap(bridge().app.checkSignIn()),

  listTasks: (): Promise<TaskSummary[]> => unwrap(bridge().tasks.list()),
  getTask: (id: string): Promise<Task> => unwrap(bridge().tasks.get(id)),
  createTask: (payload: CreateTaskPayload): Promise<TaskSummary> => unwrap(bridge().tasks.create(payload)),
  cancelTask: (id: string): Promise<boolean> => unwrap(bridge().tasks.cancel(id)),
  deleteTask: (id: string): Promise<boolean> => unwrap(bridge().tasks.delete(id)),
  rerunTask: (id: string): Promise<TaskSummary> => unwrap(bridge().tasks.rerun(id)),
  exportTask: (id: string, kind: 'leads' | 'reviews'): Promise<ExportResult> =>
    unwrap(bridge().tasks.export(id, kind)),
  clearTasks: (): Promise<boolean> => unwrap(bridge().tasks.clearAll()),

  getSettings: (): Promise<Settings> => unwrap(bridge().settings.get()),
  saveSettings: (patch: Partial<Settings>): Promise<{ settings: Settings }> =>
    unwrap(bridge().settings.save(patch)),

  getLicenseInfo: (): Promise<LicenseInfo> => unwrap(bridge().license.info()),

  onTaskUpdate: (callback: (summary: TaskSummary) => void) =>
    window.mapscraper ? bridge().onTaskUpdate(callback) : noopSubscription(),
  onTaskLog: (callback: Parameters<MapScraperBridge['onTaskLog']>[0]) =>
    window.mapscraper ? bridge().onTaskLog(callback) : noopSubscription(),
  onTaskResult: (callback: Parameters<MapScraperBridge['onTaskResult']>[0]) =>
    window.mapscraper ? bridge().onTaskResult(callback) : noopSubscription(),
  onTaskDone: (callback: Parameters<MapScraperBridge['onTaskDone']>[0]) =>
    window.mapscraper ? bridge().onTaskDone(callback) : noopSubscription(),
  onTaskRemoved: (callback: (payload: { taskId: string }) => void) =>
    window.mapscraper ? bridge().onTaskRemoved(callback) : noopSubscription(),
  onTasksCleared: (callback: () => void) =>
    window.mapscraper ? bridge().onTasksCleared(callback) : noopSubscription(),
  onAppError: (callback: (payload: { message: string }) => void) =>
    window.mapscraper ? bridge().onAppError(callback) : noopSubscription(),
  onApiInfo: (callback: Parameters<MapScraperBridge['onApiInfo']>[0]) =>
    window.mapscraper ? bridge().onApiInfo(callback) : noopSubscription(),
};

export function openExternal(url?: string | null) {
  if (!url) return Promise.resolve(false);
  return api.openExternal(url).catch(() => false);
}

export function copyText(text: string) {
  return api.copyText(text);
}
