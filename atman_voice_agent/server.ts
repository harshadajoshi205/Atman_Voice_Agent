import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

const ALLOWED_ORIGINS = [
  "https://atmanconsultants.com",           // production domain
  "https://www.atmanconsultants.com",       // www variant
  "https://YOUR_ANGULAR_APP.web.app",       // if hosted on Firebase Hosting
  "https://YOUR_ANGULAR_APP.firebaseapp.com", // Firebase default domain
  "http://localhost:4200",                  // Angular dev server (local testing)
];

app.use((req, res, next) => {
  const origin = req.headers.origin || "";

  // Only set the header if the request comes from a known allowed origin.
  // Setting * would expose your API to any website on the internet.
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  // Which HTTP methods Angular is allowed to use
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  // Which headers Angular is allowed to send
  // Content-Type is needed for your POST /api/conversations/process call
  // Authorization is needed if you add auth tokens later
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Allow Angular to read response headers (needed for some HTTP interceptors)
  res.setHeader("Access-Control-Expose-Headers", "Content-Type");

  // How long the browser caches this CORS preflight response (in seconds)
  // 86400 = 24 hours — browser won't send a preflight OPTIONS request every time
  res.setHeader("Access-Control-Max-Age", "86400");

  // OPTIONS is the browser's "preflight" check — it asks "am I allowed to call this?"
  // before sending the real POST/GET. Must return 204 immediately.
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

// Database Setup
const db = new Database("goldstone.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    transcript_text TEXT,
    call_status TEXT DEFAULT 'completed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER,
    user_name TEXT DEFAULT '-',
    user_contact_number TEXT DEFAULT '-',
    gauge_number TEXT DEFAULT '-',
    current_number_of_machines TEXT DEFAULT '-',
    required_number_of_machines TEXT DEFAULT '-',
    machine_type TEXT DEFAULT '-',
    hosiery_location TEXT DEFAULT '-',
    meeting_scheduled_on TEXT DEFAULT '-',
    interested_or_not TEXT DEFAULT '-',
    when_user_wants_machines TEXT DEFAULT '-',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations (id)
  );
`);

// Date Resolver Logic
function resolveRelativeDate(text: string): string {
  if (!text || text === "-") return "-";
  
  const lowerText = text.toLowerCase().trim();
  const now = new Date();
  
  if (lowerText.includes("today") || lowerText.includes("aaj")) {
    return now.toISOString().split('T')[0];
  }
  if (lowerText.includes("tomorrow") || lowerText.includes("kal")) {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }
  if (lowerText.includes("day after tomorrow") || lowerText.includes("parso")) {
    const dayAfter = new Date(now);
    dayAfter.setDate(now.getDate() + 2);
    return dayAfter.toISOString().split('T')[0];
  }
  
  if (lowerText.includes("next week") || lowerText.includes("agle hafte")) {
    const nextWeek = new Date(now);
    nextWeek.setDate(now.getDate() + 7);
    return nextWeek.toISOString().split('T')[0];
  }
  
  if (lowerText.includes("next month") || lowerText.includes("agle mahine")) {
    const nextMonth = new Date(now);
    nextMonth.setMonth(now.getMonth() + 1);
    return nextMonth.toISOString().split('T')[0];
  }

  const daysLaterMatch = lowerText.match(/(\d+)\s*days?\s*later/);
  if (daysLaterMatch) {
    const days = parseInt(daysLaterMatch[1]);
    const future = new Date(now);
    future.setDate(now.getDate() + days);
    return future.toISOString().split('T')[0];
  }

  const dinBaadMatch = lowerText.match(/(\d+)\s*din\s*baad/);
  if (dinBaadMatch) {
    const days = parseInt(dinBaadMatch[1]);
    const future = new Date(now);
    future.setDate(now.getDate() + days);
    return future.toISOString().split('T')[0];
  }

  const daysMap: Record<string, number> = {
    "monday": 1, "tuesday": 2, "wednesday": 3, "thursday": 4, "friday": 5, "saturday": 6, "sunday": 0,
    "somvar": 1, "mangalvar": 2, "budhvar": 3, "guruvar": 4, "shukravar": 5, "shanivar": 6, "ravivar": 0
  };

  for (const [dayName, dayIdx] of Object.entries(daysMap)) {
    if (lowerText.includes(dayName)) {
      const currentDay = now.getDay();
      let daysAhead = dayIdx - currentDay;
      if (daysAhead <= 0) daysAhead += 7;
      const future = new Date(now);
      future.setDate(now.getDate() + daysAhead);
      return future.toISOString().split('T')[0];
    }
  }

  return text;
}

// Lead Extraction Logic
async function extractLeadInfo(transcript: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is missing in server environment");
    return null;
  }
  
  const genAI = new GoogleGenAI({ apiKey });

  const prompt = `
    Analyze the following conversation transcript between a voice agent (Goldstone AI) and a customer.
    Extract the business lead information into a JSON format.
    
    Transcript:
    ${transcript}
    
    Fields to extract:
    - user_name: Name of the customer (if mentioned)
    - user_contact_number: Contact number (if mentioned)
    - gauge_number: Machine gauge requirement (e.g., 1.5, 12, 14)
    - current_number_of_machines: How many machines they currently have
    - required_number_of_machines: How many machines they want to buy
    - machine_type: One of [Renew, Recondition, New]
    - hosiery_location: Location of their factory/business
    - meeting_scheduled_on: When they agreed to meet (relative or absolute)
    - interested_or_not: Normalized to [yes, no, -]
    - when_user_wants_machines: Buying timeline (e.g., next month, immediately)
    
    Rules:
    - Use "-" for any field not found.
    - machine_type must be one of [Renew, Recondition, New] or "-".
    - interested_or_not must be [yes, no, -].
    - Return ONLY the JSON object.
  `;

  try {
    const result = await genAI.models.generateContent({
      model: "gemini-3.1-flash-live-preview",
      contents: [{ parts: [{ text: prompt }] }],
    });
    const text = result.text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      if (data.meeting_scheduled_on && data.meeting_scheduled_on !== "-") {
        data.meeting_scheduled_on = resolveRelativeDate(data.meeting_scheduled_on);
      }
      return data;
    }
  } catch (error) {
    console.error("Error extracting lead info:", error);
  }
  return null;
}

// API Routes
app.post("/api/conversations/process", async (req, res) => {
  const { transcript_text, call_status = "completed" } = req.body;
  
  try {
    // 1. Store conversation
    const convStmt = db.prepare("INSERT INTO conversations (transcript_text, call_status) VALUES (?, ?)");
    const convResult = convStmt.run(transcript_text, call_status);
    const convId = convResult.lastInsertRowid;

    // 2. Extract lead info
    const leadInfo = await extractLeadInfo(transcript_text);
    if (leadInfo) {
      const leadStmt = db.prepare(`
        INSERT INTO leads (
          conversation_id, user_name, user_contact_number, gauge_number,
          current_number_of_machines, required_number_of_machines, machine_type,
          hosiery_location, meeting_scheduled_on, interested_or_not, when_user_wants_machines
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      leadStmt.run(
        convId,
        leadInfo.user_name || "-",
        leadInfo.user_contact_number || "-",
        leadInfo.gauge_number || "-",
        leadInfo.current_number_of_machines || "-",
        leadInfo.required_number_of_machines || "-",
        leadInfo.machine_type || "-",
        leadInfo.hosiery_location || "-",
        leadInfo.meeting_scheduled_on || "-",
        leadInfo.interested_or_not || "-",
        leadInfo.when_user_wants_machines || "-"
      );
    }

    const fullConv = db.prepare("SELECT * FROM conversations WHERE id = ?").get(convId);
    const lead = db.prepare("SELECT * FROM leads WHERE conversation_id = ?").get(convId);
    
    res.json({ ...fullConv, lead });
  } catch (error) {
    console.error("Error processing conversation:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/dashboard/logs", (req, res) => {
  try {
    const conversations = db.prepare("SELECT * FROM conversations ORDER BY timestamp DESC LIMIT 50").all();
    const logs = conversations.map((conv: any) => {
      const lead = db.prepare("SELECT * FROM leads WHERE conversation_id = ?").get(conv.id);
      let summary = "No lead info";
      let interest = "-";
      let contact = "-";
      let meeting = "-";
      
      if (lead) {
        interest = lead.interested_or_not;
        contact = lead.user_contact_number;
        meeting = lead.meeting_scheduled_on;
        summary = `Lead: ${lead.user_name} | ${lead.gauge_number} Gauge | ${lead.required_number_of_machines} Machines`;
      }

      return {
        id: conv.id,
        timestamp: conv.timestamp,
        summary,
        interest_status: interest,
        contact_number: contact,
        meeting_date: meeting,
        transcript_text: conv.transcript_text,
        lead_data: lead
      };
    });
    res.json(logs);
  } catch (error) {
    console.error("Error fetching logs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/leads", (req, res) => {
  try {
    const leads = db.prepare("SELECT * FROM leads ORDER BY created_at DESC").all();
    res.json(leads);
  } catch (error) {
    console.error("Error fetching leads:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Vite Integration
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
    app.get("*", (req, res, next) => {
      // Don't serve index.html for API routes
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
