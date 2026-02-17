import { useState, useEffect } from 'react';
import { Search, RotateCcw, ArrowLeft } from 'lucide-react';
import { api } from '../utils/api';

export function ArchivePage({ onNavigateBack } = {}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [archivedUsers, setArchivedUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchArchivedUsers();
  }, []);

  const fetchArchivedUsers = async () => {
    try {
      setLoading(true);
      const { users } = await api.getArchivedUsers();
      setArchivedUsers(users || []);
    } catch (error) {
      console.error('Error fetching archived users:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = archivedUsers.filter(
    (user) =>
      user.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRestore = async (userId) => {
    if (confirm('Are you sure you want to restore this user?')) {
      try {
        await api.restoreUser(userId);
        await fetchArchivedUsers();
        alert('User restored successfully!');
      } catch (error) {
        console.error('Error restoring user:', error);
        alert('Failed to restore user. Please try again.');
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading archived users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {onNavigateBack && (
          <button
            onClick={onNavigateBack}
            className="p-2 hover:bg-blue-100 rounded-xl"
          >
            <ArrowLeft size={24} />
          </button>
        )}
        <h1 className="text-3xl font-bold text-gray-800">Archived Users</h1>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl p-4 shadow border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search archived users..."
            className="w-full pl-10 pr-4 py-3 rounded-xl border focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </div>

      {filteredUsers.length > 0 ? (
        <div className="bg-white rounded-2xl shadow overflow-hidden border">
          <table className="w-full">
            <thead className="bg-blue-50">
              <tr>
                <th className="px-6 py-4 text-left">Full Name</th>
                <th className="px-6 py-4 text-left">Email</th>
                <th className="px-6 py-4 text-left">Name</th>
                <th className="px-6 py-4 text-left">Joined</th>
                <th className="px-6 py-4 text-left">Archived</th>
                <th className="px-6 py-4 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-blue-50">
                  <td className="px-6 py-4 font-medium">{user.fullName}</td>
                  <td className="px-6 py-4">{user.email}</td>
                  <td className="px-6 py-4">{user.name}</td>
                  <td className="px-6 py-4">{user.joinedDate}</td>
                  <td className="px-6 py-4">{user.archivedAt}</td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleRestore(user.id)}
                      className="flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      <RotateCcw size={14} />
                      Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-12 text-center shadow border">
          <Search size={32} className="mx-auto text-gray-400 mb-4" />
          <p className="text-xl font-semibold text-gray-700">
            No Archived Users
          </p>
        </div>
      )}
    </div>
  );
}
