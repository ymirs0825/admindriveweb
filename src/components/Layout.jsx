import { Home, Users, FileText, Menu, X, LogOut, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import driveLogo from '../assets/drivelogo.png';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

const DriveLogo = () => (
  <div className="flex items-center gap-3">
    <img
      src={driveLogo}
      alt="D.R.I.V.E. Logo"
      className="w-12 h-12 rounded-full"
    />
    <span className="font-bold text-xl text-[#1E40AF]">D.R.I.V.E.</span>
  </div>
);

export function Layout({ children, currentPage, onNavigate, onLogout }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const handleLogout = () => {
    setShowLogoutDialog(true);
  };

  const confirmLogout = () => {
    setShowLogoutDialog(false);
    onLogout();
  };

  const navItems = [
    { page: 'dashboard', label: 'Dashboard', icon: Home },
    { page: 'users', label: 'User Accounts', icon: Users },
    { page: 'reports', label: 'Drowsiness Reports', icon: FileText },
    { page: 'alerts', label: 'Active Alerts', icon: AlertTriangle },
  ];

  const isActive = (page) => currentPage === page;

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-100 via-blue-50 to-sky-200">
      {/* Mobile header */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between p-4 border-b border-blue-100 shadow-sm lg:hidden bg-white/95 backdrop-blur-md">
        <DriveLogo />
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 transition-all duration-200 rounded-lg hover:bg-blue-50"
        >
          {isSidebarOpen ? (
            <X size={24} className="text-gray-700" />
          ) : (
            <Menu size={24} className="text-gray-700" />
          )}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-screen w-64 flex flex-col
          bg-gradient-to-b from-sky-50/95 to-blue-100/95 backdrop-blur-md
          shadow-xl z-40 border-r border-blue-200/50
          transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="hidden p-6 border-b lg:block border-blue-50">
          <DriveLogo />
        </div>

        <nav className="flex-1 px-4 mt-20 space-y-2 lg:mt-8">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.page);

            return (
              <button
                key={item.page}
                onClick={() => {
                  onNavigate(item.page);
                  setIsSidebarOpen(false);
                }}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-xl
                  transition-all duration-200
                  ${
                    active
                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-200'
                      : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                  }
                `}
              >
                <Icon size={20} />
                <span className="font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Admin profile & logout */}
        <div className="p-4 bg-white border-t border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center w-10 h-10 font-semibold text-white rounded-full bg-gradient-to-br from-blue-500 to-blue-700">
              JD
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                D.R.I.V.E
              </p>
              <p className="text-xs text-gray-500">Admin</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center w-full gap-2 px-4 py-2 text-red-600 transition-colors rounded-lg hover:bg-red-50"
          >
            <LogOut size={18} />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="min-h-screen pt-20 lg:ml-64 lg:pt-8">
        <div className="p-4 lg:p-8">{children}</div>
      </main>

      {/* Logout confirmation dialog */}
      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Logout</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to logout? You will need to login again to
              access the admin dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmLogout}
              className="bg-red-600 hover:bg-red-700"
            >
              Logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
