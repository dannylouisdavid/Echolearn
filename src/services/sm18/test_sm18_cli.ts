import { calculateNextReview, INITIAL_SM18_STATE } from './algorithm';

const runTest = () => {
    console.log("--- Starting SM-18 Algorithm Verification ---");

    // Test Case 1: First Review (New Card)
    console.log("\n[Test 1] New Card (Difficulty 0.5 - Medium)");
    const t1 = calculateNextReview({ ...INITIAL_SM18_STATE, difficultyRating: 0.5 });
    console.log(`Input: Reps=0, RF=2.5, Int=0, Diff=0.5`);
    console.log(`Output: Reps=${t1.repetitionCount}, Int=${t1.interval} days`);
    if (t1.interval === 1 && t1.repetitionCount === 1) console.log("✅ PASS");
    else console.log("❌ FAIL");

    // Test Case 2: Second Review (Good)
    console.log("\n[Test 2] Second Review (previous Int=1, Diff=0.2 - Easy)");
    const t2 = calculateNextReview({
        repetitionCount: 1,
        rFactor: 2.5,
        interval: 1,
        difficultyRating: 0.2
    });
    console.log(`Input: Reps=1, RF=2.5, Int=1, Diff=0.2`);
    console.log(`Output: Reps=${t2.repetitionCount}, Int=${t2.interval} days`);
    // SM-2 rule: 2nd rep is usually 6 days
    if (t2.interval === 6 && t2.repetitionCount === 2) console.log("✅ PASS");
    else console.log("❌ FAIL");

    // Test Case 3: Third Review (Hard)
    console.log("\n[Test 3] Third Review (previous Int=6, Diff=0.9 - Very Hard)");
    const t3 = calculateNextReview({
        repetitionCount: 2,
        rFactor: 2.5,
        interval: 6,
        difficultyRating: 0.9
    });
    // q = 5 * (1-0.9) = 0.5 (Very low grade)
    // New RF should drop.
    // Interval = 6 * NewRF
    console.log(`Input: Reps=2, RF=2.5, Int=6, Diff=0.9`);
    console.log(`Output: Reps=${t3.repetitionCount}, RF=${t3.rFactor.toFixed(2)}, Int=${t3.interval} days`);

    if (t3.rFactor < 2.5 && t3.interval > 6) console.log("✅ PASS (RF dropped as expected)");
    else console.log("❌ FAIL");

    console.log("\n--- Verification Complete ---");
};

runTest();
