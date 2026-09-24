import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HomeScreen } from './src/screens/HomeScreen';
import { TripScreen } from './src/screens/TripScreen';
import { TripProvider, useTrip } from './src/store/TripContext';

function Root() {
  const { trip } = useTrip();
  return trip ? <TripScreen /> : <HomeScreen />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <TripProvider>
        <StatusBar style="light" />
        <Root />
      </TripProvider>
    </SafeAreaProvider>
  );
}
