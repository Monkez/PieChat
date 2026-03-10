import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.piechat.app',
    appName: 'PieChat',
    webDir: 'out',
    server: {
        // For development: point to your Next.js dev server on LAN
        // Replace with your PC's LAN IP when testing on a real device
        url: 'http://192.168.1.44:3000',
        cleartext: true,
        androidScheme: 'https',
    },
    android: {
        buildOptions: {
            keystorePath: undefined,
            keystoreAlias: undefined,
        },
    },
};

export default config;
