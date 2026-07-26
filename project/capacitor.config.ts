import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.proofdaftar.app',
  appName: 'بروف دفتر',
  webDir: 'out',
  server: {
    // للاختبار المباشر اثناء التطوير، يمكنك تفعيل السطر التالي
    // url: 'http://192.168.1.100:3000',
    // cleartext: true
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  ios: {
    contentInset: 'always',
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#020617',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#020617',
    },
    Keyboard: {
      resize: 'body',
      style: 'DARK',
    }
  }
};

export default config;
