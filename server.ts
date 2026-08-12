import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";

dotenv.config();

export const app = express();
const PORT = 3000;

app.use(express.json({ limit: "25mb" }));

// Enable CORS for cross-origin or Vercel serverless requests
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Helper to format API error messages cleanly
function formatErrorMessage(error: any): string {
  if (!error) return "An unknown error occurred.";
  let msg = typeof error === "string" ? error : error?.message || String(error);

  try {
    const parsed = JSON.parse(msg);
    if (parsed?.error?.message) {
      msg = parsed.error.message;
    }
  } catch (e) {
    // Not JSON string
  }

  // Sanitize Google API rate limit / quota details for user-friendly display
  if (msg.includes("Quota exceeded") || msg.includes("rate-limits") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("429")) {
    const retryMatch = msg.match(/retry in ([0-9.]+\s*s)/i);
    const retryInfo = retryMatch ? ` Please retry in ${retryMatch[1]}.` : " Please wait a few moments before trying again.";
    return `API Quota / Rate Limit Exceeded: Your API key has reached its request quota.${retryInfo} You can check your billing plan or generate a new key in Google AI Studio.`;
  }

  if (msg.includes("API key not valid") || msg.includes("API_KEY_INVALID") || msg.includes("invalid_api_key")) {
    return "Invalid API Key: Please verify your API key in settings or generate a new one from your provider console.";
  }

  return msg;
}

// Helper to clean and parse JSON from AI string
function cleanAndParseJson<T = any>(rawText: string): T {
  if (!rawText || typeof rawText !== "string") {
    throw new Error("Empty string received from AI.");
  }

  let cleaned = rawText
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (_e) {
    const arrayMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (arrayMatch) {
      try { return JSON.parse(arrayMatch[0]); } catch (_e2) {}
    }
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try { return JSON.parse(objectMatch[0]); } catch (_e3) {}
    }
    throw new Error(`AI response could not be parsed as valid JSON.`);
  }
}

// Helper to initialize GenAI client safely
function getGenAIClient(customApiKey?: string) {
  const key = customApiKey?.trim() || process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Helper to call OpenAI / Groq / OpenRouter compatible REST API
async function callOpenAICompatible(
  provider: string,
  apiKey: string,
  prompt: string,
  systemInstruction: string,
  modelName?: string
): Promise<string> {
  let endpoint = "https://api.openai.com/v1/chat/completions";
  let defaultModel = "gpt-4o-mini";

  let cleanKey = apiKey?.trim().replace(/^["']|["']$/g, "") || "";
  if (cleanKey.toLowerCase().startsWith("bearer ")) {
    cleanKey = cleanKey.slice(7).trim();
  }

  if (provider === "groq" || cleanKey.startsWith("gsk_")) {
    endpoint = "https://api.groq.com/openai/v1/chat/completions";
    defaultModel = "llama-3.3-70b-versatile";
  } else if (provider === "openrouter" || cleanKey.startsWith("sk-or-")) {
    endpoint = "https://openrouter.ai/api/v1/chat/completions";
    defaultModel = "google/gemini-2.0-flash-001";
  }

  if (!cleanKey) {
    throw new Error(`${provider.toUpperCase()} API Key is missing. Please enter your API key in Gradeup AI settings.`);
  }

  const model = modelName || defaultModel;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cleanKey}`,
      "Content-Type": "application/json",
      ...(provider === "openrouter" || cleanKey.startsWith("sk-or-") ? { "HTTP-Referer": "https://gradeupstudy.com", "X-Title": "Gradeup Study AI" } : {})
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: `${systemInstruction} Return response strictly in valid JSON format.` },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  const responseText = await res.text();
  if (!res.ok) {
    let errDetail = `HTTP ${res.status}`;
    try {
      const errObj = JSON.parse(responseText);
      if (errObj?.error?.message) {
        errDetail = errObj.error.message;
      } else if (errObj?.message) {
        errDetail = errObj.message;
      } else if (errObj?.error) {
        errDetail = typeof errObj.error === "string" ? errObj.error : JSON.stringify(errObj.error);
      }
    } catch (_e) {
      errDetail = responseText.slice(0, 120);
    }
    throw new Error(`${provider.toUpperCase()} API Error: ${errDetail}`);
  }

  const data = JSON.parse(responseText);
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${provider.toUpperCase()} returned an empty response.`);
  return content;
}

// Helper to call Ollama local REST API
async function callOllamaServer(
  prompt: string,
  systemInstruction: string,
  modelName?: string,
  baseUrl?: string
): Promise<string> {
  const rawHost = (baseUrl || "http://localhost:11434").trim().replace(/\/+$/, "");
  let host = rawHost;
  if (!host.startsWith("http://") && !host.startsWith("https://")) {
    host = `http://${host}`;
  }

  try {
    new URL(host);
  } catch (_e) {
    throw new Error(`Invalid Base URL: '${rawHost}'. Please enter a valid URL like http://localhost:11434.`);
  }

  const model = (modelName || "qwen3:8b").trim();
  const endpoint = `${host}/api/chat`;

  let res: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: `${systemInstruction} Return response strictly in valid JSON format.` },
          { role: "user", content: prompt },
        ],
        stream: false,
        format: "json",
      }),
    });
  } catch (netErr: any) {
    if (netErr.name === "AbortError") {
      throw new Error(`Connection to Ollama at ${host} timed out. Please check if Ollama is responsive.`);
    }
    throw new Error(`Ollama is not running. Please start Ollama at ${host}.`);
  } finally {
    clearTimeout(timeoutId);
  }

  const responseText = await res.text();

  if (!res.ok) {
    let errDetail = `HTTP ${res.status}`;
    try {
      const errObj = JSON.parse(responseText);
      if (errObj?.error) {
        errDetail = typeof errObj.error === "string" ? errObj.error : JSON.stringify(errObj.error);
      }
    } catch (_e) {
      errDetail = responseText.slice(0, 120);
    }
    if (errDetail.toLowerCase().includes("not found")) {
      throw new Error(`Ollama Error: Model '${model}' not found. Please run 'ollama pull ${model}' in your terminal.`);
    }
    throw new Error(`Ollama API Error: ${errDetail}`);
  }

  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch (_e) {
    throw new Error(`Ollama returned invalid JSON response: ${responseText.slice(0, 100)}`);
  }

  const content = data.message?.content || data.response;
  if (!content) {
    throw new Error("Ollama returned an empty response.");
  }
  return content;
}

