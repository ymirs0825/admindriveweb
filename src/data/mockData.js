export const mockUsers = [
  {
    id: "1",
    fullName: "Jeffrey Dahmer",
    email: "jdahmer@gmail.com",
    name: "jdahmer71",
    status: "Active",
    role: "Admin",
    joinedDate: "March 13, 2025",
    lastActive: "1 minute ago"
  },
  {
    id: "2",
    fullName: "Olivia Bennett",
    email: "ollieb@gmail.com",
    name: "ollyes59",
    status: "Inactive",
    role: "User",
    joinedDate: "June 27, 2022",
    lastActive: "1 month ago"
  },
  {
    id: "3",
    fullName: "Daniel Warren",
    email: "dwarren3@gmail.com",
    name: "dwarren5",
    status: "Active",
    role: "Driver",
    joinedDate: "January 8, 2024",
    lastActive: "4 days ago"
  },
  {
    id: "4",
    fullName: "Chloe Hayes",
    email: "chloehhyes@gmail.com",
    name: "chloelilh",
    status: "Inactive",
    role: "User",
    joinedDate: "October 5, 2021",
    lastActive: "10 days ago"
  },
  {
    id: "5",
    fullName: "Marcus Johnson",
    email: "mj877@gmail.com",
    name: "marcj47",
    status: "Active",
    role: "User",
    joinedDate: "February 19, 2023",
    lastActive: "3 months ago"
  },
  {
    id: "6",
    fullName: "Isabella Clark",
    email: "belleclark@gmail.com",
    name: "bellecl",
    status: "Active",
    role: "Driver",
    joinedDate: "August 10, 2022",
    lastActive: "1 week ago"
  },
  {
    id: "7",
    fullName: "Lucas Mitchell",
    email: "lucamitch@gmail.com",
    name: "lucamitch",
    status: "Active",
    role: "Driver",
    joinedDate: "April 23, 2024",
    lastActive: "4 hours ago"
  },
  {
    id: "8",
    fullName: "Mark Wilburg",
    email: "markwil52@gmail.com",
    name: "markwilb52",
    status: "Active",
    role: "User",
    joinedDate: "November 14, 2020",
    lastActive: "2 months ago"
  },
  {
    id: "9",
    fullName: "Nicholas Agwan",
    email: "nicolaaas909@gmail.com",
    name: "nicolaaas909",
    status: "Active",
    role: "User",
    joinedDate: "July 6, 2023",
    lastActive: "3 hours ago"
  },
  {
    id: "10",
    fullName: "Mia Nadlen",
    email: "mianaddlen@gmail.com",
    name: "mianaddlen",
    status: "Inactive",
    role: "User",
    joinedDate: "December 31, 2021",
    lastActive: "4 months ago"
  },
  {
    id: "11",
    fullName: "Noemi Villar",
    email: "noemivill99@gmail.com",
    name: "noemi",
    status: "Active",
    role: "Admin",
    joinedDate: "August 10, 2024",
    lastActive: "15 minutes ago"
  }
]

export const mockDrowsinessReports = [
  {
    id: "r1",
    userId: "2",
    userName: "Olivia Bennett",
    timestamp: "2025-02-01T08:30:00",
    eyeClosurePercentage: 75,
    mouthAspectRatio: 0.45,
    headTiltAngle: 15,
    yawnFrequency: 3,
    drowsinessLevel: 2,
    location: { lat: 14.5995, lng: 120.9842 },
    speed: 65,
    alertSent: true,
    emergencyContacted: false
  },
  {
    id: "r2",
    userId: "3",
    userName: "Daniel Warren",
    timestamp: "2025-02-01T07:15:00",
    eyeClosurePercentage: 85,
    mouthAspectRatio: 0.52,
    headTiltAngle: 25,
    yawnFrequency: 5,
    drowsinessLevel: 3,
    location: { lat: 14.676, lng: 121.0437 },
    speed: 80,
    alertSent: true,
    emergencyContacted: true
  },
  {
    id: "r3",
    userId: "6",
    userName: "Isabella Clark",
    timestamp: "2025-02-01T06:45:00",
    eyeClosurePercentage: 65,
    mouthAspectRatio: 0.38,
    headTiltAngle: 10,
    yawnFrequency: 2,
    drowsinessLevel: 1,
    location: { lat: 14.5547, lng: 121.0244 },
    speed: 55,
    alertSent: true,
    emergencyContacted: false
  },
  {
    id: "r4",
    userId: "7",
    userName: "Lucas Mitchell",
    timestamp: "2025-01-31T23:20:00",
    eyeClosurePercentage: 80,
    mouthAspectRatio: 0.48,
    headTiltAngle: 20,
    yawnFrequency: 4,
    drowsinessLevel: 2,
    location: { lat: 14.5764, lng: 120.9827 },
    speed: 70,
    alertSent: true,
    emergencyContacted: false
  },
  {
    id: "r5",
    userId: "9",
    userName: "Nicholas Agwan",
    timestamp: "2025-01-31T22:10:00",
    eyeClosurePercentage: 90,
    mouthAspectRatio: 0.55,
    headTiltAngle: 30,
    yawnFrequency: 6,
    drowsinessLevel: 3,
    location: { lat: 14.5243, lng: 121.0792 },
    speed: 75,
    alertSent: true,
    emergencyContacted: true
  }
]

export const monthlyUserData = [
  { month: "Jan", users: 65 },
  { month: "Feb", users: 75 },
  { month: "Mar", users: 70 },
  { month: "Apr", users: 80 },
  { month: "May", users: 85 },
  { month: "Jun", users: 90 },
  { month: "Jul", users: 95 },
  { month: "Aug", users: 100 },
  { month: "Sep", users: 95 },
  { month: "Oct", users: 90 },
  { month: "Nov", users: 85 },
  { month: "Dec", users: 88 }
]

export const deviceData = [
  { name: "Android", value: 425, color: "#4285F4" },
  { name: "iOS", value: 320, color: "#A855F7" }
]

export const drowsinessLevelData = [
  { level: "Level 1", count: 45, color: "#FCD34D" },
  { level: "Level 2", count: 28, color: "#FB923C" },
  { level: "Level 3", count: 12, color: "#EF4444" }
]
