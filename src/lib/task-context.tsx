import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from './bridge';
import { useToast } from '@/components/ToastProvider';
import type { TaskSummary } from './types';

interface TaskContextValue {
  tasks: TaskSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  rememberTask: (task: TaskSummary) => void;
}

const TaskContext = createContext<TaskContextValue | null>(null);

function sortTasks(tasks: TaskSummary[]) {
  return [...tasks].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function TaskProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { pushToast } = useToast();

  const refresh = useCallback(async () => {
    try {
      const list = await api.listTasks();
      setTasks(sortTasks(list));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Searches could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const upsert = (summary: TaskSummary) => {
      setTasks((current) => {
        const index = current.findIndex((task) => task.id === summary.id);
        if (index < 0) return sortTasks([summary, ...current]);
        const next = [...current];
        next[index] = summary;
        return next;
      });
    };

    const unsubscribeUpdate = api.onTaskUpdate(upsert);
    const unsubscribeDone = api.onTaskDone(({ summary }) => upsert(summary));
    const unsubscribeRemoved = api.onTaskRemoved(({ taskId }) => {
      setTasks((current) => current.filter((task) => task.id !== taskId));
    });
    const unsubscribeCleared = api.onTasksCleared(() => setTasks([]));
    const unsubscribeError = api.onAppError(({ message }) => {
      pushToast({ kind: 'error', title: 'Something needs attention', message });
    });

    return () => {
      unsubscribeUpdate();
      unsubscribeDone();
      unsubscribeRemoved();
      unsubscribeCleared();
      unsubscribeError();
    };
  }, [pushToast]);

  const rememberTask = useCallback((task: TaskSummary) => {
    setTasks((current) => {
      const index = current.findIndex((item) => item.id === task.id);
      if (index < 0) return sortTasks([task, ...current]);
      const next = [...current];
      next[index] = task;
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ tasks, loading, error, refresh, rememberTask }),
    [tasks, loading, error, refresh, rememberTask]
  );

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

export function useTasks() {
  const context = useContext(TaskContext);
  if (!context) throw new Error('useTasks must be used inside TaskProvider.');
  return context;
}