function parseKeysListServer(input: any): string[] {
  if (!input) return [];
  let rawItems: string[] = [];
  if (Array.isArray(input)) {
    rawItems = input.map(k => String(k));
  } else if (typeof input === 'string') {
    rawItems = [input];
  } else {
    rawItems = [String(input)];
  }

  const result: string[] = [];
  for (const item of rawItems) {
    const parts = item
      .split(/[\n,;\r\s]+/)
      .map(k => k.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
    result.push(...parts);
  }
  return Array.from(new Set(result));
}

async function executeSingleTargetServer(
  provider: string,
  apiKey: string,
  prompt: string,
  systemInstruction: string,
  modelName?: string,
  baseUrl?: string
): Promise<string> {
  let cleanKey = apiKey?.trim().replace(/^["']|["']$/g, "") || "";
  if (cleanKey.toLowerCase().startsWith("bearer ")) {
    cleanKey = cleanKey.slice(7).trim();
  }

  const detectedProvider =
    provider ||
    (cleanKey.startsWith("tvly-")
      ? "tavily"
      : cleanKey.startsWith("gsk_")
      ? "groq"
      : cleanKey.startsWith("sk-or-")
      ? "openrouter"
      : cleanKey.startsWith("sk-")
      ? "openai"
      : "gemini");

  if (detectedProvider === "deepl" || cleanKey.endsWith(":fx") || cleanKey.includes(":fx")) {
    if (!cleanKey) {
      throw new Error("DeepL API Key is missing.");
    }
    const isFree = cleanKey.endsWith(":fx") || cleanKey.includes(":fx");
    const deeplUrl = isFree ? "https://api-free.deepl.com/v2/translate" : "https://api.deepl.com/v2/translate";
    const deeplRes = await fetch(deeplUrl, {
      method: "POST",
      headers: {
        "Authorization": `DeepL-Auth-Key ${cleanKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: [prompt.slice(0, 2000)],
        target_lang: "HI"
      })
    });
    if (!deeplRes.ok) {
      const errText = await deeplRes.text();
      let parsedMsg = errText;
      try {
        const parsedErr = JSON.parse(errText);
        if (parsedErr.message) parsedMsg = parsedErr.message;
      } catch (e) {}
      throw new Error(`DeepL API Error (${deeplRes.status}): ${parsedMsg.slice(0, 120)}`);
    }
    const data = await deeplRes.json();
    return data.translations?.[0]?.text || "";
  } else if (detectedProvider === "tavily" || cleanKey.startsWith("tvly-")) {
    if (!cleanKey) {
      throw new Error("Tavily API Key is missing.");
    }
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: cleanKey,
        query: `${systemInstruction}\n\n${prompt}`.slice(0, 1000),
        search_depth: "advanced",
        include_answer: true,
        max_results: 3
      })
    });
    const responseText = await res.text();
    if (!res.ok) {
      throw new Error(`Tavily API Error (HTTP ${res.status}): ${responseText.slice(0, 120)}`);
    }
    const data = JSON.parse(responseText);
    const ans = data.answer || (data.results || []).map((r: any) => r.content).join("\n");
    if (!ans) throw new Error("Tavily returned empty response.");
    return ans;
  } else if (detectedProvider === "ollama") {
    return await callOllamaServer(prompt, systemInstruction, modelName, baseUrl);
  } else if (detectedProvider === "gemini" || cleanKey.startsWith("AIza") || cleanKey.startsWith("AQ.") || (!cleanKey && !provider)) {
    const ai = getGenAIClient(cleanKey);
    if (!ai) {
      throw new Error("Google Gemini API Key is missing and process.env.GEMINI_API_KEY is not configured.");
    }
    const targetModel = modelName && modelName.trim() ? modelName.trim() : "gemini-3.6-flash";
    const response = await ai.models.generateContent({
      model: targetModel,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      },
    });
    if (!response.text) {
      throw new Error("Gemini API returned an empty text response.");
    }
    return response.text.trim();
  } else {
    if (!cleanKey) {
      throw new Error(`API Key for ${detectedProvider.toUpperCase()} is required.`);
    }
    return await callOpenAICompatible(detectedProvider, cleanKey, prompt, systemInstruction, modelName);
  }
}

// Server-Side Stateful Key Pointer & Model-Scoped Cooldown Registry
const serverKeyPointerMap: Record<string, number> = {};
const serverKeyCooldowns = new Map<string, number>();

function getServerCooldownKey(key: string, modelName?: string): string {
  return modelName ? `${key}:${modelName}` : key;
}

function isServerKeyInCooldown(key: string, modelName?: string): boolean {
  if (!key) return false;
  const cKey = getServerCooldownKey(key, modelName);
  const exp = serverKeyCooldowns.get(cKey);
  if (!exp) return false;
  if (Date.now() >= exp) {
    serverKeyCooldowns.delete(cKey);
    return false;
  }
  return true;
}

function markServerKeyCooldown(key: string, modelName?: string, ms = 60000): void {
  if (!key) return;
  const cKey = getServerCooldownKey(key, modelName);
  serverKeyCooldowns.set(cKey, Date.now() + ms);
  console.warn(`[Server API Shift Engine] Target Key (${key.slice(0, 10)}... / ${modelName || 'default'}) cooling down for ${Math.round(ms / 1000)}s.`);
}

function isServerRateLimitError(errText: string): boolean {
  if (!errText) return false;
  const lower = String(errText).toLowerCase();
  return (
    lower.includes('quota') ||
    lower.includes('rate-limit') ||
    lower.includes('rate limit') ||
    lower.includes('resource_exhausted') ||
    lower.includes('429') ||
    lower.includes('too many requests') ||
    lower.includes('limit exceeded') ||
    lower.includes('exceeded your current quota') ||
    lower.includes('per-minute') ||
    lower.includes('per-day') ||
    lower.includes('free_tier')
  );
}

// Unified Multi-Key & Multi-Provider Fallback Execution Helper
async function executeAiCallServer(
  configOrProvider: any,
  apiKeyOrPrompt: any,
  promptOrSystem: any,
  systemOrModel?: any,
  modelOrBaseUrl?: any,
  baseUrlInput?: any
): Promise<string> {
  let primaryProvider = "gemini";
  let primaryApiKey = "";
  let primaryKeysList: string[] = [];
  let reqPrompt = "";
  let reqSystem = "";
  let reqModel = "";
  let reqBaseUrl = "";
  let fallbackProviders: any[] = [];

  if (typeof configOrProvider === "object" && configOrProvider !== null) {
    const cfg = configOrProvider;
    primaryProvider = cfg.provider || "gemini";
    primaryApiKey = cfg.apiKey || "";
    primaryKeysList = parseKeysListServer(cfg.apiKeysList || cfg.apiKey);
    reqPrompt = apiKeyOrPrompt || cfg.prompt || "";
    reqSystem = promptOrSystem || cfg.systemInstruction || "";
    reqModel = cfg.model || systemOrModel || "";
    reqBaseUrl = cfg.baseUrl || modelOrBaseUrl || "";
    fallbackProviders = Array.isArray(cfg.fallbackProviders) ? cfg.fallbackProviders : [];
  } else {
    primaryProvider = configOrProvider || "gemini";
    primaryApiKey = apiKeyOrPrompt || "";
    primaryKeysList = parseKeysListServer(apiKeyOrPrompt);
    reqPrompt = promptOrSystem || "";
    reqSystem = systemOrModel || "";
    reqModel = modelOrBaseUrl || "";
    reqBaseUrl = baseUrlInput || "";
  }

  interface ServerTarget {
    provider: string;
    apiKey: string;
    modelName?: string;
    baseUrl?: string;
    label: string;
    keyIndex: number;
    totalKeys: number;
  }

  const targets: ServerTarget[] = [];

  const addTargetsForProvider = (p: string, rawKey: any, customKeysList?: any, m?: string, bUrl?: string) => {
    let keys = customKeysList && Array.isArray(customKeysList) && customKeysList.length > 0
      ? customKeysList.map((k: any) => String(k).trim()).filter(Boolean)
      : parseKeysListServer(rawKey);

    if (keys.length === 0) {
      if (p === "gemini" || p === "ollama") {
        keys = [""];
      }
    }

    if (keys.length === 0) return;

    let modelsToTry = [m || (p === "gemini" ? "gemini-3.6-flash" : "")];
    if (p === "gemini") {
      const primaryM = m && m.trim() ? m.trim() : "gemini-3.6-flash";
      modelsToTry = [primaryM];
      if (primaryM !== "gemini-2.0-flash") modelsToTry.push("gemini-2.0-flash");
      if (primaryM !== "gemini-2.0-flash-lite") modelsToTry.push("gemini-2.0-flash-lite");
    } else if (p === "groq") {
      const primaryM = m && m.trim() ? m.trim() : "llama-3.3-70b-versatile";
      modelsToTry = [primaryM];
      if (primaryM !== "llama-3.1-8b-instant") modelsToTry.push("llama-3.1-8b-instant");
      if (primaryM !== "mixtral-8x7b-32768") modelsToTry.push("mixtral-8x7b-32768");
      if (primaryM !== "gemma2-9b-it") modelsToTry.push("gemma2-9b-it");
    }

    if (serverKeyPointerMap[p] === undefined) {
      serverKeyPointerMap[p] = 0;
    }
    const pointer = serverKeyPointerMap[p] || 0;

    for (const modelToUse of modelsToTry) {
      for (let offset = 0; offset < keys.length; offset++) {
        const idx = (pointer + offset) % keys.length;
        targets.push({
          provider: p,
          apiKey: keys[idx],
          modelName: modelToUse,
          baseUrl: bUrl,
          label: `${p.toUpperCase()} (${modelToUse || 'default'}) Key ${idx + 1}/${keys.length}`,
          keyIndex: idx,
          totalKeys: keys.length
        });
      }
    }
  };

  // 1. Add primary provider targets
  addTargetsForProvider(primaryProvider, primaryApiKey, primaryKeysList, reqModel, reqBaseUrl);

  // 2. Add fallback providers targets
  if (Array.isArray(fallbackProviders)) {
    fallbackProviders.forEach((fp: any) => {
      if (fp && fp.provider) {
        addTargetsForProvider(fp.provider, fp.apiKey, fp.apiKeysList, fp.model, fp.baseUrl);
      }
    });
  }

  // 3. Fallback to Gemini Server Key if process.env.GEMINI_API_KEY is configured and not in list
  if (process.env.GEMINI_API_KEY) {
    const hasEnv = targets.some(t => t.provider === "gemini" && (t.apiKey === "" || t.apiKey === process.env.GEMINI_API_KEY));
    if (!hasEnv) {
      targets.push({
        provider: "gemini",
        apiKey: process.env.GEMINI_API_KEY,
        modelName: "gemini-3.6-flash",
        label: "GEMINI (Server Default Key)",
        keyIndex: 0,
        totalKeys: 1
      });
    }
  }

  const readyTargets = targets.filter(t => !t.apiKey || !isServerKeyInCooldown(t.apiKey, t.modelName));
  const cooledTargets = targets.filter(t => t.apiKey && isServerKeyInCooldown(t.apiKey, t.modelName));
  const orderedTargets = readyTargets.length > 0 ? [...readyTargets, ...cooledTargets] : targets;

  let lastErr: any = null;
  const targetErrors: string[] = [];

  for (let i = 0; i < orderedTargets.length; i++) {
    const target = orderedTargets[i];

    if (target.apiKey && isServerKeyInCooldown(target.apiKey, target.modelName) && readyTargets.length > 0) {
      console.warn(`[Server API Shift] Key ${target.label} is cooling down. Skipping...`);
      continue;
    }

    try {
      console.log(`[Server API Shift Engine] Attempt ${i + 1}/${orderedTargets.length}: ${target.label}`);
      const responseText = await executeSingleTargetServer(
        target.provider,
        target.apiKey,
        reqPrompt,
        reqSystem,
        target.modelName || reqModel,
        target.baseUrl || reqBaseUrl
      );
      if (responseText) {
        if (target.totalKeys > 1) {
          const nextIdx = (target.keyIndex + 1) % target.totalKeys;
          serverKeyPointerMap[target.provider] = nextIdx;
        }
        return responseText;
      }
    } catch (err: any) {
      lastErr = err;
      const errMsg = err.message || String(err);
      targetErrors.push(`${target.label}: ${errMsg}`);

      markServerKeyCooldown(target.apiKey, target.modelName, 60000);
      if (target.totalKeys > 1) {
        serverKeyPointerMap[target.provider] = (target.keyIndex + 1) % target.totalKeys;
      }
      console.warn(`[Server API Shift Engine] Target ${target.label} failed: ${errMsg}. AUTOMATICALLY SHIFTING to next target...`);
    }
  }

  if (targetErrors.length > 1) {
    const primaryErr = targetErrors[0];
    const fallbackErrs = targetErrors.slice(1).join(' | ');
    throw new Error(`[All AI Providers Exhausted] Primary Provider: ${primaryErr}. Failovers Attempted: ${fallbackErrs}`);
  }

  throw lastErr || new Error("All configured AI API keys and fallback providers were exhausted or rate-limited.");
}

// Fallback Educational Question Generator Engine
function generateFallbackQuestions(
  subject: string = "General Studies",
  chapter: string = "General Concepts",
  count: number = 5,
  difficulty: string = "Moderate"
) {
  const subjName = subject.trim() || "General Studies";
  const chapName = chapter.trim() || "Core Concepts";

  const questionTemplates = [
    {
      q: `Which fundamental principle best defines the core framework of ${chapName} in ${subjName}?`,
      a: `Systematic analytical methodology and standardized procedural guidelines`,
      b: `Arbitrary executive decision-making without empirical validation`,
      c: `Exclusive reliance on unverified offline legacy records`,
      d: `Randomized parameter allocation without defined constraints`,
      ans: "A",
      exp: `The core framework of ${chapName} in ${subjName} relies on a structured, standardized analytical methodology to ensure consistency and academic accuracy.`,
    },
    {
      q: `In the context of ${subjName}, what is the primary objective of ${chapName} during systematic evaluation?`,
      a: `Establishing benchmark performance metrics and procedural validity`,
      b: `Eliminating all quantitative measurement parameters`,
      c: `Replacing core institutional guidelines with informal practices`,
      d: `Restricting access to verifiable data sources`,
      ans: "A",
      exp: `${chapName} serves as a critical benchmark within ${subjName} to validate procedural accuracy and maintain high examination standards.`,
    },
    {
      q: `Which statement accurately describes a key characteristic associated with ${chapName}?`,
      a: `It integrates multi-step logical verification with empirical observation`,
      b: `It operates independently of foundational principles in ${subjName}`,
      c: `It strictly prohibits iterative feedback and revision`,
      d: `It applies exclusively to theoretical models with no practical utility`,
      ans: "A",
      exp: `${chapName} combines logical verification with practical application, making it essential for problem solving in ${subjName}.`,
    },
    {
      q: `When analyzing complex problems in ${subjName} (${chapName}), which approach yields the most accurate results?`,
      a: `Structured step-by-step comparative analysis`,
      b: `Ignoring contextual variables and historical data`,
      c: `Relying solely on single-instance assumptions`,
      d: `Bypassing standard verification protocols`,
      ans: "A",
      exp: `A structured comparative analysis reduces bias and provides rigorous, verifiable outcomes in ${subjName}.`,
    },
    {
      q: `What is the significance of mastering ${chapName} for competitive examinations in ${subjName}?`,
      a: `It forms the foundational conceptual base for high-weightage topics`,
      b: `It is purely optional with zero relevance to exam syllabi`,
      c: `It only requires memorization of isolated key terms without understanding`,
      d: `It contradicts standard reference textbook guidelines`,
      ans: "A",
      exp: `Mastery over ${chapName} builds a strong conceptual foundation, enabling candidates to solve both direct and analytical exam questions efficiently.`,
    },
  ];

  const results = [];
  for (let i = 0; i < count; i++) {
    const tpl = questionTemplates[i % questionTemplates.length];
    results.push({
      subject: subjName,
      chapter: chapName,
      question: `${tpl.q} [Q${i + 1}]`,
      optionA: tpl.a,
      optionB: tpl.b,
      optionC: tpl.c,
      optionD: tpl.d,
      answer: tpl.ans,
      explanation: tpl.exp,
      difficulty: difficulty || (i % 3 === 0 ? "Easy" : i % 3 === 1 ? "Moderate" : "Hard"),
    });
  }

  return results;
}

// Helper to identify language-specific subjects (e.g. English Grammar, Hindi Sahitya, Sanskrit, etc.)
function isLangSubject(subject?: string, chapter?: string): boolean {
  const subTrim = (subject || '').toLowerCase().trim();
  const chapTrim = (chapter || '').toLowerCase().trim();
  const fullText = `${subTrim} ${chapTrim}`;

  if (!fullText.trim()) return false;

  if (
    subTrim === 'english' ||
    subTrim === 'hindi' ||
    subTrim === 'हिन्दी' ||
    subTrim === 'अंग्रेजी' ||
    subTrim === 'sanskrit' ||
    subTrim === 'general english' ||
    subTrim === 'general hindi' ||
    subTrim === 'english grammar' ||
    subTrim === 'hindi grammar' ||
    subTrim === 'english language' ||
    subTrim === 'hindi language'
  ) {
    return true;
  }

  if (
    /(english\s*(grammar|vocab|language|vocabulary|literature)|hindi\s*(grammar|vocab|language|vocabulary|sahitya|vyakaran)|general\s*english|general\s*hindi)/i.test(fullText)
  ) {
    return true;
  }

  return false;
}

// Fallback Educational Explanation Engine
function generateFallbackExplanations(questions: any[]) {
  return questions.map((q: any, idx: number) => {
    const correctOptLetter = q.answer || "A";
    let optText = q.options ? q.options[correctOptLetter] : q[`option${correctOptLetter}`] || "";
    if (optText) optText = ` ("${optText}")`;

    const topic = q.chapter || q.subject || "this topic";
    const isLang = isLangSubject(q.subject, q.chapter);
    const subLower = (q.subject || "").toLowerCase();

    let explanationText = "";
    if (isLang) {
      if (subLower.includes("hindi") || subLower.includes("हिन्दी")) {
        explanationText = `विकल्प ${correctOptLetter}${optText} सही उत्तर है। ${topic} के मानक नियमों के अनुसार यह उत्तर सही है।`;
      } else {
        explanationText = `Option ${correctOptLetter}${optText} is the correct answer as per standard rules of ${topic}.`;
      }
    } else {
      explanationText = `English: Option ${correctOptLetter}${optText} is the correct answer. It accurately reflects the core concepts and principles of ${topic}.\nहिंदी: विकल्प ${correctOptLetter}${optText} सही उत्तर है। यह ${topic} के मूलभूत सिद्धांतों के अनुसार पूर्णतः सही है।`;
    }

    return {
      index: idx,
      idTemp: q.idTemp || q.id || idx,
      explanation: explanationText
    };
  });
}

// Helper for Math and Reasoning subject detection on server
function isMathOrReasoningSubjectServer(subject?: string, chapter?: string): boolean {
  const combined = `${subject || ''} ${chapter || ''}`.toLowerCase().trim();
  if (!combined) return false;
  const mathReasoningRegex = /(math|maths|mathematics|quantitative|quant|aptitude|arithmetic|algebra|geometry|trigonometry|mensuration|calculus|statistics|data\s*interpretation|number\s*system|numerical|reasoning|logical|mental\s*ability|general\s*intelligence|analytical|puzzle|coding\s*decoding|series|tarkshakti|तर्कशक्ति|गणित|अंकगणित|बीजगणित|रेखागणित|सांख्यिकी|क्षेत्रमिति|त्रिकोणमिति|सरलीकरण|प्रतिशत|लाभ\s*हानि|बट्टा|औसत|अनुपात|समानुपात|आयु|साझा|मिश्रण|समय\s*और\s*कार्य|पाइप|चाल\s*दूरी|नाव|साधारण\s*ब्याज|चक्रवृद्धि\s*ब्याज)/i;
  return mathReasoningRegex.test(combined);
}

function cleanPurnaViramForMathReasoningServer(text: string, subject?: string, chapter?: string): string {
  if (!text || typeof text !== "string") return text || "";
  if (isMathOrReasoningSubjectServer(subject, chapter) || /[\d\+\-\*\/=\(\)\^π√%]/.test(text) || /сеमी|मीटर|वर्ग|क्षेत्रफल|आयतन|अनुपात|cm²|m²/i.test(text)) {
    return text.replace(/[।॥]/g, ".");
  }
  return text;
}

// Translation helpers for Tavily Dual Language explanation generation
async function translateTextToHindiServer(text: string): Promise<string> {
  if (!text || !text.trim()) return "";
  const clean = text.trim();
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=hi&dt=t&q=${encodeURIComponent(clean)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const segments = data[0].map((item: any) => item[0]).filter(Boolean);
        if (segments.length > 0) {
          return segments.join("").trim();
        }
      }
    }
  } catch (err: any) {
    console.warn("[translateTextToHindiServer] Warning:", err.message);
  }
  return "";
}

async function translateTextToEnglishServer(text: string): Promise<string> {
  if (!text || !text.trim()) return "";
  const clean = text.trim();
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=hi&tl=en&dt=t&q=${encodeURIComponent(clean)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const segments = data[0].map((item: any) => item[0]).filter(Boolean);
        if (segments.length > 0) {
          return segments.join("").trim();
        }
      }
    }
  } catch (err: any) {
    console.warn("[translateTextToEnglishServer] Warning:", err.message);
  }
  return "";
}

function trimToMaxWordsServer(text: string, maxWords: number = 200): string {
  if (!text || !text.trim()) return "";
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();

  const truncatedWords = words.slice(0, maxWords).join(" ");
  const lastPunct = Math.max(
    truncatedWords.lastIndexOf("."),
    truncatedWords.lastIndexOf("!"),
    truncatedWords.lastIndexOf("?"),
    truncatedWords.lastIndexOf("\n")
  );
  if (lastPunct > truncatedWords.length * 0.6) {
    return truncatedWords.slice(0, lastPunct + 1).trim();
  }
  return truncatedWords.trim() + ".";
}

async function ensureDualLanguageExplanationServer(rawExp: string, subject?: string, chapter?: string): Promise<string> {
  if (!rawExp || !rawExp.trim()) return "";
  const trimmed = trimToMaxWordsServer(rawExp.trim(), 160);

  const isLang = isLangSubject(subject, chapter);

  // If it's a language-specific subject (e.g. English Grammar, Hindi Vyakaran, Literature), DO NOT force dual language
  if (isLang) {
    const subLower = ((subject || "") + " " + (chapter || "")).toLowerCase();
    const isHindiLang = subLower.includes("hindi") || subLower.includes("हिन्दी") || /व्याकरण|साहित्य|गद्यांश|पद्यांश/i.test(subLower);
    
    // If it's a Hindi language subject but explanation is in English, translate to Hindi
    if (isHindiLang && !/[\u0900-\u097F]/.test(trimmed)) {
      const hiTrans = await translateTextToHindiServer(trimmed);
      return trimToMaxWordsServer(hiTrans || trimmed, 200);
    }
    return trimToMaxWordsServer(cleanPurnaViramForMathReasoningServer(trimmed, subject, chapter), 200);
  }

  // FOR ALL OTHER SECTIONS & SUBJECTS: MUST BE DUAL LANGUAGE (English & Hindi)
  const hasEnglish = /[a-zA-Z]/.test(trimmed);
  const hasHindi = /[\u0900-\u097F]/.test(trimmed);

  // If it already has both English and Hindi text, just clean math purna viram and cap at 200 words
  if (hasEnglish && hasHindi) {
    return trimToMaxWordsServer(cleanPurnaViramForMathReasoningServer(trimmed, subject, chapter), 200);
  }

  // If it is English only (typical Tavily response), translate to Hindi & combine
  if (hasEnglish && !hasHindi) {
    const shortEng = trimToMaxWordsServer(trimmed, 80);
    let hindiTranslation = await translateTextToHindiServer(shortEng);
    if (hindiTranslation) {
      hindiTranslation = cleanPurnaViramForMathReasoningServer(trimToMaxWordsServer(hindiTranslation, 80), subject, chapter);
      return trimToMaxWordsServer(`English: ${shortEng}\n\nहिंदी: ${hindiTranslation}`, 200);
    }
    return trimToMaxWordsServer(cleanPurnaViramForMathReasoningServer(shortEng, subject, chapter), 200);
  }

  // If it is Hindi only, translate to English & combine
  if (hasHindi && !hasEnglish) {
    const shortHi = trimToMaxWordsServer(trimmed, 80);
    let englishTranslation = await translateTextToEnglishServer(shortHi);
    const cleanedHindi = cleanPurnaViramForMathReasoningServer(shortHi, subject, chapter);
    if (englishTranslation) {
      return trimToMaxWordsServer(`English: ${trimToMaxWordsServer(englishTranslation, 80)}\n\nहिंदी: ${cleanedHindi}`, 200);
    }
    return trimToMaxWordsServer(cleanedHindi, 200);
  }

  return trimToMaxWordsServer(cleanPurnaViramForMathReasoningServer(trimmed, subject, chapter), 200);
}

// Dedicated Tavily Explanation Generator Engine
async function callTavilyExplain(apiKey: string, questions: any[]): Promise<any[]> {
  const cleanKey = apiKey?.trim().replace(/^["']|["']$/g, "") || "";
  if (!cleanKey) throw new Error("Tavily API Key is missing.");

  const explanations: any[] = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const isLang = isLangSubject(q.subject, q.chapter);
    const isMathReasoning = isMathOrReasoningSubjectServer(q.subject, q.chapter);
    const subLower = (q.subject || "").toLowerCase();

    let langInstruction = "Provide a simple, clear, student-friendly explanation in DUAL LANGUAGE (English & Hindi) under 80 words. Format:\nEnglish: <clear simple explanation>\nहिंदी: <सरल व्याख्या>";
    if (isLang) {
      if (subLower.includes("hindi") || subLower.includes("हिन्दी")) {
        langInstruction = "Provide a simple, clear explanation strictly in HINDI under 80 words.";
      } else {
        langInstruction = "Provide a simple, clear explanation strictly in ENGLISH under 80 words.";
      }
    }
    if (isMathReasoning) {
      langInstruction += " MANDATE FOR MATH/REASONING: Provide a clear step-by-step mathematical working, formula, and calculation under 80 words. DO NOT use Hindi Purna Viram ('।') symbol at sentence ends in Hindi text; use standard full stop ('.') instead.";
    }

    const optA = q.optionA || q.options?.A || "";
    const optB = q.optionB || q.options?.B || "";
    const optC = q.optionC || q.options?.C || "";
    const optD = q.optionD || q.options?.D || "";
    const ansLetter = q.answer || "A";
    const optVal = ansLetter === 'A' ? optA : ansLetter === 'B' ? optB : ansLetter === 'C' ? optC : optD;

    const query = `MCQ Question: ${q.question}
Options: (A) ${optA} (B) ${optB} (C) ${optC} (D) ${optD}
Correct Answer: Option ${ansLetter} (${optVal})
Subject: ${q.subject || "General Studies"} Chapter: ${q.chapter || ""}
Instruction: ${langInstruction}`;

    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: cleanKey,
          query,
          search_depth: "advanced",
          include_answer: true,
          max_results: 3
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Tavily HTTP ${res.status}: ${errText.slice(0, 100)}`);
      }

      const data = await res.json();
      const ansStr = (data.answer || "").trim();

      let rawExplanationText = "";
      if (ansStr && ansStr.length >= 15) {
        // Use Tavily's direct synthesized answer (concise ~50-80 words, clear summary)
        rawExplanationText = trimToMaxWordsServer(ansStr, 80);
      } else if (Array.isArray(data.results) && data.results.length > 0) {
        // Use top search snippet capped at 80 words
        const topSnippet = data.results[0]?.content || "";
        rawExplanationText = trimToMaxWordsServer(topSnippet, 80);
      }

      if (!rawExplanationText || rawExplanationText.trim().length < 10) {
        throw new Error("Tavily search returned no valid explanation text.");
      }

      let explanationText = rawExplanationText.trim();

      if (isMathReasoning) {
        if (!/step|चरण|given|दिया|formula|सूत्र|calculation|गणना/i.test(explanationText)) {
          explanationText = `Given Data & Concept (दिया गया मान एवं सूत्र):\n- Question: ${q.question}\n- Correct Option: Option ${ansLetter} (${optVal})\n\nStep-by-Step Solution (हल):\n${rawExplanationText}\n\nFinal Answer (निष्कर्ष): Option ${ansLetter} (${optVal})`;
        }
      }

      const finalFormatted = await ensureDualLanguageExplanationServer(explanationText, q.subject, q.chapter);

      explanations.push({
        index: i,
        idTemp: q.idTemp || q.id || i,
        explanation: finalFormatted
      });
    } catch (err: any) {
      console.warn(`[Tavily Explain Warning] Question ${i + 1} search failed:`, err.message);
    }
  }

  if (explanations.length === 0) {
    throw new Error("Tavily Search API failed to produce valid explanations for questions.");
  }

  return explanations;
}

// Dedicated DeepL Translation Engine for MCQs Fallback
async function callDeepLTranslate(apiKey: string, questions: any[]): Promise<any[]> {
  const cleanKey = apiKey?.trim().replace(/^["']|["']$/g, "") || "";
  if (!cleanKey) throw new Error("DeepL API Key is missing.");

  const isFree = cleanKey.endsWith(":fx") || cleanKey.includes(":fx");
  const baseUrl = isFree
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";

  const isLangSubject = (q: any) => {
    const s = ((q.subject || "") + " " + (q.chapter || "")).toLowerCase();
    const subTrim = (q.subject || "").toLowerCase().trim();
    const chapTrim = (q.chapter || "").toLowerCase().trim();
    if (/(english|hindi|हिन्दी|हिंदी|grammar|vyakaran|व्याकरण|sahitya|साहित्य|वर्तनी|शब्द शुद्धि|गद्यांश|पद्यांश|समास|संधि|मुहावरे|पर्यायवाची|विलोम|sanskrit|संस्कृत|urdu|उर्दू)/i.test(s)) {
      return true;
    }
    return ["english", "hindi", "हिन्दी", "हिंदी", "sanskrit", "urdu"].includes(subTrim) || ["english", "hindi", "हिन्दी", "हिंदी", "sanskrit", "urdu"].includes(chapTrim);
  };

  const isNumericOpt = (text: string) => {
    if (!text) return true;
    const trimmed = text.trim();
    if (!trimmed) return true;
    if (/^[\d\s.,\/%+\-*=^±$₹€°:()\-–—]+$/.test(trimmed)) return true;
    if (!/[a-zA-Z\u0900-\u097F]/.test(trimmed)) return true;
    return false;
  };

  const isHindi = (text: string) => /[\u0900-\u097F]/.test(text);

  interface Task {
    qIndex: number;
    field: "question" | "optionA" | "optionB" | "optionC" | "optionD" | "explanation";
    text: string;
    targetLang: "HI" | "EN";
    translatedText?: string;
  }

  const tasks: Task[] = [];

  questions.forEach((q: any, idx: number) => {
    if (isLangSubject(q)) return;

    const fields: Array<Task["field"]> = ["question", "optionA", "optionB", "optionC", "optionD", "explanation"];
    fields.forEach(field => {
      const val = (q[field] || "").toString().trim();
      if (!val) return;

      if (field.startsWith("option") && isNumericOpt(val)) return;

      const hasHindi = isHindi(val);
      const hasEnglish = /[a-zA-Z]/.test(val);
      if (hasHindi && hasEnglish) return;

      const targetLang = hasHindi ? "EN" : "HI";
      tasks.push({ qIndex: idx, field, text: val, targetLang });
    });
  });

  if (tasks.length === 0) {
    return questions.map((q: any, idx: number) => ({
      id: q.id,
      index: idx,
      question: q.question,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      explanation: q.explanation || "",
      skippedLanguageSubject: isLangSubject(q)
    }));
  }

  const hiTasks = tasks.filter(t => t.targetLang === "HI");
  const enTasks = tasks.filter(t => t.targetLang === "EN");

  const runBatch = async (batchTasks: Task[], targetLang: "HI" | "EN") => {
    if (batchTasks.length === 0) return;
    const texts = batchTasks.map(t => t.text);

    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Authorization": `DeepL-Auth-Key ${cleanKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: texts,
        target_lang: targetLang
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`DeepL API Error (${res.status}): ${errText.slice(0, 150)}`);
    }

    const data = await res.json();
    const translations = data.translations || [];
    batchTasks.forEach((task, i) => {
      if (translations[i]?.text) {
        task.translatedText = translations[i].text;
      }
    });
  };

  await Promise.all([
    runBatch(hiTasks, "HI"),
    runBatch(enTasks, "EN")
  ]);

  const translatedQuestions = questions.map((q: any, idx: number) => {
    if (isLangSubject(q)) {
      return {
        id: q.id,
        index: idx,
        question: q.question,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC,
        optionD: q.optionD,
        explanation: q.explanation || "",
        skippedLanguageSubject: true
      };
    }

    const qTasks = tasks.filter(t => t.qIndex === idx);
    const qTask = qTasks.find(t => t.field === "question");

    let finalQ = q.question || "";
    let finalTrans = q.translation || "";

    if (qTask && qTask.translatedText) {
      if (qTask.targetLang === "HI") {
        finalQ = q.question || "";
        finalTrans = qTask.translatedText || "";
      } else {
        finalQ = qTask.translatedText || "";
        finalTrans = q.question || "";
      }
    }

    const getOptOrExpVal = (field: Task["field"], origVal: string) => {
      const task = qTasks.find(t => t.field === field);
      if (!task || !task.translatedText) return origVal;
      const trans = task.translatedText;
      if (task.targetLang === "HI") {
        return `${origVal}\n${trans}`;
      } else {
        return `${trans}\n${origVal}`;
      }
    };

    return {
      id: q.id,
      index: idx,
      question: finalQ,
      translation: finalTrans,
      optionA: getOptOrExpVal("optionA", q.optionA),
      optionB: getOptOrExpVal("optionB", q.optionB),
      optionC: getOptOrExpVal("optionC", q.optionC),
      optionD: getOptOrExpVal("optionD", q.optionD),
      explanation: getOptOrExpVal("explanation", q.explanation || ""),
      skippedLanguageSubject: false
    };
  });

  return translatedQuestions;
}

// Fallback Difficulty Classification Engine
function generateFallbackClassifications(questions: any[]) {
  return questions.map((q: any, idx: number) => {
    const qText = (q.question || "").toLowerCase();
    let diff = "Moderate";
    let reason = "Standard conceptual problem requiring 2-step evaluation.";

    if (qText.length > 120 || qText.includes("calculate") || qText.includes("chronological") || qText.includes("incorrect") || qText.includes("which of the following")) {
      diff = "Hard";
      reason = "Contains multi-step analytical reasoning or detailed contextual evaluation.";
    } else if (qText.length < 60 || qText.includes("what is") || qText.includes("who is") || qText.includes("defined as")) {
      diff = "Easy";
      reason = "Direct factual recall question with straightforward options.";
    }

    return {
      id: q.id,
      index: idx,
      difficulty: diff,
      reason,
    };
  });
}

// Health Check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Ollama Models Detection Endpoint
app.post("/api/ollama/models", async (req, res) => {
  const { baseUrl } = req.body;
  const rawHost = (baseUrl || "http://localhost:11434").trim().replace(/\/+$/, "");
  let host = rawHost;
  if (!host.startsWith("http://") && !host.startsWith("https://")) {
    host = `http://${host}`;
  }

  try {
    new URL(host);
  } catch (_e) {
    return res.json({
      success: false,
      connected: false,
      error: `Invalid Base URL: '${rawHost}'. Please enter a valid URL like http://localhost:11434.`,
      models: []
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${host}/api/tags`, {
      method: "GET",
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return res.json({
        success: false,
        connected: false,
        error: `Ollama returned HTTP ${response.status}`,
        models: []
      });
    }

    const data = await response.json();
    const models = (data.models || []).map((m: any) => m.name || m.model || "").filter(Boolean);

    return res.json({
      success: true,
      connected: true,
      models,
      count: models.length
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isTimeout = err.name === "AbortError";
    return res.json({
      success: false,
      connected: false,
      error: isTimeout
        ? `Connection to Ollama at ${host} timed out.`
        : `Ollama is not running. Please start Ollama at ${host}.`,
      models: []
    });
  }
});

// Ollama Connection Status Endpoint
app.post("/api/ollama/status", async (req, res) => {
  const { baseUrl } = req.body;
  const rawHost = (baseUrl || "http://localhost:11434").trim().replace(/\/+$/, "");
  let host = rawHost;
  if (!host.startsWith("http://") && !host.startsWith("https://")) {
    host = `http://${host}`;
  }

  try {
    new URL(host);
  } catch (_e) {
    return res.json({
      connected: false,
      error: `Invalid Base URL: '${rawHost}'`
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(`${host}/api/version`, {
      method: "GET",
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return res.json({
        connected: true,
        version: data.version || "running",
        host
      });
    }

    return res.json({
      connected: false,
      error: `Ollama returned HTTP ${response.status}`
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    return res.json({
      connected: false,
      error: `Ollama is not running. Please start Ollama at ${host}.`
    });
  }
});

// Dedicated DeepL Test Endpoint
app.post("/api/deepl/test", async (req, res) => {
  const { apiKey } = req.body;
  const cleanKey = (apiKey || process.env.DEEPL_API_KEY || "").trim().replace(/^["']|["']$/g, "");
  if (!cleanKey) {
    return res.json({ success: false, message: "DeepL API Key is missing on both client and server environment." });
  }
  const isFree = cleanKey.endsWith(":fx") || cleanKey.includes(":fx");
  const deeplUrl = isFree ? "https://api-free.deepl.com/v2/translate" : "https://api.deepl.com/v2/translate";

  try {
    const deeplRes = await fetch(deeplUrl, {
      method: "POST",
      headers: {
        "Authorization": `DeepL-Auth-Key ${cleanKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: ["Hello World"],
        target_lang: "HI"
      })
    });

    if (!deeplRes.ok) {
      const errText = await deeplRes.text();
      let parsedMsg = errText;
      try {
        const parsedErr = JSON.parse(errText);
        if (parsedErr.message) parsedMsg = parsedErr.message;
      } catch (e) {}

      if (deeplRes.status === 403) {
        return res.json({
          success: false,
          message: "DeepL API Key Invalid or Unauthorized (HTTP 403). Please verify if your key is a Free (:fx) or Pro plan key."
        });
      } else if (deeplRes.status === 456) {
        return res.json({
          success: false,
          message: "DeepL API Quota Exceeded (HTTP 456). Character limit reached for this month."
        });
      }

      return res.json({
        success: false,
        message: `DeepL API Error (HTTP ${deeplRes.status}): ${parsedMsg.slice(0, 150)}`
      });
    }

    const data = await deeplRes.json();
    if (data.translations && data.translations.length > 0) {
      return res.json({
        success: true,
        message: "⚡ DeepL Translation API Key connected successfully!"
      });
    } else {
      return res.json({
        success: false,
        message: "DeepL API returned empty translation response."
      });
    }
  } catch (netErr: any) {
    return res.json({
      success: false,
      message: `Network error reaching DeepL API: ${netErr.message || "Failed to fetch"}`
    });
  }
});

// Dedicated Tavily Test Endpoint
app.post("/api/tavily/test", async (req, res) => {
  const { apiKey } = req.body;
  const cleanKey = (apiKey || "").trim().replace(/^["']|["']$/g, "");
  if (!cleanKey) {
    return res.json({ success: false, message: "Tavily Search API Key is missing." });
  }

  try {
    const tavRes = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: cleanKey,
        query: "Test connection query",
        search_depth: "basic",
        max_results: 1
      })
    });

    if (!tavRes.ok) {
      const errText = await tavRes.text();
      let parsedMsg = errText;
      try {
        const parsedErr = JSON.parse(errText);
        if (typeof parsedErr.detail === 'string') {
          parsedMsg = parsedErr.detail;
        } else if (parsedErr.detail && typeof parsedErr.detail === 'object') {
          parsedMsg = parsedErr.detail.error || parsedErr.detail.message || JSON.stringify(parsedErr.detail);
        } else if (typeof parsedErr.message === 'string') {
          parsedMsg = parsedErr.message;
        }
      } catch (e) {}

      if (tavRes.status === 401) {
        return res.json({
          success: false,
          message: "Tavily API Key Invalid or Unauthorized (HTTP 401). Please verify your Tavily API Key."
        });
      }

      return res.json({
        success: false,
        message: `Tavily API Error (HTTP ${tavRes.status}): ${String(parsedMsg).slice(0, 150)}`
      });
    }

    return res.json({
      success: true,
      message: "⚡ Tavily Search API Key connected successfully!"
    });
  } catch (netErr: any) {
    return res.json({
      success: false,
      message: `Network error reaching Tavily API: ${netErr.message || "Failed to fetch"}`
    });
  }
});

// Test AI Connection Endpoint
app.post("/api/gemini/test", async (req, res) => {
  try {
    const { apiKey, provider = "gemini", model, baseUrl } = req.body;

    if (provider === "deepl") {
      const cleanKey = (apiKey || "").trim().replace(/^["']|["']$/g, "");
      if (!cleanKey) {
        return res.json({ success: false, message: "DeepL API Key is missing." });
      }
      const isFree = cleanKey.endsWith(":fx") || cleanKey.includes(":fx");
      const deeplUrl = isFree ? "https://api-free.deepl.com/v2/translate" : "https://api.deepl.com/v2/translate";

      try {
        const deeplRes = await fetch(deeplUrl, {
          method: "POST",
          headers: {
            "Authorization": `DeepL-Auth-Key ${cleanKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            text: ["Hello World"],
            target_lang: "HI"
          })
        });

        if (!deeplRes.ok) {
          const errText = await deeplRes.text();
          let parsedMsg = errText;
          try {
            const parsedErr = JSON.parse(errText);
            if (parsedErr.message) parsedMsg = parsedErr.message;
          } catch (e) {}

          if (deeplRes.status === 403) {
            return res.json({
              success: false,
              message: "DeepL API Key Invalid or Unauthorized (HTTP 403). Please verify if your key is a Free (:fx) or Pro plan key."
            });
          } else if (deeplRes.status === 456) {
            return res.json({
              success: false,
              message: "DeepL API Quota Exceeded (HTTP 456). Character limit reached for this month."
            });
          }

          return res.json({
            success: false,
            message: `DeepL API Error (HTTP ${deeplRes.status}): ${parsedMsg.slice(0, 150)}`
          });
        }

        const data = await deeplRes.json();
        if (data.translations && data.translations.length > 0) {
          return res.json({
            success: true,
            message: "⚡ DeepL Translation API Key connected successfully!"
          });
        } else {
          return res.json({
            success: false,
            message: "DeepL API returned empty translation response."
          });
        }
      } catch (netErr: any) {
        return res.json({
          success: false,
          message: `Network error reaching DeepL API: ${netErr.message || "Failed to fetch"}`
        });
      }
    }

    if (provider === "tavily") {
      const cleanKey = (apiKey || "").trim().replace(/^["']|["']$/g, "");
      if (!cleanKey) {
        return res.json({ success: false, message: "Tavily Search API Key is missing." });
      }

      try {
        const tavRes = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: cleanKey,
            query: "Test connection query",
            search_depth: "basic",
            max_results: 1
          })
        });

        if (!tavRes.ok) {
          const errText = await tavRes.text();
          let parsedMsg = errText;
          try {
            const parsedErr = JSON.parse(errText);
            if (typeof parsedErr.detail === 'string') {
              parsedMsg = parsedErr.detail;
            } else if (parsedErr.detail && typeof parsedErr.detail === 'object') {
              parsedMsg = parsedErr.detail.error || parsedErr.detail.message || JSON.stringify(parsedErr.detail);
            } else if (typeof parsedErr.message === 'string') {
              parsedMsg = parsedErr.message;
            }
          } catch (e) {}

          if (tavRes.status === 401) {
            return res.json({
              success: false,
              message: "Tavily API Key Invalid or Unauthorized (HTTP 401). Please verify your Tavily API Key."
            });
          }

          return res.json({
            success: false,
            message: `Tavily API Error (HTTP ${tavRes.status}): ${String(parsedMsg).slice(0, 150)}`
          });
        }

        return res.json({
          success: true,
          message: "⚡ Tavily Search API Key connected successfully!"
        });
      } catch (netErr: any) {
        return res.json({
          success: false,
          message: `Network error reaching Tavily API: ${netErr.message || "Failed to fetch"}`
        });
      }
    }

    const responseText = await executeAiCallServer(
      provider,
      apiKey,
      "Reply with valid JSON strictly: {\"status\": \"ok\", \"message\": \"API Connection Successful\"}",
      "You are an AI system status checker. Output valid JSON strictly.",
      model,
      baseUrl
    );

    try {
      const parsed = cleanAndParseJson(responseText);
      return res.json({
        success: true,
        message: parsed.message || `Successfully connected to ${provider.toUpperCase()} AI Engine!`
      });
    } catch (_e) {
      return res.json({
        success: true,
        message: `Successfully connected to ${provider.toUpperCase()} AI Engine!`
      });
    }
  } catch (error: any) {
    const msg = formatErrorMessage(error);
    return res.json({
      success: false,
      message: msg
    });
  }
});

// AI Question Generation Endpoint
app.post("/api/gemini/generate", async (req, res) => {
  const { apiKey, provider = "gemini", model, baseUrl, subject, chapter, count = 5, difficulty = "Moderate" } = req.body;

  try {
    const isLang = isLangSubject(subject, chapter);
    const prompt = `Generate ${count} high-quality Multiple Choice Questions (MCQs) for subject "${subject || 'General Studies'}" and chapter/topic "${chapter || 'General Concepts'}".
Difficulty target: ${difficulty}.

Requirements:
- Questions must be clear, accurate, and structured for competitive exams.
- Support and use proper mathematical symbols and operations where applicable (e.g. squares x², cubes x³, square roots √(x), cube roots ∛(x), exponents x^n or x^(2/3), ±, ×, ÷, ≤, ≥, ≠, °, π, θ).
- Provide 4 options (optionA, optionB, optionC, optionD) and specify the correct answer ('A', 'B', 'C', or 'D').
- Provide a clear, educational, step-by-step explanation for why the correct answer is right.
- CRITICAL EXPLANATION LANGUAGE RULE: ${isLang ? "Provide explanation in the target language of the subject." : "Provide explanation in DUAL LANGUAGE (Bilingual: English + Hindi). Example:\nEnglish: <Explanation text>\nहिंदी: <स्पष्टीकरण हिंदी में>"}.
- Assign difficulty ('Easy', 'Moderate', or 'Hard').
- Return response strictly as a JSON array of MCQ objects.`;

    const systemInstruction = "You are an expert exam question creator. Output valid JSON array of MCQs strictly.";

    const text = await executeAiCallServer(req.body, prompt, systemInstruction);
    const parsed = cleanAndParseJson(text);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return res.json({ success: true, questions: parsed });
    }
  } catch (error: any) {
    console.warn("AI Generate Endpoint Warning:", error.message);
  }

  // Fallback engine
  const fallbackQs = generateFallbackQuestions(subject, chapter, count, difficulty);
  res.json({ success: true, questions: fallbackQs, isFallback: true });
});

// AI Question Explanation Generation Endpoint
app.post("/api/gemini/explain", async (req, res) => {
  const { apiKey, provider = "gemini", model, baseUrl, questions } = req.body;
  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: "No questions provided for explanation generation" });
  }

  // Extract Tavily Key
  let tavilyKey = req.body.tavilyApiKey || process.env.TAVILY_API_KEY || "";
  if (!tavilyKey && typeof req.body.apiKey === "string") {
    const foundTv = req.body.apiKey.split(/[\n,;\s]+/).find((k: string) => k.trim().startsWith("tvly-"));
    if (foundTv) tavilyKey = foundTv.trim();
  }
  if (!tavilyKey && Array.isArray(req.body.apiKeysList)) {
    const foundTv = req.body.apiKeysList.find((k: any) => typeof k === "string" && k.trim().startsWith("tvly-"));
    if (foundTv) tavilyKey = foundTv.trim();
  }
  if (!tavilyKey && Array.isArray(req.body.fallbackProviders)) {
    for (const fp of req.body.fallbackProviders) {
      if (fp?.tavilyApiKey && typeof fp.tavilyApiKey === "string") { tavilyKey = fp.tavilyApiKey.trim(); break; }
      if (fp?.provider === "tavily" && typeof fp?.apiKey === "string") { tavilyKey = fp.apiKey.trim(); break; }
      if (typeof fp?.apiKey === "string") {
        const foundTv = fp.apiKey.split(/[\n,;\s]+/).find((k: string) => k.trim().startsWith("tvly-"));
        if (foundTv) { tavilyKey = foundTv.trim(); break; }
      }
    }
  }

  // 1. Tavily Search API Engine (ONLY if provider is explicitly 'tavily' or primary key is a Tavily key)
  const isTavilyPrimary = provider === "tavily" || (typeof apiKey === "string" && apiKey.trim().startsWith("tvly-"));

  if (isTavilyPrimary && tavilyKey) {
    try {
      console.log("[AI Explain] Executing Question Explanation via Tavily Search Engine...");
      const tavilyExplanations = await callTavilyExplain(tavilyKey, questions);
      if (tavilyExplanations && tavilyExplanations.length > 0) {
        return res.json({ success: true, explanations: tavilyExplanations, providerUsed: "tavily" });
      }
    } catch (tavErr: any) {
      console.warn("Tavily Explanation Engine Primary Warning:", tavErr.message);
    }
  }

  // 2. Gemini / Groq / Primary AI Engine for Explanations
  try {
    const formattedQuestions = questions.map((q: any, idx: number) => {
      const isLang = isLangSubject(q.subject, q.chapter);
      const isMathReasoning = isMathOrReasoningSubjectServer(q.subject, q.chapter);
      return {
        index: idx,
        idTemp: q.idTemp || q.id || idx,
        subject: q.subject || "General",
        chapter: q.chapter || "",
        isLanguageSubject: isLang,
        isMathOrReasoning: isMathReasoning,
        question: q.question,
        options: {
          A: q.optionA,
          B: q.optionB,
          C: q.optionC,
          D: q.optionD,
        },
        answer: q.answer || "A",
        existingExplanation: q.explanation || "",
      };
    });

    const prompt = `Generate a clear, student-friendly, step-by-step educational explanation for each MCQ below explaining why the specified correct answer is right.

CRITICAL LENGTH, QUALITY & MATHEMATICAL SOLUTION MANDATES:
1. MAX 200 WORDS LIMIT (VERY IMPORTANT):
   - Every explanation string MUST NOT EXCEED 200 WORDS TOTAL!
   - Keep explanations medium-length, simple, clear, and easy for students to understand.
   - Do NOT output lengthy essays, huge paragraphs, or massive blocks of text.

2. STEP-BY-STEP SOLUTION FOR MATHEMATICS & REASONING (where "isMathOrReasoning" is true or subject is Math/Reasoning/Aptitude):
   Every Math and Reasoning question MUST be answered with a clear, simple step-by-step mathematical solution that a student can easily follow:
   - MANDATORY LINE BREAKS: Use distinct newlines (\n\n) between each step section so steps are NOT merged together!
   - **Given & Concept (दिया गया मान एवं सूत्र)**: List given values and formula used.
   - **Step 1: Working & Calculation (चरण 1: हल एवं गणना)**: Show step-by-step working clearly.
   - **Final Answer (अंतिम उत्तर)**: State the correct option.
   Keep it concise, clear, well-spaced, and UNDER 200 WORDS TOTAL!

3. DUAL LANGUAGE (BILINGUAL) FORMAT:
   For all subjects/sections (except pure English or pure Hindi language/grammar tests where "isLanguageSubject" is true):
   Each explanation string MUST include BOTH the English explanation paragraph AND the Hindi explanation paragraph:

   English: <Clear simple step-by-step explanation in English, max 75 words>
   हिंदी: <छात्रों के लिए आसान एवं सरल व्याख्या हिंदी में, max 75 words>

4. HINDI PURNA VIRAM ('।') RESTRICTION FOR MATH:
   In Hindi text for Math & Reasoning topics, DO NOT use Hindi Purna Viram symbol ('।') at sentence ends; use standard full stop ('.') instead so '।' is not misread as number '1'.

Questions:
${JSON.stringify(formattedQuestions, null, 2)}

Return response strictly as a JSON array where each object has keys: "index", "idTemp" or "id", and "explanation".`;

    const systemInstruction = "You are an expert educational tutor. MANDATE: Generate simple, clear, student-friendly step-by-step explanations. Total explanation string MUST BE STRICTLY UNDER 200 WORDS (around 60-80 words per language section). For Math/Reasoning, provide clear step-by-step solution steps (Given, Step-by-Step Working, Final Answer) under 200 words total. For non-language subjects, provide dual language (English + Hindi).";

    const text = await executeAiCallServer(req.body, prompt, systemInstruction);
    const parsed = cleanAndParseJson(text);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const sanitizedExplanations = parsed.map((item: any, idx: number) => {
        const qObj = questions[idx] || {};
        let rawExp = item.explanation;
        if (typeof rawExp === 'object' && rawExp !== null) {
          rawExp = rawExp.text || rawExp.explanation || rawExp.hindi || rawExp.english || JSON.stringify(rawExp);
        }
        return {
          ...item,
          explanation: cleanPurnaViramForMathReasoningServer(String(rawExp || ''), qObj.subject, qObj.chapter)
        };
      });
      return res.json({ success: true, explanations: sanitizedExplanations });
    }
  } catch (error: any) {
    console.warn("AI Explain Primary Endpoint Warning:", error.message);
    // 3. Fallback to Tavily Search AI Engine if Gemini/Groq failed due to Quota or Rate Limits
    if (tavilyKey) {
      try {
        console.log("[AI Explain Quota Failover] Gemini/Groq failed, executing Tavily Explanation Engine...");
        const tavilyExplanations = await callTavilyExplain(tavilyKey, questions);
        if (tavilyExplanations && tavilyExplanations.length > 0) {
          return res.json({ success: true, explanations: tavilyExplanations, providerUsed: "tavily" });
        }
      } catch (tavErr: any) {
        console.warn("Tavily Explanation Engine Quota Failover Warning:", tavErr.message);
      }
    }
  }

  // 3. Static Template Fallback
  const fallbackExp = generateFallbackExplanations(questions);
  res.json({ success: true, explanations: fallbackExp, isFallback: true });
});

// AI Question Classification Endpoint
app.post("/api/gemini/classify", async (req, res) => {
  const { apiKey, provider = "gemini", model, baseUrl, questions } = req.body;
  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: "No questions provided for classification" });
  }

  try {
    const formattedQuestions = questions.map((q: any, idx: number) => ({
      index: idx,
      id: q.id,
      subject: q.subject || "General",
      chapter: q.chapter || "",
      question: q.question,
      options: {
        A: q.optionA,
        B: q.optionB,
        C: q.optionC,
        D: q.optionD,
      },
      answer: q.answer,
    }));

    const prompt = `Analyze the following MCQs and classify each question's difficulty level into exactly one of: 'Easy', 'Moderate', or 'Hard'.

Questions to classify:
${JSON.stringify(formattedQuestions, null, 2)}

Return response strictly as a JSON array with objects containing: "id", "index", "difficulty" ('Easy'|'Moderate'|'Hard'), and "reason".`;

    const systemInstruction = "You are an expert exam paper setter and educational taxonomist. Output valid JSON array strictly.";

    const text = await executeAiCallServer(req.body, prompt, systemInstruction);
    const parsed = cleanAndParseJson(text);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return res.json({ success: true, classifications: parsed });
    }
  } catch (error: any) {
    console.warn("AI Classify Endpoint Warning:", error.message);
  }

  const fallbackClass = generateFallbackClassifications(questions);
  res.json({ success: true, classifications: fallbackClass, isFallback: true });
});

