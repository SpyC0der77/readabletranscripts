import { marked } from "https://esm.run/marked";

// Fetch API Key from meta tag
const API_KEY = document.querySelector('meta[name="api-key"]').content;

if (!API_KEY) {
  throw new Error("API_KEY is not defined. Please ensure it's set in the meta tag.");
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

// Function to process transcript using Shuttle AI
async function processTranscript(transcript, lang = "en") {
  const chunkedText = chunkText(transcript);
  let processedChunks = [];

  for (const chunk of chunkedText) {
    const prompt = `
      - Fix grammar and typos in the following text.
      - Write in ${lang}.
      - Text to process: """${chunk}"""
    `;
    const result = await shuttleAPI.generateContent(prompt);
    processedChunks.push(result);
  }

  return processedChunks.join("\n");
}

// Function to handle the API call and render results
async function handleTranscript(videoId, transcript, lang = "en") {
  try {
    const processedTranscript = await processTranscript(transcript, lang);
    const summaryPrompt = `
      - Summarize the following transcript.
      - Write the summary in ${lang}.
      - Transcript: """${processedTranscript}"""
    `;
    const summary = await shuttleAPI.generateContent(summaryPrompt);

    // Render results
    document.getElementById("punctuated").innerHTML = `<p>${marked(processedTranscript)}</p>`;
    document.getElementById("summary").innerHTML = `<p>${marked(summary)}</p>`;
  } catch (error) {
    console.error("Error processing transcript:", error);
    document.getElementById("punctuated").innerHTML = "<p>Error processing transcript.</p>";
  }
}

// Example usage
const exampleTranscript = "this is an example transcript to process.";
const videoId = "example_video_id"; // Replace with actual video ID
handleTranscript(videoId, exampleTranscript, "en");
