import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import ProposalsList from './pages/ProposalsList'
import ProposalDetail from './pages/ProposalDetail'
import Settings from './pages/Settings'
import Login from './pages/Login'
import AcceptInvite from './pages/AcceptInvite'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import AdminPanel from './pages/admin/AdminPanel'
import { AuthProvider } from './context/AuthContext'
import { ArchivedProvider } from './context/ArchivedContext'
import { ProposalsProvider } from './context/ProposalsContext'
import { DeletedProvider } from './context/DeletedContext'
import { ProposalModalProvider, useProposalModal } from './context/ProposalModalContext'
import { SidebarProvider } from './context/SidebarContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { SuperAdminRoute } from './components/SuperAdminRoute'
import ProposalEditorModal from './components/ProposalEditorModal'

function GlobalToast() {
  const { toast } = useProposalModal()
  if (!toast) return null
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg z-[60] pointer-events-none">
      {toast}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <SidebarProvider>
        <ProposalsProvider>
          <DeletedProvider>
            <ArchivedProvider>
              <ProposalModalProvider>
                <BrowserRouter>
                  <Routes>
                    {/* Public routes */}
                    <Route path="/login" element={<Login />} />
                    <Route path="/accept-invite" element={<AcceptInvite />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/reset-password" element={<ResetPassword />} />

                    {/* Protected routes */}
                    <Route element={<ProtectedRoute />}>
                      <Route element={<Layout />}>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/proposals" element={<ProposalsList />} />
                        <Route path="/proposals/:id" element={<ProposalDetail />} />
                        <Route path="/settings" element={<Settings />} />
                      </Route>

                      {/* Super-admin-only routes */}
                      <Route element={<SuperAdminRoute />}>
                        <Route path="/admin" element={<AdminPanel />} />
                      </Route>
                    </Route>
                  </Routes>
                  <ProposalEditorModal />
                  <GlobalToast />
                </BrowserRouter>
              </ProposalModalProvider>
            </ArchivedProvider>
          </DeletedProvider>
        </ProposalsProvider>
      </SidebarProvider>
    </AuthProvider>
  )
}