// AI Question Dual Language Translation Endpoint
app.post("/api/gemini/translate", async (req, res) => {
  const { apiKey, provider = "gemini", model, baseUrl, questions } = req.body;
  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: "No questions provided for translation" });
  }

  // 1. Prioritize DeepL API for Translation when DeepL Key is available
  let deeplKey = req.body.deeplApiKey || process.env.DEEPL_API_KEY || "";
  if (!deeplKey && Array.isArray(req.body.fallbackProviders)) {
    const deeplFp = req.body.fallbackProviders.find(
      (fp: any) => fp?.provider === "deepl" || (typeof fp?.apiKey === "string" && (fp.apiKey.includes(":fx") || fp.apiKey.length > 25))
    );
    if (deeplFp) deeplKey = deeplFp.apiKey;
  }
  if (!deeplKey && typeof req.body.apiKey === "string" && (req.body.apiKey.includes(":fx") || req.body.provider === "deepl")) {
    deeplKey = req.body.apiKey;
  }

  if (deeplKey || provider === "deepl") {
    try {
      console.log("[AI Translate] Executing MCQ Translation strictly using DeepL Translation API Engine...");
      const deeplTranslations = await callDeepLTranslate(deeplKey, questions);
      if (deeplTranslations && deeplTranslations.length > 0) {
        return res.json({ success: true, translations: deeplTranslations, providerUsed: "deepl" });
      }
    } catch (deeplErr: any) {
      console.warn("DeepL Translation Primary Warning:", deeplErr.message);
    }
  }

  // 2. Gemini / Groq / Secondary AI Fallback for Translation
  const isLangSubject = (q: any) => {
    const s = ((q.subject || "") + " " + (q.chapter || "")).toLowerCase();
    const subTrim = (q.subject || "").toLowerCase().trim();
    const chapTrim = (q.chapter || "").toLowerCase().trim();
    if (/(english|hindi|हिन्दी|हिंदी|grammar|vyakaran|व्याकरण|sahitya|साहित्य|वर्तनी|शब्द शुद्धि|गद्यांश|पद्यांश|समास|संधि|मुहावरे|पर्यायवाची|विलोम|sanskrit|संस्कृत|urdu|उर्दू)/i.test(s)) {
      return true;
    }
    return ["english", "hindi", "हिन्दी", "हिंदी", "sanskrit", "urdu"].includes(subTrim) || ["english", "hindi", "हिन्दी", "हिंदी", "sanskrit", "urdu"].includes(chapTrim);
  };

  const isNumericOpt = (text: string) => {
    if (!text) return true;
    const trimmed = text.trim();
    if (!trimmed) return true;
    if (/^[\d\s.,\/%+\-*=^±$₹€°:()\-–—]+$/.test(trimmed)) return true;
    if (!/[a-zA-Z\u0900-\u097F]/.test(trimmed)) return true;
    return false;
  };

  try {
    const questionsToTranslate = questions.map((q: any, idx: number) => ({
      index: idx,
      id: q.id,
      skippedLanguageSubject: isLangSubject(q),
      subject: q.subject || "General",
      chapter: q.chapter || "",
      question: q.question,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      explanation: q.explanation || ""
    }));

    const activeList = questionsToTranslate.filter(q => !q.skippedLanguageSubject);

    if (activeList.length > 0) {
      const prompt = `Translate each MCQ into Dual Language (Bilingual: English + Hindi).

CRITICAL RULES:
1. Return English content in 'question' (without Hindi) and Hindi translation content in 'translation' (for the Hindi Translation Box).
2. For options & explanation text fields:
   Line 1: English text
   Line 2: Hindi translation
3. CRITICAL RULE FOR NUMERIC/FORMULA OPTIONS:
   If an option contains ONLY numbers, dates, equations, percentages, or symbols (e.g. "1947", "25%", "100", "3.14", "1857 AD"), DO NOT duplicate the number. Keep numeric options unchanged as a single number string!
4. Keep all math symbols, formulas, chemical equations intact.

Questions:
${JSON.stringify(activeList, null, 2)}

Return JSON array containing objects with: "index", "id", "question", "translation", "optionA", "optionB", "optionC", "optionD", "explanation".`;

      const systemInstruction = "You are an expert bilingual exam paper translator. Output valid JSON array strictly.";

      const responseText = await executeAiCallServer(req.body, prompt, systemInstruction);
      const parsed = cleanAndParseJson(responseText);

      if (Array.isArray(parsed) && parsed.length > 0) {
        const transMap = new Map<number, any>();
        parsed.forEach((item: any) => {
          if (item.index !== undefined) transMap.set(item.index, item);
        });

        const finalTranslations = questions.map((q: any, idx: number) => {
          if (isLangSubject(q)) {
            return {
              id: q.id,
              index: idx,
              question: q.question,
              optionA: q.optionA,
              optionB: q.optionB,
              optionC: q.optionC,
              optionD: q.optionD,
              explanation: q.explanation || "",
              skippedLanguageSubject: true
            };
          }

          const trans = transMap.get(idx);
          if (!trans) {
            return {
              id: q.id,
              index: idx,
              question: q.question,
              optionA: q.optionA,
              optionB: q.optionB,
              optionC: q.optionC,
              optionD: q.optionD,
              explanation: q.explanation || "",
              skippedLanguageSubject: false
            };
          }

          const cleanOpt = (orig: string, transOpt: string) => {
            if (isNumericOpt(orig)) return orig.trim();
            if (!transOpt) return orig.trim();
            const trimmed = transOpt.trim();
            const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length >= 2 && lines[0] === lines[1]) return lines[0];
            const pMatch = trimmed.match(/^(.+?)\s*\(\1\)$/);
            if (pMatch) return pMatch[1].trim();
            return trimmed;
          };

          return {
            id: trans.id !== undefined ? trans.id : q.id,
            index: idx,
            question: trans.question || q.question,
            translation: trans.translation || q.translation || "",
            optionA: cleanOpt(q.optionA, trans.optionA),
            optionB: cleanOpt(q.optionB, trans.optionB),
            optionC: cleanOpt(q.optionC, trans.optionC),
            optionD: cleanOpt(q.optionD, trans.optionD),
            explanation: trans.explanation || q.explanation || "",
            skippedLanguageSubject: false
          };
        });

        return res.json({ success: true, translations: finalTranslations });
      }
    }
  } catch (error: any) {
    console.warn("AI Translate Primary Endpoint Warning:", error.message);
  }

  // 3. Fallback translation
  const fallbackTrans = questions.map((q: any, idx: number) => ({
    id: q.id,
    index: idx,
    question: q.question,
    optionA: q.optionA,
    optionB: q.optionB,
    optionC: q.optionC,
    optionD: q.optionD,
    explanation: q.explanation || "",
    skippedLanguageSubject: isLangSubject(q)
  }));

  res.json({ success: true, translations: fallbackTrans, isFallback: true });
});

