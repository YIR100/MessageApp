# MessageApp ✨

A modern, high-performance messaging application built with **React**, **Vite**, and **Capacitor**, powered by **Supabase**.

This app is designed to run seamlessly in the browser and as a native mobile application on Android and iOS.

## 🚀 Key Features

- **Real-time Messaging**: Instant message delivery powered by Supabase Realtime.
- **Media Attachments**: Send images and videos with a beautiful integrated viewer.
- **Read Receipts**: Visual markers (`✓✓`) to track when your messages have been read.
- **Local Push Notifications**: Receive alerts for new messages even when the app is in the background.
- **Message Management**: Edit or delete your sent messages with ease.
- **Modern UI**: A premium dark theme with glassmorphism, smooth animations, and a responsive layout for both PC and Mobile.
- **Secure Auth**: Full authentication system with username-based profiles.

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite
- **Styling**: Vanilla CSS (Custom Glassmorphism Design System)
- **Native Bridge**: Capacitor 8
- **Backend**: Supabase (Auth, DB, Realtime, Storage)

## ⚙️ Setup Instructions

### 1. Configure Environment
Create a `.env` file in the root directory (refer to `.env.example`):

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Development Mode (Browser)
```bash
npm run dev
```

### 4. Native Development (Android/iOS)
To run on a real device or emulator:

**Android:**
```bash
npm run android
```
*Note: Requires Android Studio installed.*

**iOS:**
```bash
npm run ios
```
*Note: Requires Xcode and a macOS environment.*

## 🗃️ Database Schema
The core database structure is defined in `supabase_schema.sql`. For advanced features like read receipts and media attachments, ensure you have applied all patches or the full schema provided in the SQL files.

## 📱 Platform Support
- **Web**: Chrome, Safari, Firefox, Edge
- **Android**: API Level 24+
- **iOS**: iOS 13+
