import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.piechat.app',
    appName: 'PieChat',
    webDir: 'out',
    server: {
        // For Android Emulator: use 10.0.2.2 to reach host machine's dev server
        // For real device: use LAN IP  
        // For production: use the deployed server URL
        url: 'https://piechat.site',
        cleartext: true,
        androidScheme: 'https',
    },
    android: {
        buildOptions: {
            keystorePath: undefined,
            keystoreAlias: undefined,
        },
    },
    plugins: {
        // Allow geolocation
        Geolocation: {
            // No special config needed
        },
    },
};

export default config;