// AI 360° Deep Quality Audit Endpoint (Gemini & Groq Powered)
app.post("/api/gemini/360-audit", async (req, res) => {
  const { questions } = req.body;
  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: "No questions provided for 360° deep audit" });
  }

  try {
    const promptPayload = questions.map((q: any, idx: number) => ({
      batchIndex: idx,
      questionNumber: idx + 1,
      subject: q.subject,
      chapter: q.chapter,
      question: q.question,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      markedAnswer: q.answer,
      explanation: q.explanation || ''
    }));

    const systemInstruction = `You are an uncompromising Chief Exam Auditor & Academic Controller for National Competitive Exams (UPSC, SSC, Banking, State Exams, NEET/JEE).

YOUR CORE MISSION: Detect ANY and ALL defects in the provided MCQs with 100% precision. Never miss a wrong answer key, false statement, calculation error, or invalid option!

FOR EACH MCQ IN THE INPUT BATCH:
1. INDEPENDENT STEP-BY-STEP SOLUTION:
   - First, solve the question statement independently from scratch without relying on 'markedAnswer' or 'explanation'.
   - Determine the true, mathematically and factually exact answer.
2. OPTION COMPARISON & ANSWER KEY AUDIT:
   - Compare your true answer against Option A (optionA), Option B (optionB), Option C (optionC), and Option D (optionD).
   - Identify which option (A, B, C, or D) matches the true answer.
   - Compare this verified correct option against 'markedAnswer'.
   - IF 'markedAnswer' does NOT match the verified correct option, YOU MUST:
     * Set "isAnswerKeyCorrect": false
     * Set "suggestedCorrectAnswer": "A", "B", "C", or "D" (strictly single letter)
     * Explain EXACTLY why 'markedAnswer' is wrong and why the suggested option is correct in "analysisReason" and "factualError".
3. ALL OPTIONS INCORRECT AUDIT:
   - IF NONE of Option A, B, C, or D is correct (or if all 4 options are mathematically/factually wrong for the question statement):
     * Set "isAnswerKeyCorrect": false
     * Set "areAllOptionsWrong": true
     * Set "suggestedCorrectAnswer": "NONE"
     * Explain clearly why all 4 options are invalid in "analysisReason".
4. EXPLANATION CONTRADICTION & FORMULA AUDIT:
   - Check if the provided explanation contradicts 'markedAnswer' (e.g. explanation says "Option B is correct" while markedAnswer is 'A').
   - Check for calculation errors, wrong formulas, bad history dates, scientific mistakes, or grammatical errors.

CRITICAL FORMAT RULES:
- "suggestedCorrectAnswer" MUST be strictly ONE character: "A", "B", "C", "D", or "NONE" (never "Option B" or "b").
- "isAnswerKeyCorrect" MUST be false whenever 'markedAnswer' is wrong or options are invalid.
- Be extremely thorough, critical, and accurate!

Return strictly a JSON array of objects with schema:
[
  {
    "batchIndex": number,
    "isAnswerKeyCorrect": boolean,
    "areAllOptionsWrong": boolean,
    "suggestedCorrectAnswer": "A" | "B" | "C" | "D" | "NONE",
    "confidenceScore": number (1 to 100),
    "factualError": string or null,
    "suggestedFixText": string or null,
    "analysisReason": string
  }
]`;

    // Execute via Gemini and Groq APIs with automatic multi-key & multi-model failovers
    const responseText = await executeAiCallServer(req.body, JSON.stringify(promptPayload), systemInstruction);
    const parsed = cleanAndParseJson(responseText);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return res.json({ success: true, results: parsed });
    }
  } catch (error: any) {
    console.warn("AI 360 Audit Endpoint Warning:", error.message);
    return res.status(500).json({ success: false, error: error.message || "Failed to perform 360 Audit" });
  }

  return res.json({ success: false, error: "AI 360 Audit returned empty response." });
});

