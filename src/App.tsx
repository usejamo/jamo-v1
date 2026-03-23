import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import ProposalsList from './pages/ProposalsList'
import ProposalDetail from './pages/ProposalDetail'
import Settings from './pages/Settings'
import Login from './pages/Login'
import { AuthProvider } from './context/AuthContext'
import { ArchivedProvider } from './context/ArchivedContext'
import { ProposalsProvider } from './context/ProposalsContext'
import { DeletedProvider } from './context/DeletedContext'
import { ProposalModalProvider, useProposalModal } from './context/ProposalModalContext'
import { SidebarProvider } from './context/SidebarContext'
import { ProtectedRoute } from './components/ProtectedRoute'
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
                    {/* Public route */}
                    <Route path="/login" element={<Login />} />

                    {/* Protected routes */}
                    <Route element={<ProtectedRoute />}>
                      <Route element={<Layout />}>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/proposals" element={<ProposalsList />} />
                        <Route path="/proposals/:id" element={<ProposalDetail />} />
                        <Route path="/settings" element={<Settings />} />
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
