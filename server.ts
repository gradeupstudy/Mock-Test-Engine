import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

export const app = express();
const PORT = 3000;

app.use(express.json({ limit: "25mb" }));

// Enable CORS for cross-origin or Vercel serverless requests
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (_req.method === "OPTIONS") {
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

    let langInstruction = "Provide a step-by-step educational explanation in DUAL LANGUAGE (English & Hindi). Format:\nEnglish: <explanation in English>\nहिंदी: <व्याख्या हिंदी में>";
    if (isLang) {
      if (subLower.includes("hindi") || subLower.includes("हिन्दी")) {
        langInstruction = "Provide detailed step-by-step explanation strictly in HINDI.";
      } else {
        langInstruction = "Provide detailed step-by-step explanation strictly in ENGLISH.";
      }
    }
    if (isMathReasoning) {
      langInstruction += " MANDATE FOR MATH/REASONING: DO NOT use Hindi Purna Viram ('।') symbol at sentence ends in Hindi text; use standard full stop ('.') instead so '।' is not misread as number '1'.";
    }

    const optA = q.optionA || q.options?.A || "";
    const optB = q.optionB || q.options?.B || "";
    const optC = q.optionC || q.options?.C || "";
    const optD = q.optionD || q.options?.D || "";
    const ansLetter = q.answer || "A";

    const query = `MCQ Question: ${q.question}
Options: (A) ${optA} (B) ${optB} (C) ${optC} (D) ${optD}
Correct Answer: Option ${ansLetter}
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
      let explanationText = data.answer || "";

      if (!explanationText && Array.isArray(data.results) && data.results.length > 0) {
        explanationText = data.results.map((r: any) => r.content).filter(Boolean).join("\n").slice(0, 600);
      }

      if (!explanationText) {
        explanationText = `Option ${ansLetter} is correct according to standard guidelines.`;
      }

      explanations.push({
        index: i,
        idTemp: q.idTemp || q.id || i,
        explanation: cleanPurnaViramForMathReasoningServer(explanationText, q.subject, q.chapter)
      });
    } catch (err: any) {
      console.warn(`[Tavily Explain Fallback] Question ${i + 1} failed:`, err.message);
      explanations.push({
        index: i,
        idTemp: q.idTemp || q.id || i,
        explanation: cleanPurnaViramForMathReasoningServer(`Option ${ansLetter} is the correct answer according to standard concepts.`, q.subject, q.chapter)
      });
    }
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

  // 1. Prioritize Tavily Search API for Explanation Generation when Tavily Key is available
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

  if (tavilyKey || provider === "tavily") {
    try {
      console.log("[AI Explain 1st Preference] Executing Question Explanation via Tavily Search AI Engine...");
      const tavilyExplanations = await callTavilyExplain(tavilyKey, questions);
      if (tavilyExplanations && tavilyExplanations.length > 0) {
        return res.json({ success: true, explanations: tavilyExplanations, providerUsed: "tavily" });
      }
    } catch (tavErr: any) {
      console.warn("Tavily Explanation Engine Primary Warning:", tavErr.message);
    }
  }

  // 2. Gemini / Groq / Secondary AI Fallback for Explanations
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

    const prompt = `Generate a clear, accurate, step-by-step educational explanation for each MCQ below explaining why the specified correct answer is right.

CRITICAL EXPLANATION LANGUAGE MANDATE:
1. LANGUAGE SUBJECTS EXEMPTION:
   - If "isLanguageSubject" is true AND the subject is "English" / "English Grammar", generate explanation strictly in ENGLISH ONLY.
   - If "isLanguageSubject" is true AND the subject is "Hindi" / "General Hindi", generate explanation strictly in HINDI ONLY.

2. FOR ALL OTHER SECTIONS & SUBJECTS (e.g., Mathematics, Reasoning, Science, General Knowledge / GS, Computer, Himachal Pradesh GK, History, Geography, Polity, Physics, Chemistry, Biology, Economics, Pedagogy, etc. or where "isLanguageSubject" is false):
   You MUST generate a DUAL LANGUAGE (Bilingual: BOTH English AND Hindi) explanation for EVERY single question!

   REQUIRED DUAL LANGUAGE FORMAT:
   Each "explanation" string MUST include BOTH the English explanation paragraph AND the Hindi explanation paragraph, formatted like this:

   English: <Detailed step-by-step explanation in English detailing why the option is correct>
   हिंदी: <विस्तृत व्याख्या हिंदी में कि यह विकल्प क्यों सही है>

   DO NOT output only English or only Hindi for non-language subjects. BOTH English and Hindi sections are MANDATORY in every explanation string!

3. CRITICAL MANDATE FOR MATHEMATICS & REASONING SUBJECTS (where "isMathOrReasoning" is true or subject is Math/Reasoning/Aptitude):
   In the Hindi explanation text for Mathematics and Reasoning topics, DO NOT USE the Hindi Purna Viram symbol ('।'). Use standard full stop ('.') or newline instead at sentence ends. NEVER output '।' in Hindi math explanations because '।' is mistakenly misread as the number '1' in numerical expressions!

Questions:
${JSON.stringify(formattedQuestions, null, 2)}

Return response strictly as a JSON array where each object has keys: "index", "idTemp" or "id", and "explanation".`;

    const systemInstruction = "You are an expert bilingual educational tutor. MANDATE: For all subjects/sections except pure English or Hindi language sections, you MUST generate step-by-step explanations in DUAL LANGUAGE (Bilingual: English + Hindi). Every explanation string MUST contain BOTH an English section ('English: ...') and a Hindi section ('हिंदी: ...'). For Math/Reasoning, DO NOT use Hindi Purna Viram ('।') at sentence ends; use standard full stop ('.') instead.";

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

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
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