// AI Raw Text MCQ Auto-Parse Endpoint
app.post("/api/gemini/parse-text", async (req, res) => {
  const { apiKey, provider = "gemini", model, baseUrl, rawText } = req.body;
  if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
    return res.status(400).json({ error: "No raw text provided for parsing" });
  }

  try {
    const prompt = `Parse and extract ALL Multiple Choice Questions (MCQs) from the raw text below into a clean structured JSON array.

RAW TEXT CONTENT:
${rawText}

CRITICAL RULES:
1. Extract every single MCQ accurately.
2. For each question extract:
   - "question": full question stem (including bilingual text if present, math symbols like √7, fractions like 5/8, exponents, etc.).
   - "optionA": text of option A / 1 / क.
   - "optionB": text of option B / 2 / ख.
   - "optionC": text of option C / 3 / ग.
   - "optionD": text of option D / 4 / घ.
   - "answer": correct answer letter strictly 'A', 'B', 'C', or 'D'.
   - "explanation": ONLY extract explanation or solution text if explicitly present in the raw text (e.g. "Exp:", "Explanation:", "Solution:", "व्याख्या:"). If NO explanation is written in the raw text, return an empty string "" strictly. DO NOT generate, fabricate, or invent an explanation.
   - "subject": subject specified in text (e.g. "Maths"), default to "Maths" if math symbols, else "General Knowledge".
   - "chapter": chapter or topic name specified in text (e.g. "Number System"), default to "General".
   - "difficulty": 'Easy', 'Moderate', or 'Hard'.

Return response strictly as a JSON object with a "questions" key containing array of objects.`;

    const systemInstruction = "You are an expert exam question parser and digitizer. Convert unstructured question text into valid structured JSON strictly.";

    const text = await executeAiCallServer(req.body, prompt, systemInstruction);
    const parsed = cleanAndParseJson(text);
    const list = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.items || []);

    if (Array.isArray(list) && list.length > 0) {
      return res.json({ success: true, questions: list });
    }
  } catch (error: any) {
    console.warn("AI Parse Text Endpoint Warning:", error.message);
    return res.status(500).json({ success: false, error: error.message || "Failed to parse text via AI" });
  }

  return res.json({ success: false, error: "AI could not extract any questions from the provided text." });
});

