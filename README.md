# MessageApp

A cross-platform messaging app built with React Native (Expo) + Supabase.
Supports 1:1 and group chats, real-time messaging, and typing indicators.
Runs on iOS, Android, and Web from one codebase.

---

## Setup Guide

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project (remember the password)
3. Once ready, go to **Settings → API** and copy:
   - **Project URL** → looks like `https://xxxx.supabase.co`
   - **anon public key** → long JWT string

### 2. Set up the database

1. In your Supabase dashboard, click **SQL Editor → New query**
2. Paste the entire contents of `supabase_schema.sql`
3. Click **Run** — this creates all tables, policies, and triggers

### 3. Configure the app

Open `src/lib/supabase.ts` and replace:

```ts
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
```

with your actual values from step 1.

### 4. Install dependencies & run

```bash
npm install
npx expo start
```

Then:
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Press `w` for Web browser
- Scan the QR code with **Expo Go** app to test on a real phone

### 5. Share remotely

To share with others over the internet:
```bash
npx expo start --tunnel
```
This gives a public URL others can open in Expo Go without being on your network.

---

## Project Structure

```
MessageApp/
├── App.tsx                          # Root entry point
├── app.json                         # Expo config
├── supabase_schema.sql              # Database setup (run once in Supabase)
├── src/
│   ├── lib/
│   │   ├── supabase.ts              # Supabase client + types
│   │   └── theme.ts                 # Design tokens (colors, fonts, spacing)
│   ├── hooks/
│   │   └── useAuth.tsx              # Auth context + session management
│   ├── navigation/
│   │   └── index.tsx                # Stack + Tab navigation
│   └── screens/
│       ├── AuthScreen.tsx           # Login / Register
│       ├── ConversationsScreen.tsx  # Conversation list
│       ├── ChatScreen.tsx           # Chat view with real-time messages
│       ├── NewConversationScreen.tsx# Start 1:1 or group chat
│       └── ProfileScreen.tsx        # Profile + sign out
```

---

## Features

- ✅ Email/password authentication
- ✅ 1:1 and group chats
- ✅ Real-time messages (Supabase Realtime)
- ✅ Typing indicators (broadcast)
- ✅ User search
- ✅ Profile management
- ✅ Works on iOS, Android, and Web

## Extending the App

Some ideas for next steps:
- **Push notifications** — use Expo Notifications + Supabase Edge Functions
- **Image messages** — use Supabase Storage for file uploads
- **Read receipts** — add a `read_at` column to messages
- **Message reactions** — add a `reactions` table
- **Delete/edit messages** — add update/delete policies in Supabase
