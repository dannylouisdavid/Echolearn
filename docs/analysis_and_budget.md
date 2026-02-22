# Project Analysis & Budget Estimation

## 1. Platform Recommendation

**Recommendation:** **React Native (via Expo)**

*   **Rationale:**
    *   **Mobile First**: First-class support for iOS and Android from a single codebase.
    *   **Web Deferred**: React Native allows for "React Native for Web" later, sharing 90%+ code.
    *   **Zero Cost Maintenance**: Static bundles can be hosted easily; backend connectivity is simple.
    *   **Fast Iteration**: Hot reloading and OTA updates (via generic Expo updates) make maintenance easier.

**Alternative**: Flutter. (Good performance, but web support is distinct from mobile, specialized language Dart).

## 2. Budget Analysis

### Option A: Premium/Scaled Implementation (High Cost)
This scenario represents the **maximum typical cost** if we implement every requirement (including heavy AI, file storage, and dedicated servers) using paid, scalable commercial services immediately. Use this if budget is not a concern and you want maximum performance/limits.

*   **Compute/Backend**: $20-$50/month (if separate servers needed for audio processing or heavy logic).
*   **Database**: Scales with users.
*   **Storage**: Images/Audio/Teacher files. (e.g. AWS S3 or Firebase Storage). $5+ / month after free tier.
*   **AI (LLM)**: "Ask me questions" feature.
    *   GPT-4o/Claude 3.5 Sonnet: ~$5-$20 per million tokens. For active students, this could add up ($1-$5/user/month).
*   **Store Fees**:
    *   **Apple App Store**: $99 / year (Recurring).
    *   **Google Play Store**: $25 (One-time).

### Option B: Zero Cost MVP (Recommended Starting Point)
Implementing the core requirements while staying strictly within "Forever Free" tiers. This is the **mobile-first, zero-maintenance** approach you requested.

| Component | Strategy for Zero Cost | Limitations |
| :--- | :--- | :--- |
| **Backend & DB** | **Firebase (Spark Plan)** or **Supabase (Free Tier)** | Limited to specific usage quotas (e.g. 50k reads/day). Enough for hundreds of students. |
| **Auth** | **Firebase Auth** / **Supabase Auth** | Free (Unlimited or very high limits). |
| **Storage (Files)** | **Firebase Storage** / **Cloudinary Free** | Free tier is usually ~1GB - 10GB. Compress feedback images/audio. |
| **Logic (SM-18)** | **Client-Side Execution** | Run the memory algorithm on the phone. No server cost. |
| **AI Generation** | **Google Gemini Flash (Free Tier)** or **BYO Key** | Rate limits apply. Alternatively, ask user to input their own API Key. |
| **Hosting** | N/A (App runs on device) | |
| **Notifications** | **Firebase Cloud Messaging** | Free. |

**Total Estimated Monthly Maintenance Cost: $0.00**
*(Excluding the annual $99 Apple Developer fee which is mandatory for App Store presence)*

## 3. Technical Constraints & Risks for "Zero Cost"

1.  **AI Limits**: Free AI tiers often have low rate limits (RPM). If 50 students hit strict limits simultaneously during an exam pre-period, it might fail.
    *   *Mitigation*: Queue requests or simple fallback logic.
2.  **Storage**: 1GB fills up fast if students upload high-res photos.
    *   *Mitigation*: Enforce strict compression (WebP) and resizing on the client before upload.
3.  **Role Based Access**:
    *   Implemented via **Row Level Security (RLS)** in Supabase or **Firestore Rules**. Secure and free/builtin.

## 4. Proposed MVP Scope (Zero Cost)
To stay strictly within the free tier:

*   **Mobile Only**: iOS and Android.
*   **Auth**: Google Sign-in only (as requested).
*   **Core Loop**: Topic Creation -> Timer -> SM-18 Schedling -> Notifications -> Review.
*   **AI**: "Beta" label. Use a free tier API (e.g., Gemini 1.5 Flash).
*   **Audio**: Stream from public URLs or include a small set of lo-fi tracks in the app bundle (avoid bandwidth costs).
*   **Teacher Uploads**: Restrict to PDF only (smaller size) and set max file size (e.g. 5MB).

## 5. Next Steps
1.  **Confirm Platform**: Proceed with React Native (Expo)?
2.  **Approve MVP Logic**: Agree to perform SM-18 calculations on-device?
3.  **Approve AI Strategy**: Agree to use Free Tier API limits?
