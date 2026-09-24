import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthScreen } from './src/screens/AuthScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { TripScreen } from './src/screens/TripScreen';
import { AuthProvider, useAuth } from './src/store/AuthContext';
import { TripProvider, useTrip } from './src/store/TripContext';

function Root() {
  const { ready, signedIn } = useAuth();
  const { trip } = useTrip();
  if (!ready) return null;
  if (!signedIn) return <AuthScreen />;
  return trip ? <TripScreen /> : <HomeScreen />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <TripProvider>
          <StatusBar style="light" />
          <Root />
        </TripProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