// Helper to create Cloudflare R2 S3 Client
function getR2S3Client(accountId: string, accessKeyId: string, secretAccessKey: string, customEndpoint?: string) {
  const cleanAccountId = (accountId || "").trim();
  const endpoint = customEndpoint && customEndpoint.trim()
    ? customEndpoint.trim()
    : `https://${cleanAccountId}.r2.cloudflarestorage.com`;
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: (accessKeyId || "").trim(),
      secretAccessKey: (secretAccessKey || "").trim()
    }
  });
}

// Cloudflare R2 Connection Test Endpoint
app.post("/api/r2/test", async (req, res) => {
  const { accountId, accessKeyId, secretAccessKey, bucketName, customDomain } = req.body;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    return res.status(400).json({ success: false, error: "Account ID, Access Key ID, and Secret Access Key are required." });
  }

  const targetBucket = (bucketName || "backups").trim();

  try {
    const s3 = getR2S3Client(accountId, accessKeyId, secretAccessKey, customDomain);
    // Test bucket existence or list objects
    const command = new ListObjectsV2Command({ Bucket: targetBucket, MaxKeys: 1 });
    await s3.send(command);
    return res.json({
      success: true,
      message: `Successfully connected to Cloudflare R2 Bucket "${targetBucket}"!`
    });
  } catch (error: any) {
    console.warn("Cloudflare R2 Test Error:", error.message);
    let msg = error.message || String(error);
    if (msg.includes("NoSuchBucket") || msg.includes("The specified bucket does not exist")) {
      msg = `Bucket "${targetBucket}" does not exist in your Cloudflare R2 account. Please create the bucket in Cloudflare dashboard or check spelling.`;
    } else if (msg.includes("AccessDenied") || msg.includes("InvalidAccessKeyId") || msg.includes("SignatureDoesNotMatch")) {
      msg = `Authentication Failed: Invalid Access Key ID or Secret Access Key. Please check R2 API token permissions.`;
    }
    return res.status(400).json({ success: false, error: msg });
  }
});

