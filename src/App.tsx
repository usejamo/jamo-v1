import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import ProposalsList from './pages/ProposalsList'
import ProposalDetail from './pages/ProposalDetail'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/proposals" element={<ProposalsList />} />
          <Route path="/proposals/:id" element={<ProposalDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
