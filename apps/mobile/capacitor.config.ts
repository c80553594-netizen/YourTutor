import { type CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yourtutor.app',
  appName: 'YourTutor',
  webDir: 'dist',
  server: {
    // Allow HTTP LAN Companion Bridge requests over local Wi-Fi on Android
    androidScheme: 'http',
    cleartext: true,
  },
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: false,
      androidBiometric: {
        biometricAuth: false,
      },
    },
  },
};

export default config;