// Cloudflare R2 List Objects Endpoint
app.post("/api/r2/list", async (req, res) => {
  const { accountId, accessKeyId, secretAccessKey, bucketName, customDomain } = req.body;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    return res.status(400).json({ success: false, error: "Cloudflare R2 credentials missing." });
  }

  const targetBucket = (bucketName || "backups").trim();

  try {
    const s3 = getR2S3Client(accountId, accessKeyId, secretAccessKey, customDomain);
    const command = new ListObjectsV2Command({ Bucket: targetBucket });
    const response = await s3.send(command);

    const files = (response.Contents || []).map(item => ({
      key: item.Key || "",
      name: item.Key || "",
      size: item.Size || 0,
      lastModified: item.LastModified ? item.LastModified.toISOString() : undefined,
      etag: item.ETag
    }));

    // Sort descending by last modified date
    files.sort((a, b) => {
      const timeA = a.lastModified ? new Date(a.lastModified).getTime() : 0;
      const timeB = b.lastModified ? new Date(b.lastModified).getTime() : 0;
      return timeB - timeA;
    });

    return res.json({ success: true, files });
  } catch (error: any) {
    console.warn("Cloudflare R2 List Error:", error.message);
    return res.status(500).json({ success: false, error: error.message || "Failed to list R2 bucket files." });
  }
});

// Cloudflare R2 Upload Object Endpoint
app.post("/api/r2/upload", async (req, res) => {
  const { accountId, accessKeyId, secretAccessKey, bucketName, customDomain, fileName, fileContentBase64, contentType } = req.body;
  if (!accountId || !accessKeyId || !secretAccessKey || !fileName || !fileContentBase64) {
    return res.status(400).json({ success: false, error: "Missing required parameters for upload." });
  }

  const targetBucket = (bucketName || "backups").trim();

  try {
    const buffer = Buffer.from(fileContentBase64, "base64");
    const s3 = getR2S3Client(accountId, accessKeyId, secretAccessKey, customDomain);

    const command = new PutObjectCommand({
      Bucket: targetBucket,
      Key: fileName,
      Body: buffer,
      ContentType: contentType || (fileName.endsWith(".gz") ? "application/gzip" : "application/json")
    });

    await s3.send(command);
    return res.json({ success: true, fileName, size: buffer.length });
  } catch (error: any) {
    console.warn("Cloudflare R2 Upload Error:", error.message);
    return res.status(500).json({ success: false, error: error.message || "Failed to upload file to Cloudflare R2." });
  }
});

