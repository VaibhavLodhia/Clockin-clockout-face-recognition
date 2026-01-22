export default {
  expo: {
    name: "Employee Clock App",
    slug: "employee-clock-app",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "light",
    splash: {
      backgroundColor: "#ffffff"
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.employeeclock.app"
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#ffffff"
      },
      package: "com.employeeclock.app",
      permissions: [
        "CAMERA"
      ]
    },
    web: {
      bundler: "metro",
      output: "static",
      name: "Employee Clock Admin",
      shortName: "Clock Admin",
      description: "Admin dashboard for employee clock-in/out system",
      themeColor: "#ffffff",
      backgroundColor: "#ffffff",
      manifest: {
        display: "standalone",
        orientation: "portrait",
        startUrl: "/",
        scope: "/",
      }
    },
    plugins: [
      [
        "expo-camera",
        {
          "cameraPermission": "Allow access to camera for face recognition"
        }
      ]
    ],
    scheme: "employee-clock-app",
    extra: {
      eas: {
        projectId: "97f90a5d-3eb3-4a91-84dc-d9a7783776fd"
      },
      // These are available in native apps via Constants.expoConfig.extra
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://mygapgtftnfvtspvbpxi.supabase.co',
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15Z2FwZ3RmdG5mdnRzcHZicHhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NDI4NDksImV4cCI6MjA4MTMxODg0OX0.qNQv7GwfPb6RjX-s4TzFOARvoHD8_Fd7shc0hzvER7I',
      faceRecognitionUrl: process.env.EXPO_PUBLIC_FACE_RECOGNITION_URL,
    }
  }
};



