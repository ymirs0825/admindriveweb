// This file is intentionally simplified to work with mock data only
// All API calls now return mock data from localStorage

import { mockUsers, mockDrowsinessReports } from "../data/mockData"
import { supabase } from "./supabaseClient";

// flip this to false anytime you want mock/localStorage again
const USE_SUPABASE = true;

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(d);
};

const safe = (v) => (typeof v === "string" ? v.trim() : "");

const buildFullName = (first, last, email) => {
  const f = safe(first);
  const l = safe(last);
  const full = `${f}${f && l ? " " : ""}${l}`.trim();
  return full || safe(email) || "Unknown";
};

export const api = {
getUsers: async () => {
  if (!USE_SUPABASE) {
    const stored = localStorage.getItem("users");
    const users = stored ? JSON.parse(stored) : mockUsers;
    return { success: true, users };
  }

  // Supabase-backed users (Admin view)
  const { data, error } = await supabase
    .rpc("admin_get_user_accounts")
  if (error) {
    console.error("Supabase getUsers error:", error);
    // fallback so your UI never breaks
    const stored = localStorage.getItem("users");
    const users = stored ? JSON.parse(stored) : mockUsers;
    return { success: true, users };
  }

  const users = (data || []).map((r) => {
    const fullName = buildFullName(r.first_name, r.last_name, r.email);
    return {
      id: r.id,
      fullName,
      name: fullName, // keeps your existing search logic working
      email: r.email || "—",
      status: r.status || "Inactive",
      role: r.role || (r.mode === "driver" ? "Driver" : "User"),
      joinedDate: fmtDate(r.joined_at),
      lastActive: fmtDate(r.last_active_at),
    };
  });

  return { success: true, users };
},


  getUser: async id => {
    const stored = localStorage.getItem("users")
    const users = stored ? JSON.parse(stored) : mockUsers
    const user = users.find(u => u.id === id)
    return { success: true, user }
  },

  createOrUpdateUser: async user => {
    const stored = localStorage.getItem("users")
    const users = stored ? JSON.parse(stored) : mockUsers
    const index = users.findIndex(u => u.id === user.id)

    if (index >= 0) {
      users[index] = user
    } else {
      users.push(user)
    }

    localStorage.setItem("users", JSON.stringify(users))
    return { success: true, user }
  },

  archiveUser: async id => {
    const stored = localStorage.getItem("users")
    const users = stored ? JSON.parse(stored) : mockUsers
    const archivedStored = localStorage.getItem("archivedUsers")
    const archivedUsers = archivedStored ? JSON.parse(archivedStored) : []

    const index = users.findIndex(u => u.id === id)
    if (index >= 0) {
      const user = users.splice(index, 1)[0]
      archivedUsers.push({ ...user, archivedAt: new Date().toISOString() })
      localStorage.setItem("users", JSON.stringify(users))
      localStorage.setItem("archivedUsers", JSON.stringify(archivedUsers))
    }

    return { success: true, message: "User archived successfully" }
  },

  getArchivedUsers: async () => {
    const stored = localStorage.getItem("archivedUsers")
    const users = stored ? JSON.parse(stored) : []
    return { success: true, users }
  },

  restoreUser: async id => {
    const stored = localStorage.getItem("users")
    const users = stored ? JSON.parse(stored) : mockUsers
    const archivedStored = localStorage.getItem("archivedUsers")
    const archivedUsers = archivedStored ? JSON.parse(archivedStored) : []

    const index = archivedUsers.findIndex(u => u.id === id)
    if (index >= 0) {
      const user = archivedUsers.splice(index, 1)[0]
      const { archivedAt, ...userData } = user
      users.push(userData)
      localStorage.setItem("users", JSON.stringify(users))
      localStorage.setItem("archivedUsers", JSON.stringify(archivedUsers))
    }

    return { success: true, message: "User restored successfully" }
  },

  // Reports
  getReports: async () => {
    return { success: true, reports: mockDrowsinessReports }
  },

  createReport: async report => {
    return { success: true, report }
  }
}
