import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useSidebar } from '../context/SidebarContext'

export default function Layout() {
  const { sidebarNode } = useSidebar()
  return (
    <div className="flex h-screen overflow-hidden">
      {sidebarNode ?? <Sidebar />}
      <main className="flex-1 overflow-y-auto min-w-0 p-8">
        <Outlet />
      </main>
    </div>
  )
}
