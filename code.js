import { marked } from "https://esm.run/marked";

// Shuttle AI API Integration with GitHub Secret
const API_KEY = process.env.API_KEY; // Using GitHub Secret injected as an environment variable

if (!API_KEY) {
  throw new Error("API_KEY is not defined. Please ensure it's set as a GitHub secret.");
}

// Shuttle AI API helper object
const shuttleAPI = {
  generateContent: async function (prompt, modelName = "gemini-1.5-flash-8b") {
    const response = await fetch("https://api.shuttle.ai/v1/text", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: modelName,
        prompt: prompt,
      }),
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.statusText}`);
    }
    const data = await response.json();
    return data.choices[0].text;
  },
};

// Helper function for chunking text
function chunkText(text, maxWords = 4000) {
  const words = text.split(/\s+/);
  const chunks = [];
  let currentChunk = [];
  for (let i = 0; i < words.length; i++) {
    currentChunk.push(words[i]);
    if (currentChunk.length >= maxWords || i === words.length - 1) {
      chunks.push(currentChunk.join(" "));
      currentChunk = [];
    }
  }
  return chunks;
}

// Function to punctuate text using Shuttle AI
async function punctuateText(text, vocab = "", lang = "en") {
  const prompt = `
    - Fix the grammar and typos of the given text.
    - Do not rephrase: keep the original wording but fix errors.
    - Write in ${lang}.
    - Use this vocabulary context: "${vocab}".
    - Text to process:
    """${text}"""
  `;
  try {
    return await shuttleAPI.generateContent(prompt);
  } catch (error) {
    console.error("Shuttle AI Error:", error);
    return text;
  }
}

// Function to summarize text using Shuttle AI
async function summarizeText(text, vocab = "", lang = "en") {
  const prompt = `
    - Summarize the following text concisely.
    - Use this vocabulary for context: "${vocab}".
    - Write the summary in ${lang}.
    - Text to summarize:
    """${text}"""
  `;
  try {
    return await shuttleAPI.generateContent(prompt);
  } catch (error) {
    console.error("Shuttle AI Error:", error);
    return "Error generating summary.";
  }
}

// Function to prepare vocabulary
async function createVocabulary(videoId, description = "", lang = "en") {
  const prompt = `
    - Extract important words and names from the following description.
    - Return a simple list separated by commas.
    - Description:
    """${description}"""
  `;
  try {
    return await shuttleAPI.generateContent(prompt);
  } catch (error) {
    console.error("Shuttle AI Error:", error);
    return "";
  }
}

// Main function to process transcript
async function processTranscript(videoId, transcript, languageCode, vocab) {
  const chunkedText = chunkText(transcript);
  let punctuatedChunks = [];

  for (const chunk of chunkedText) {
    const processed = await punctuateText(chunk, vocab, languageCode);
    punctuatedChunks.push(processed);
  }

  const fullText = punctuatedChunks.join("\n");
  const summary = await summarizeText(fullText, vocab, languageCode);

  // Render the processed content
  punctuated.innerHTML = `<p>${marked(fullText)}</p>`;
  summaryDiv.innerHTML = `<p>${marked(summary)}</p>`;
}

// Fetch local video data
async function getLocal(videoId, languageCode = "en") {
  // Replace with your logic to fetch video details and transcript
  const response = await fetch(`/api/video?videoId=${videoId}&language=${languageCode}`);
  if (!response.ok) {
    return { error: "Failed to fetch video data." };
  }
  return await response.json();
}

// Error display
function showError(msg) {
  summary.textContent = "";
  punctuated.textContent = msg;
}

// Event Listener for video processing
if (videoid) {
  vtitle.innerHTML = `<div>Loading video details...</div>`;
  punctuated.innerHTML = `<p>Processing transcript...</p>`;
  summary.innerHTML = `<p>Summarizing...</p>`;

  // Fetch video details and process transcript
  const videoData = await getLocal(videoid, languageCode);
  if (videoData.error) {
    showError("Error fetching video data.");
  } else {
    const transcript = videoData[languageCode].chunks.map((c) => c.text).join(" ");
    const vocab = await createVocabulary(videoid, videoData.description, languageCode);
    await processTranscript(videoid, transcript, languageCode, vocab);
  }
}
