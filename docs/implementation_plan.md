# Implementation Plan: Zero Cost MVP

# Goal Description
Build a "Zero Cost" MVP of the Spaced Repetition Learning App using React Native (Expo). The goal is to maximize features while staying strictly within free-tier limits of cloud services.

**Key Constraints:**
*   **Platform:** React Native (Expo) - Mobile First (Android/iOS).
*   **Backend Cost:** $0.00/month (Free Tier Strategy).
*   **Logic:** SM-18 Algorithm runs on-device.
*   **Audio:** Streamed from public URLs (no internal hosting/upload for MVP).
*   **Teacher Uploads:** Max 5MB per page. Allowed: PDF, PPT/PPTX, DOC/DOCX, XLS, Links.

## User Review Required
> [!IMPORTANT]
> **File Storage Limit:** We will enforce a strict **5MB hard limit** per page for attachments to prevent filling the minimal free tier storage (usually 1-5GB) too quickly.

> [!NOTE]
> **AI Usage:** We will use **Google Gemini Flash (Free Tier)**. Rate limits apply (e.g., 15 requests per minute). Brief delays may occur during peak usage.

## Proposed Tech Stack
*   **Frontend**: React Native with Expo (Managed Workflow).
*   **Auth**: Firebase Auth (Google Sign-in).
*   **Database**: Firestore (NoSQL) or Supabase (PostgreSQL). *Recommendation: Firebase (Firestore) for easier offline sync and deep React Native integration.*
*   **Storage**: Firebase Storage (for Teacher uploads & Student drawings).
*   **Navigation**: Expo Router (File-based routing).
*   **State Management**: React Context + TanStack Query.

## Proposed Changes / File Structure

### Project Setup
#### [NEW] `package.json` & Configuration
Standard Expo setup with TypeScript.
*   `expo-av` for Audio playback.
*   `@react-native-firebase/app` (or JS SDK equivalent for Expo Go compatibility).
*   `react-native-skia` or `react-native-svg` for the Drawing Canvas.

### Core Modules

#### [NEW] `src/services/auth`
*   Handle Google OAuth login.
*   Manage Role Selection (Student/Teacher/Parent) via User Metadata or a specific `users` collection.

#### [NEW] `src/services/sm18`
*   **Pure JS Implementation** of the SuperMemo-18 algorithm.
*   Input: `difficulty`, `retention_target`, `history`.
*   Output: `next_review_date`.
*   Runs locally on the device immediately after "End Timer".

#### [NEW] `src/components/canvas`
*   Drawing canvas component for "Page Canvas".
*   Supports: Freehand drawing (Skia/SVG), Text overlay, Image placement.

#### [NEW] `src/services/ai`
*   Connector to Gemini Flash API.
*   Prompt engineering for "Exam Question Generation".
*   *Fallback*: Graceful error message if rate limit is hit.

### Data Model (Schema Design)

#### [NEW] `src/types/schema.ts`
TypeScript interfaces for the database:
*   **Users**: `{ uid, role, linked_users: [] }`
*   **Notebooks**: `{ id, title, owner_id, shared_with: [], type: 'general' | 'teacher_created' }`
*   **Pages**: `{ id, notebook_id, title, planned_time, actual_time, content_json, attachments: [], sm18_data: {} }`

## Verification Plan

### Automated Tests
*   **Unit Tests**: Verify SM-18 algorithm math (inputs -> expected dates).
*   **Component Tests**: Render Login Screen, Role Switcher.

### Manual Verification
1.  **Auth Flow**: Login -> Select "Student" -> Verify onboarding visible.
2.  **Core Loop**: Create Page -> Draw -> Start Timer -> End Timer -> Rate Difficulty -> Check Notification Schedule.
3.  **Upload Limit**: Attempt to upload a 6MB PDF -> Verify "File too large" error.
4.  **AI**: Click "Ask Questions" -> Verify relevant questions generated.
