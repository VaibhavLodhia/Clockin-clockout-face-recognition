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
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      faceRecognitionUrl: process.env.EXPO_PUBLIC_FACE_RECOGNITION_URL,
    }
  }
};



