# Android App Structure

The Android app is located in the `android/` directory and is a native Kotlin project built using Gradle. It acts as a premium wrapper for your existing web dashboard.

## Key Components

- **`MainActivity.kt`**: Handles the WebView logic, including JavaScript injection, progress tracking, and error handling.
- **`activity_main.xml`**: Premium layout with a custom progress bar and error retry mechanism.
- **`build.gradle`**: Configured with modern dependencies (Material 3, WebView support).
- **`AndroidManifest.xml`**: Setup with Internet permissions and Hardware Acceleration.
- **`network_security_config.xml`**: Enables local development testing (allowing connections to local IP addresses like `10.0.2.2`).

## How to Run

1. **Open in Android Studio**: Open the `android` folder as a project in Android Studio.
2. **Build and Run**: Connect an Android device or start an emulator and click the "Run" button.
3. **Local Development**: By default, the app points to `http://10.0.2.2:5173`. Ensure your `client` is running (`npm run dev`) for the app to load.
4. **Production**: Update the `appUrl` in `MainActivity.kt` to your hosted Railway/Vercel URL.
