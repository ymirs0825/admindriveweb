import { api } from "./api"
import { mockUsers, mockDrowsinessReports } from "../data/mockData"

let isInitialized = false

export async function initializeData() {
  if (isInitialized) return

  try {
    console.log("Initializing data...")

    // Check if users already exist
    const { users } = await api.getUsers()

    if (!users || users.length === 0) {
      console.log("No users found, populating with mock data...")

      // Add mock users
      for (const user of mockUsers) {
        await api.createOrUpdateUser(user)
      }

      // Add mock reports
      for (const report of mockDrowsinessReports) {
        await api.createReport(report)
      }

      console.log("Mock data populated successfully!")
    } else {
      console.log(`Found ${users.length} existing users`)
    }

    isInitialized = true
  } catch (error) {
    console.error("Error initializing data:", error)
  }
}
