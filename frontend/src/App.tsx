import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { FormsListPage } from '@/pages/forms/FormsListPage';
import { SelectTemplatePage } from '@/pages/forms/SelectTemplatePage';
import { FormEditorPage } from '@/pages/forms/FormEditorPage';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/lib/api';

function App() {
  const { setUser, setLoading, isAuthenticated } = useAuthStore();

  useEffect(() => {
    async function checkAuth() {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await authApi.me();
        setUser(response.data);
      } catch (error) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, [setUser, setLoading]);

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Protected routes */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />

        {/* Forms routes */}
        <Route path="/forms" element={<FormsListPage />} />
        <Route path="/forms/new" element={<SelectTemplatePage />} />
        <Route path="/forms/:id" element={<FormEditorPage />} />

        {/* Projects routes - placeholder */}
        <Route
          path="/projects"
          element={
            <div className="space-y-4">
              <h1 className="text-3xl font-bold">Projects</h1>
              <p className="text-muted-foreground">Coming soon...</p>
            </div>
          }
        />

        {/* Review routes - placeholder */}
        <Route
          path="/review"
          element={
            <ProtectedRoute requiredRoles={['admin', 'reviewer']}>
              <div className="space-y-4">
                <h1 className="text-3xl font-bold">Review Queue</h1>
                <p className="text-muted-foreground">Coming soon...</p>
              </div>
            </ProtectedRoute>
          }
        />

        {/* Admin routes - placeholder */}
        <Route
          path="/admin/*"
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <div className="space-y-4">
                <h1 className="text-3xl font-bold">Admin</h1>
                <p className="text-muted-foreground">Coming soon...</p>
              </div>
            </ProtectedRoute>
          }
        />

        {/* Profile route - placeholder */}
        <Route
          path="/profile"
          element={
            <div className="space-y-4">
              <h1 className="text-3xl font-bold">Profile</h1>
              <p className="text-muted-foreground">Coming soon...</p>
            </div>
          }
        />

        {/* Settings route - placeholder */}
        <Route
          path="/settings"
          element={
            <div className="space-y-4">
              <h1 className="text-3xl font-bold">Settings</h1>
              <p className="text-muted-foreground">Coming soon...</p>
            </div>
          }
        />

        {/* Tasks route - placeholder */}
        <Route
          path="/tasks"
          element={
            <div className="space-y-4">
              <h1 className="text-3xl font-bold">Tasks</h1>
              <p className="text-muted-foreground">Coming soon...</p>
            </div>
          }
        />
      </Route>

      {/* Unauthorized page */}
      <Route
        path="/unauthorized"
        element={
          <div className="flex h-screen flex-col items-center justify-center">
            <h1 className="text-3xl font-bold">Unauthorized</h1>
            <p className="mt-2 text-muted-foreground">
              You don't have permission to access this page.
            </p>
          </div>
        }
      />

      {/* Redirect root to dashboard or login */}
      <Route
        path="/"
        element={
          isAuthenticated ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* 404 page */}
      <Route
        path="*"
        element={
          <div className="flex h-screen flex-col items-center justify-center">
            <h1 className="text-3xl font-bold">404</h1>
            <p className="mt-2 text-muted-foreground">Page not found.</p>
          </div>
        }
      />
    </Routes>
  );
}

export default App;
