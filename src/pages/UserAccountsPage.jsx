import { useState, useEffect } from 'react';
import { Search, Archive, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../utils/api';

export function UserAccountsPage({ onNavigateToArchive } = {}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const rowsPerPage = 10;

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { users: fetchedUsers } = await api.getUsers();
      setUsers(fetchedUsers || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(
    (user) =>
      user.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filteredUsers.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + rowsPerPage);

  const getStatusColor = (status) => {
    switch (status) {
      case 'Active':
        return 'bg-green-100 text-green-700';
      case 'Inactive':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'Admin':
        return 'text-purple-700';
      case 'Driver':
        return 'text-blue-700';
      case 'User':
        return 'text-gray-700';
      default:
        return 'text-gray-700';
    }
  };

  const handleArchive = async (userId) => {
    if (confirm('Are you sure you want to archive this user?')) {
      try {
        await api.archiveUser(userId);
        await fetchUsers();
      } catch (error) {
        console.error('Error archiving user:', error);
        alert('Failed to archive user. Please try again.');
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
          <p className="text-gray-600">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-800">User Accounts</h1>
        <button
          onClick={onNavigateToArchive}
          className="flex items-center gap-2 px-4 py-2 text-white transition-all duration-200 shadow-md bg-gradient-to-r from-gray-600 to-gray-700 rounded-xl hover:from-gray-700 hover:to-gray-800 hover:shadow-lg"
        >
          <Archive size={18} />
          <span>View Archive</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="p-4 border border-blue-100 shadow-lg bg-white/95 backdrop-blur-sm rounded-2xl shadow-blue-100">
        <div className="relative">
          <Search className="absolute text-gray-400 transform -translate-y-1/2 left-3 top-1/2" size={20} />
          <input
            type="text"
            placeholder="Search by name, email, or username..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full py-3 pl-10 pr-4 transition-all duration-200 border border-blue-100 bg-blue-50/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden border border-blue-100 shadow-lg bg-white/95 backdrop-blur-sm rounded-2xl shadow-blue-100">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-blue-200 bg-gradient-to-r from-blue-50 to-sky-50">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-left text-gray-800">Full Name</th>
                <th className="px-6 py-4 text-sm font-semibold text-left text-gray-800">Email</th>
                <th className="px-6 py-4 text-sm font-semibold text-left text-gray-800">Status</th>
                <th className="px-6 py-4 text-sm font-semibold text-left text-gray-800">Role</th>
                <th className="px-6 py-4 text-sm font-semibold text-left text-gray-800">Joined Date</th>
                <th className="px-6 py-4 text-sm font-semibold text-left text-gray-800">Last Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-100">
              {paginatedUsers.map((user) => (
                <tr key={user.id} className="transition-colors hover:bg-blue-50/50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 text-sm font-semibold text-white rounded-full shadow-md bg-gradient-to-br from-blue-400 to-blue-600">
                        {user.fullName.split(' ').map(n => n[0]).join('')}
                      </div>
                      <span className="font-medium text-gray-900">{user.fullName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-700">{user.email}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(user.status)}`}>
                      {user.status}
                    </span>
                  </td>
                  <td className={`px-6 py-4 font-medium ${getRoleColor(user.role)}`}>{user.role}</td>
                  <td className="px-6 py-4 text-gray-700">{user.joinedDate}</td>
                  <td className="px-6 py-4 text-gray-700">{user.lastActive}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-blue-100 bg-gradient-to-r from-blue-50/50 to-sky-50/50">
          <div className="text-sm text-gray-600">
            Rows per page: <span className="font-semibold">{rowsPerPage}</span> of{' '}
            <span className="font-semibold">{filteredUsers.length}</span> rows
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="p-2 transition-colors rounded-lg hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={20} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-8 h-8 rounded-lg transition-all duration-200 ${
                  currentPage === page
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md'
                    : 'hover:bg-blue-100 text-gray-700'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="p-2 transition-colors rounded-lg hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
