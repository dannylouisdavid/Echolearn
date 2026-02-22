/**
 * SuperMemo-18 (Simplified) Algorithm Implementation
 * 
 * Inputs:
 * - repetitionCount (n): Number of times successfully recalled
 * - rFactor (r): Retrievability factor / easiness (current interval multiplier)
 * - difficulty (d): User rating (0-1, where 1 is hardest)
 * - previousInterval (i): Days involved in last interval
 * 
 * Outputs:
 * - interval: New interval in days
 * - rFactor: New rFactor
 */

interface ReviewInput {
    repetitionCount: number;
    rFactor: number; // Previous easiness factor (starts at 2.5)
    interval: number; // Previous interval in days
    difficultyRating: number; // 0 (Easy) to 1 (Hard). User input mapped from 1-10.
    retentionTarget?: number; // Target retention rate (e.g., 0.9 for 90%)
}

interface ReviewOutput {
    interval: number;
    rFactor: number;
    repetitionCount: number;
    nextReviewDate: number; // Timestamp
}

export function calculateNextReview(input: ReviewInput): ReviewOutput {
    let { repetitionCount, rFactor, interval, difficultyRating, retentionTarget } = input;

    // Default retention target to 0.9 (90%) if not specified
    const targetR = retentionTarget || 0.9;

    // 1. Update Repetition Count
    repetitionCount += 1;

    // 2. Calculate new R-Factor (Easiness)
    // Formula: R' = R + (0.1 - (5 * difficulty) * (0.08 + (5 * difficulty) * 0.02))
    // Note: difficultyRating is 0 (easy) to 1 (hard).
    const q = 5 * (1 - difficultyRating);
    let newRFactor = rFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));

    if (newRFactor < 1.3) newRFactor = 1.3; // Minimum floor

    // 3. Calculate Interval (Standard SM-2 for 90% retention)
    let newInterval = 1;

    if (repetitionCount === 1) {
        newInterval = 1;
    } else if (repetitionCount === 2) {
        newInterval = 6;
    } else {
        newInterval = Math.round(interval * newRFactor);
    }

    // 4. Adjust Interval for Custom Retention Target
    // Formula: I_target = I_standard * (log(Target) / log(0.9))
    // Only adjust if target is different from standard 0.9 and interval > 1
    if (Math.abs(targetR - 0.9) > 0.001 && newInterval > 1) {
        const adjustmentFactor = Math.log(targetR) / Math.log(0.9);
        newInterval = Math.round(newInterval * adjustmentFactor);
        // Ensure interval doesn't drop below 1
        if (newInterval < 1) newInterval = 1;
    }

    // 5. Calculate Next Date
    const nextReviewDate = Date.now() + (newInterval * 24 * 60 * 60 * 1000);

    return {
        interval: newInterval,
        rFactor: newRFactor,
        repetitionCount,
        nextReviewDate
    };
}

export const INITIAL_SM18_STATE = {
    repetitionCount: 0,
    rFactor: 2.5,
    interval: 0
};
// --- Memory Analytics Helpers ---

interface RetrievabilityInput {
    lastReviewDate?: number; // timestamp
    interval: number; // days
    retentionTarget?: number; // 0.9 default
}

/**
 * Calculates current Memory Strength (Retrievability) as a percentage (0.0 to 1.0).
 * Based on the forgetting curve: R = exp( (t/S) * ln(Target) ) where S is stability (interval).
 */
export function calculateRetrievability(input: RetrievabilityInput): number {
    const { lastReviewDate, interval, retentionTarget } = input;

    // 1. If never reviewed, strength is effectively 0 (or undefined).
    // For our app, incomplete pages shouldn't show a strength, but safe fallback is 0.
    if (!lastReviewDate || interval <= 0) return 0;

    // 2. Calculate time elapsed in days
    const now = Date.now();
    const elapsedMs = now - lastReviewDate;
    const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);

    // 3. Get User's Target (default 0.9)
    const target = retentionTarget || 0.9;

    // 4. Formula: R = exp( (t / I) * ln(T) )
    // If t=0, exp(0) = 1 (100%)
    // If t=I, exp(1 * ln(T)) = T (90%)
    const retrievability = Math.exp((elapsedDays / interval) * Math.log(target));

    // Clamp between 0 and 1
    return Math.max(0, Math.min(1, retrievability));
}

export function formatRetrievability(r: number): string {
    return `${Math.round(r * 100)}%`;
}
