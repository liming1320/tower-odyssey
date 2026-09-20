# Android APK

`npm run apk:build` packages the offline Space Cadet Pinball PWA into an installable Android debug APK.

## One-time setup

1. Install JDK 17 or newer.
2. Install Android Studio and use its SDK Manager to install Android SDK Platform 36 and Android SDK Build-Tools.
3. Set `ANDROID_HOME` to the Android SDK directory, for example `C:\\Users\\<user>\\AppData\\Local\\Android\\Sdk`.
4. Install project dependencies with `npm install`.

## Build

```powershell
npm run apk:build
```

The command rebuilds the offline PWA, creates or syncs the Capacitor Android project, and writes the APK to:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

The debug APK can be transferred to an Android device and installed directly. Android may ask you to allow the app used to open the file to install unknown apps.

The debug APK is intended for personal installation. A distributable release APK requires an Android signing key and a release signing configuration in Android Studio. Keep that key permanently because later updates must use the same key.