// Cloudflare R2 Download Object Endpoint
app.post("/api/r2/download", async (req, res) => {
  const { accountId, accessKeyId, secretAccessKey, bucketName, customDomain, fileName } = req.body;
  if (!accountId || !accessKeyId || !secretAccessKey || !fileName) {
    return res.status(400).json({ success: false, error: "Missing required parameters for download." });
  }

  const targetBucket = (bucketName || "backups").trim();

  try {
    const s3 = getR2S3Client(accountId, accessKeyId, secretAccessKey, customDomain);
    const command = new GetObjectCommand({
      Bucket: targetBucket,
      Key: fileName
    });

    const response = await s3.send(command);
    if (!response.Body) {
      return res.status(404).json({ success: false, error: "File content empty." });
    }

    // Convert readable stream to Buffer
    const byteArray = await response.Body.transformToByteArray();
    const buffer = Buffer.from(byteArray);

    res.setHeader("Content-Type", response.ContentType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(buffer);
  } catch (error: any) {
    console.warn("Cloudflare R2 Download Error:", error.message);
    return res.status(500).json({ success: false, error: error.message || "Failed to download file from Cloudflare R2." });
  }
});

// Cloudflare R2 Delete Object Endpoint
app.post("/api/r2/delete", async (req, res) => {
  const { accountId, accessKeyId, secretAccessKey, bucketName, customDomain, fileName } = req.body;
  if (!accountId || !accessKeyId || !secretAccessKey || !fileName) {
    return res.status(400).json({ success: false, error: "Missing required parameters for deletion." });
  }

  const targetBucket = (bucketName || "backups").trim();

  try {
    const s3 = getR2S3Client(accountId, accessKeyId, secretAccessKey, customDomain);
    const command = new DeleteObjectCommand({
      Bucket: targetBucket,
      Key: fileName
    });

    await s3.send(command);
    return res.json({ success: true, message: `File "${fileName}" deleted from Cloudflare R2.` });
  } catch (error: any) {
    console.warn("Cloudflare R2 Delete Error:", error.message);
    return res.status(500).json({ success: false, error: error.message || "Failed to delete file from Cloudflare R2." });
  }
});

// ==========================================
// ONLINE MOCK TESTS & LIVE RESULT SYNC API
// ==========================================

function getWritableStorePath(): string {
  if (process.env.VERCEL) {
    return path.join("/tmp", "online_mocks_store.json");
  }
  const cwdPath = path.join(process.cwd(), "online_mocks_store.json");
  try {
    const testFile = path.join(process.cwd(), ".write_test_tmp");
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
    return cwdPath;
  } catch (_e) {
    return path.join("/tmp", "online_mocks_store.json");
  }
}

const ONLINE_MOCKS_FILE = getWritableStorePath();

interface ServerOnlineMock {
  shareId: string;
  mockId?: number;
  testName: string;
  instituteName?: string;
  duration: number;
  totalMarks: number;
  marksPerQuestion: number;
  negativeMarksPerQuestion: number;
  socialTasks: any[];
  questions: any[];
  createdDate: string;
  instructions?: string;
  isActive: boolean;
  attempts: any[];
}

let onlineMocksStore: Record<string, ServerOnlineMock> = {};

try {
  if (fs.existsSync(ONLINE_MOCKS_FILE)) {
    const rawData = fs.readFileSync(ONLINE_MOCKS_FILE, "utf-8");
    onlineMocksStore = JSON.parse(rawData);
  } else {
    // Try reading from process.cwd() as fallback if read-only cwd has initial data
    const altPath = path.join(process.cwd(), "online_mocks_store.json");
    if (fs.existsSync(altPath)) {
      const rawData = fs.readFileSync(altPath, "utf-8");
      onlineMocksStore = JSON.parse(rawData);
    }
  }
} catch (e) {
  console.warn("Could not read online_mocks_store.json, starting fresh.", e);
}

function saveOnlineMocksStore() {
  try {
    fs.writeFileSync(ONLINE_MOCKS_FILE, JSON.stringify(onlineMocksStore, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to save online_mocks_store.json", e);
  }
}

function parseSafeNumber(val: any, fallback: number): number {
  if (val === undefined || val === null || val === '') return fallback;
  const numStr = String(val).replace(',', '.').trim();
  const parsed = parseFloat(numStr);
  return isNaN(parsed) ? fallback : parsed;
}

// 1. Create or Update Published Online Mock
app.post("/api/online-mocks", (req, res) => {
  try {
    const {
      shareId,
      mockId,
      testName,
      instituteName,
      duration,
      totalMarks,
      marksPerQuestion,
      negativeMarksPerQuestion,
      socialTasks,
      questions,
      instructions,
      isActive
    } = req.body || {};

    if (!testName || !questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ success: false, error: "Test name and valid question list are required." });
    }

    const sid = shareId && shareId.trim() ? shareId.trim() : `mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const existing = onlineMocksStore[sid];

    const parsedDuration = parseSafeNumber(duration, 60);
    const parsedMarksPerQ = parseSafeNumber(marksPerQuestion, 2);
    const parsedNegMarksPerQ = parseSafeNumber(negativeMarksPerQuestion, 0.5);
    const parsedTotalMarks = parseSafeNumber(totalMarks, questions.length * parsedMarksPerQ);

    const mockRecord: ServerOnlineMock = {
      shareId: sid,
      mockId: mockId || (existing ? existing.mockId : Date.now()),
      testName: String(testName).trim(),
      instituteName: (instituteName || "Gradeup Study").trim(),
      duration: parsedDuration,
      totalMarks: parsedTotalMarks,
      marksPerQuestion: parsedMarksPerQ,
      negativeMarksPerQuestion: parsedNegMarksPerQ,
      socialTasks: Array.isArray(socialTasks) ? socialTasks : [],
      questions,
      createdDate: existing ? existing.createdDate : new Date().toISOString(),
      instructions: instructions || "Select the correct option for each question. Time limit is strictly enforced.",
      isActive: isActive !== false,
      attempts: existing ? existing.attempts || [] : []
    };

    onlineMocksStore[sid] = mockRecord;
    saveOnlineMocksStore();

    return res.json({
      success: true,
      shareId: sid,
      message: `Online Mock Test "${testName}" successfully published!`,
      onlineMock: {
        ...mockRecord,
        totalAttempts: mockRecord.attempts.length
      }
    });
  } catch (err: any) {
    console.error("Error publishing online mock:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to publish online mock." });
  }
});

// 2. List all published online mocks (For Admin)
app.get("/api/online-mocks", (_req, res) => {
  try {
    const list = Object.values(onlineMocksStore).map(m => {
      const attemptsCount = m.attempts ? m.attempts.length : 0;
      const totalScoreSum = m.attempts ? m.attempts.reduce((acc, curr) => acc + (curr.score || 0), 0) : 0;
      const avgScore = attemptsCount > 0 ? Math.round((totalScoreSum / attemptsCount) * 10) / 10 : 0;
      return {
        shareId: m.shareId,
        mockId: m.mockId,
        testName: m.testName,
        instituteName: m.instituteName,
        duration: m.duration,
        totalMarks: m.totalMarks,
        questionCount: m.questions ? m.questions.length : 0,
        socialTasksCount: m.socialTasks ? m.socialTasks.length : 0,
        createdDate: m.createdDate,
        isActive: m.isActive,
        totalAttempts: attemptsCount,
        avgScore
      };
    });

    list.sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime());
    return res.json({ success: true, mocks: list });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Failed to list online mocks." });
  }
});

// 3. Get Public Details of a Published Online Mock (For Student Portal)
app.get("/api/online-mocks/:shareId", (req, res) => {
  try {
    const { shareId } = req.params;
    const mock = onlineMocksStore[shareId];

    if (!mock) {
      return res.status(404).json({ success: false, error: "Online Mock Test not found or invalid link." });
    }

    if (!mock.isActive) {
      return res.status(403).json({ success: false, error: "This Mock Test has been closed or paused by the administrator." });
    }

    const sanitizedQuestions = (mock.questions || []).map((q, idx) => ({
      id: q.id || idx + 1,
      subject: q.subject || "General",
      chapter: q.chapter || "General",
      question: q.question,
      translation: q.translation,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      answer: q.answer,
      explanation: q.explanation
    }));

    return res.json({
      success: true,
      onlineMock: {
        shareId: mock.shareId,
        testName: mock.testName,
        instituteName: mock.instituteName,
        duration: mock.duration,
        totalMarks: mock.totalMarks,
        marksPerQuestion: mock.marksPerQuestion,
        negativeMarksPerQuestion: mock.negativeMarksPerQuestion,
        socialTasks: mock.socialTasks || [],
        instructions: mock.instructions,
        questions: sanitizedQuestions,
        totalAttempts: mock.attempts ? mock.attempts.length : 0
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Failed to load online mock." });
  }
});

// 4. Submit Student Attempt & Live Rank Calculation
app.post("/api/online-mocks/:shareId/submit", (req, res) => {
  try {
    const { shareId } = req.params;
    const {
      studentName,
      mobileNo,
      state,
      district,
      socialsFollowed,
      answers,
      timeTakenSeconds
    } = req.body;

    const mock = onlineMocksStore[shareId];
    if (!mock) {
      return res.status(404).json({ success: false, error: "Online Mock Test not found." });
    }

    if (!studentName || !mobileNo || !state || !district) {
      return res.status(400).json({ success: false, error: "Please provide Name, Mobile No, State, and District." });
    }

    const posMark = mock.marksPerQuestion || 2;
    const negMark = mock.negativeMarksPerQuestion || 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let unattemptedCount = 0;

    const userAnswers: Record<number, 'A' | 'B' | 'C' | 'D'> = answers || {};

    (mock.questions || []).forEach((q, idx) => {
      const qKey = q.id || idx + 1;
      const userAns = userAnswers[qKey] || userAnswers[idx];
      if (!userAns) {
        unattemptedCount++;
      } else if (userAns === q.answer) {
        correctCount++;
      } else {
        incorrectCount++;
      }
    });

    const calculatedScore = Math.max(0, (correctCount * posMark) - (incorrectCount * negMark));
    const percentage = Math.round((calculatedScore / (mock.totalMarks || 1)) * 1000) / 10;

    const attemptRecord = {
      id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      shareId,
      testName: mock.testName,
      studentName: String(studentName).trim(),
      mobileNo: String(mobileNo).trim(),
      state: String(state).trim(),
      district: String(district).trim(),
      socialsFollowed: Boolean(socialsFollowed),
      score: calculatedScore,
      totalMarks: mock.totalMarks,
      percentage,
      correctCount,
      incorrectCount,
      unattemptedCount,
      timeTakenSeconds: Number(timeTakenSeconds) || 0,
      submittedAt: new Date().toISOString(),
      answers: userAnswers
    };

    if (!mock.attempts) mock.attempts = [];
    mock.attempts.push(attemptRecord);
    saveOnlineMocksStore();

    const sortedAttempts = [...mock.attempts].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timeTakenSeconds - b.timeTakenSeconds;
    });

    const rank = sortedAttempts.findIndex(a => a.id === attemptRecord.id) + 1;
    const totalAttempts = sortedAttempts.length;

    const topRankers = sortedAttempts.slice(0, 10).map((att, idx) => ({
      rank: idx + 1,
      studentName: att.studentName,
      state: att.state,
      district: att.district,
      score: att.score,
      totalMarks: att.totalMarks,
      percentage: att.percentage,
      timeTakenSeconds: att.timeTakenSeconds
    }));

    return res.json({
      success: true,
      attempt: {
        ...attemptRecord,
        rank
      },
      rank,
      totalAttempts,
      topRankers
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Failed to submit test attempt." });
  }
});

// 5. Get Results & Topper List for Admin
app.get("/api/online-mocks/:shareId/results", (req, res) => {
  try {
    const { shareId } = req.params;
    const mock = onlineMocksStore[shareId];

    if (!mock) {
      return res.status(404).json({ success: false, error: "Online Mock Test not found." });
    }

    const allAttempts = [...(mock.attempts || [])].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timeTakenSeconds - b.timeTakenSeconds;
    });

    const rankedAttempts = allAttempts.map((att, idx) => ({
      ...att,
      rank: idx + 1
    }));

    const totalAttempts = rankedAttempts.length;
    const avgScore = totalAttempts > 0
      ? Math.round((rankedAttempts.reduce((a, c) => a + c.score, 0) / totalAttempts) * 10) / 10
      : 0;
    const highestScore = totalAttempts > 0 ? rankedAttempts[0].score : 0;

    return res.json({
      success: true,
      summary: {
        shareId: mock.shareId,
        testName: mock.testName,
        totalAttempts,
        avgScore,
        highestScore,
        topRankers: rankedAttempts.slice(0, 10),
        allAttempts: rankedAttempts
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Failed to fetch results." });
  }
});

// 6. Delete Published Online Mock
app.delete("/api/online-mocks/:shareId", (req, res) => {
  try {
    const { shareId } = req.params;
    if (onlineMocksStore[shareId]) {
      delete onlineMocksStore[shareId];
      saveOnlineMocksStore();
      return res.json({ success: true, message: "Published mock test deleted." });
    }
    return res.status(404).json({ success: false, error: "Online mock test not found." });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Failed to delete online mock." });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Gradeup Study server running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
