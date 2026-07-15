// Simple wrapper for Gemini 1.5 Flash API (REST)
// Pre-requisite: User must supply API Key or we use a demo key (Zero Cost strategy usually implies BYO Key or Free Tier with limits)

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent";

export async function generateExamQuestions(apiKey: string, examTarget: string, topics: string[]) {
    if (!apiKey) {
        throw new Error("Missing API Key");
    }

    const prompt = `
    You are an expert tutor for ${examTarget}.
    The student has studied the following topics: ${topics.join(", ")}.
    
    Please generate 3 relevant practice questions for these topics that would appear in the ${examTarget}.
    Format the output as a clean numbered list. Do not include answers, just the questions.
    `;

    try {
        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }]
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message);
        }

        return data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error("AI Generation Error: ", error);
        throw error;
    }
}
