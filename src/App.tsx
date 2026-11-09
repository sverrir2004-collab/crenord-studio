/**
 * CRENORD Studio - App Shell & Router
 */
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './client/context/AuthContext.tsx';
import { ProtectedRoute } from './client/components/auth/ProtectedRoute.tsx';
import { AppShell } from './client/components/shell/AppShell.tsx';
import { LoginPage } from './client/pages/LoginPage.tsx';
import { HomePage } from './client/pages/HomePage.tsx';
import { ImagePage } from './client/pages/ImagePage.tsx';
import { VideoPage } from './client/pages/VideoPage.tsx';
import { EditPage } from './client/pages/EditPage.tsx';
import { AudioPage } from './client/pages/AudioPage.tsx';
import { CleanPage } from './client/pages/CleanPage.tsx';
import { AssetsPage } from './client/pages/AssetsPage.tsx';
import { ProjectsPage } from './client/pages/ProjectsPage.tsx';
import { ProjectDetailPage } from './client/pages/ProjectDetailPage.tsx';
import { PlansPage } from './client/pages/PlansPage.tsx';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public login route */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected studio routes wrapped in ProtectedRoute + AppShell */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppShell>
                  <HomePage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/image"
            element={
              <ProtectedRoute>
                <AppShell>
                  <ImagePage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/video"
            element={
              <ProtectedRoute>
                <AppShell>
                  <VideoPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/edit"
            element={
              <ProtectedRoute>
                <AppShell>
                  <EditPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/audio"
            element={
              <ProtectedRoute>
                <AppShell>
                  <AudioPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/clean"
            element={
              <ProtectedRoute>
                <AppShell>
                  <CleanPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/assets"
            element={
              <ProtectedRoute>
                <AppShell>
                  <AssetsPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects"
            element={
              <ProtectedRoute>
                <AppShell>
                  <ProjectsPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:id"
            element={
              <ProtectedRoute>
                <AppShell>
                  <ProjectDetailPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/plans"
            element={
              <ProtectedRoute>
                <AppShell>
                  <PlansPage />
                </AppShell>
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
