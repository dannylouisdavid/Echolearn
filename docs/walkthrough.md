# Echolearn MVP - Verification & Walkthrough

The Zero-Cost Mobile First MVP for **Echolearn** has been implemented using React Native (Expo) and Firebase.

## 1. Setup & Installation

Since this is an Expo project, you need the dependencies installed.
(I have already run this in the workspace, but for reference):
```bash
npm install
```

## 2. Configuration Requirements

Before running, you **must populate the Firebase Config**.
Open `src/services/firebaseConfig.ts` and replace the placeholder values with your real Firebase Project keys.
1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. Enable **Authentication** (Google Sign-In).
3. Enable **Firestore Database** (Create database).
4. Enable **Storage** (for future file uploads).
5. Copy the config object to the file.

## 3. Running the App

To start the development server:
```bash
npx expo start
```
*   Press `a` to open in Android Emulator (if set up).
*   Press `i` to open in iOS Simulator (Mac only).
*   Scan the QR code with your phone (using Expo Go app).

## 4. Feature Walkthrough

### A. Onboarding
1.  **Login**: Use the "Sign in with Google" button. (In Expo Go, this might use a web-based popup).
2.  **Role Selection**: Choose "Student".
3.  **Exam Target**: Select exams (e.g., "SAT") or type a custom one.

### B. Core Learning Loop
1.  **Dashboard**: You will see your stats (initially 0).
2.  **Notebooks**: Go to the "Notebooks" tab.
3.  **Create Notebook**: Click `+`, enter "Math", and Create.
4.  **Create Topic**: Tap "Math", click `+ Add Topic`, enter "Calculus" and "30" minutes.
5.  **Start Learning**: Tap the topic.
    *   **Draw**: Use your finger to draw notes on the canvas.
    *   **Focus Audio**: Tap the Volume icon (top right) to toggle White Noise.
    *   **Timer**: Tap "Start". Watch seconds count up.
    *   **End Session**: Tap "End".
6.  **Review**: Rate difficulty (1-10). The app will save your progress and schedule the next review.

### C. AI Exam Prep
1.  On the Dashboard, tap the purple **"Exam AI Tool"** card.
2.  Enter a generic Gemini API Key (or get one from Google AI Studio).
3.  Tap **Generate**.
4.  It will read your completed topics and generate 3 practice questions.

### D. Notifications
*   When you finish a review, the app schedules a local notification based on the SM-18 algorithm result.
*   (Note: Notification permission must be granted on first launch).

## 5. Known Limitations (Zero Cost Constraints)
*   **Audio**: Streamed from a fixed public URL for demo.
*   **AI**: Requires manual API key input (to avoid backend proxy costs).
*   **Drawings**: SVGs are stored as paths in memory/local logic for now (optimizations needed for heavy production use).

## 6. Next Steps
*   Deploy Firebase Security Rules.
*   Implement Teacher Dashboard.
