import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { Onboarding } from '@/components/Onboarding';
import { ToastProvider } from '@/components/ToastProvider';
import { SystemProvider } from '@/lib/system-context';
import { TaskProvider } from '@/lib/task-context';
import { HomePage } from '@/pages/Home';
import { TasksPage } from '@/pages/Tasks';
import { ResultsPage } from '@/pages/Results';
import { GuidePage } from '@/pages/Guide';
import { ApiDocsPage } from '@/pages/ApiDocs';
import { SettingsPage } from '@/pages/Settings';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <ToastProvider>
      <SystemProvider>
        <TaskProvider>
          <HashRouter>
            <ScrollToTop />
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<HomePage />} />
                <Route path="tasks" element={<TasksPage />} />
                <Route path="tasks/:id" element={<ResultsPage />} />
                <Route path="guide" element={<GuidePage />} />
                <Route path="api" element={<ApiDocsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
            <Onboarding />
          </HashRouter>
        </TaskProvider>
      </SystemProvider>
    </ToastProvider>
  );
}
