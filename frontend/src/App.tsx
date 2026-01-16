import { useEffect } from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { FormsListPage } from '@/pages/forms/FormsListPage';
import { SelectTemplatePage } from '@/pages/forms/SelectTemplatePage';
import { FormEditorPage } from '@/pages/forms/FormEditorPage';
import { FormViewPage } from '@/pages/forms/FormViewPage';
import { AmendmentsPage } from '@/pages/forms/AmendmentsPage';
import { AmendmentDetailPage } from '@/pages/forms/AmendmentDetailPage';
import { ReviewQueuePage } from '@/pages/review/ReviewQueuePage';
import { ProjectsPage } from '@/pages/projects/ProjectsPage';
import { ProjectDetailPage } from '@/pages/projects/ProjectDetailPage';
import { CreateProjectPage } from '@/pages/projects/CreateProjectPage';
import { TasksPage } from '@/pages/tasks/TasksPage';
import { SelectFormPage } from '@/pages/tasks/SelectFormPage';
import { ProfilePage } from '@/pages/profile/ProfilePage';
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage';
import { AuditLogsPage } from '@/pages/admin/AuditLogsPage';
import { UsersPage } from '@/pages/admin/UsersPage';
import { ReviewStagesPage } from '@/pages/admin/ReviewStagesPage';
import { ReportsPage } from '@/pages/admin/ReportsPage';
import { EmailSettingsPage } from '@/pages/admin/EmailSettingsPage';
import { WorkflowConfigPage } from '@/pages/admin/WorkflowConfigPage';
import { TaskReviewPage } from '@/pages/admin/TaskReviewPage';
import { SearchResultsPage } from '@/pages/SearchResultsPage';
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
        setUser(response.data.data);
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
      <Route
        path="/forgot-password"
        element={
          <div className="flex min-h-screen items-center justify-center">
            <div className="text-center space-y-4">
              <h1 className="text-2xl font-bold">Forgot Password</h1>
              <p className="text-muted-foreground">
                Password reset functionality coming soon.
              </p>
              <Link to="/login" className="text-primary hover:underline">
                Back to Login
              </Link>
            </div>
          </div>
        }
      />

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
        <Route path="/forms/:id/view" element={<FormViewPage />} />
        <Route path="/forms/:id/amendments" element={<AmendmentsPage />} />
        <Route path="/forms/:id/amendments/:amendmentId" element={<AmendmentDetailPage />} />

        {/* Projects routes */}
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/new" element={<CreateProjectPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />

        {/* Review routes */}
        <Route
          path="/review"
          element={
            <ProtectedRoute requiredRoles={['admin', 'reviewer']}>
              <ReviewQueuePage />
            </ProtectedRoute>
          }
        />

        {/* Admin routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <AdminDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <AuditLogsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/review-stages"
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <ReviewStagesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/reports"
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <ReportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/email"
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <EmailSettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/workflow-config"
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <WorkflowConfigPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/task-review"
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <TaskReviewPage />
            </ProtectedRoute>
          }
        />

        {/* Profile route */}
        <Route path="/profile" element={<ProfilePage />} />

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

        {/* Tasks routes */}
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/tasks/:taskId/select-form" element={<SelectFormPage />} />

        {/* Search route */}
        <Route path="/search" element={<SearchResultsPage />} />
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
