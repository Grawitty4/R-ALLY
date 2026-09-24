export default {
  expo: {
    name: 'R-ALLY',
    slug: 'r-ally',
    scheme: 'rally',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#0E141B',
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'app.rally.convoy',
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'R-ALLY uses your location so your crew can see you during a trip.',
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#0E141B',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      package: 'app.rally.convoy',
      permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
      predictiveBackGestureEnabled: false,
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
        },
      },
    },
    web: {
      favicon: './assets/favicon.png',
      bundler: 'metro',
    },
    plugins: [
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'R-ALLY uses your location so your crew can see you during a trip.',
        },
      ],
      [
        'react-native-maps',
        {
          androidGoogleMapsApiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
        },
      ],
    ],
  },
};
