const rubricItem = { type: "object", additionalProperties: false, required: ["id", "title", "score", "maxScore", "evidence", "coaching"], properties: { id: { type: "string" }, title: { type: "string" }, score: { type: "integer", minimum: 0 }, maxScore: { type: "integer", minimum: 1 }, evidence: { type: "string" }, coaching: { type: "string" } } };
const evaluationSchema = {
  type: "object", additionalProperties: false,
  required: ["overallSummary", "strongestSignal", "topImprovement", "deliveryScore", "productScore", "productSections", "deliverySections", "grammar", "fillers", "pronunciation", "weaknesses", "nextPracticePlan", "improvedExample"],
  properties: {
    overallSummary: { type: "string" }, strongestSignal: { type: "string" }, topImprovement: { type: "string" }, deliveryScore: { type: "integer", minimum: 0, maximum: 100 }, productScore: { type: "integer", minimum: 0, maximum: 100 },
    productSections: { type: "array", minItems: 4, maxItems: 5, items: rubricItem }, deliverySections: { type: "array", minItems: 6, maxItems: 6, items: rubricItem },
    grammar: { type: "object", additionalProperties: false, required: ["errorCount", "summary", "patterns"], properties: { errorCount: { type: "integer", minimum: 0 }, summary: { type: "string" }, patterns: { type: "array", maxItems: 5, items: { type: "object", additionalProperties: false, required: ["category", "count", "example", "correction"], properties: { category: { type: "string" }, count: { type: "integer", minimum: 1 }, example: { type: "string" }, correction: { type: "string" } } } } } },
    fillers: { type: "object", additionalProperties: false, required: ["total", "perMinute", "summary", "items"], properties: { total: { type: "integer", minimum: 0 }, perMinute: { type: "number", minimum: 0 }, summary: { type: "string" }, items: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, required: ["phrase", "count"], properties: { phrase: { type: "string" }, count: { type: "integer", minimum: 1 } } } } } },
    pronunciation: { type: "object", additionalProperties: false, required: ["confidence", "summary", "patterns"], properties: { confidence: { type: "string", enum: ["high", "medium", "low", "unavailable"] }, summary: { type: "string" }, patterns: { type: "array", maxItems: 5, items: { type: "object", additionalProperties: false, required: ["word", "observation", "practice"], properties: { word: { type: "string" }, observation: { type: "string" }, practice: { type: "string" } } } } } },
    weaknesses: { type: "array", minItems: 2, maxItems: 5, items: { type: "object", additionalProperties: false, required: ["tag", "label", "evidence", "recommendation"], properties: { tag: { type: "string" }, label: { type: "string" }, evidence: { type: "string" }, recommendation: { type: "string" } } } },
    nextPracticePlan: { type: "array", minItems: 3, maxItems: 5, items: { type: "string" } }, improvedExample: { type: "string" },
  },
};
function transcriptText(entries: Array<{ speaker: string; text: string; at: number }> = []) { return entries.map((entry) => `[${entry.at}s] ${entry.speaker}: ${entry.text}`).join("\n"); }

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ available: false }, { status: 503 });
  const form = await request.formData();
  const session = JSON.parse(String(form.get("session") || "{}"));
  const audio = form.get("audio");
  let audioObservation = "No usable recording was supplied. Pronunciation confidence must be unavailable; do not invent pronunciation issues.";
  if (audio instanceof File && audio.size > 0) {
    try {
      const tf = new FormData(); tf.set("file", audio, audio.name || "interview.webm"); tf.set("model", "gpt-4o-transcribe"); tf.set("prompt", "Transcribe faithfully in US English. Preserve filler words, false starts, repeated phrases, and grammatical errors. Do not silently correct the speaker.");
      const tr = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: tf });
      const td = await tr.json();
      if (tr.ok && td.text) audioObservation = `Audio-derived transcript (use for delivery, fillers, grammar, and conservative intelligibility observations):\n${td.text}`;
    } catch { /* fall back to browser transcript */ }
  }
  const prior = Array.isArray(session.history) && session.history.length ? session.history.map((item: { date: string; style?: string; weaknesses: string[]; productScore: number; deliveryScore: number }) => `${item.date} (${item.style || "Product Sense"}): Product ${item.productScore}, Delivery ${item.deliveryScore}; ${item.weaknesses.join(", ")}`).join("\n") : "No prior sessions yet.";
  const stripeMode = session.style === "Stripe Product Sense";
  const productScoring = stripeMode
    ? `STRIPE PRODUCT SENSE (50 raw points; return exactly 4 productSections): user_empathy 14; product_strategy 14; product_design 14; critical_thinking_judgment 8. Normalize to productScore /100.
User empathy: identify distinct customer segments, separate functional from emotional needs, prioritize a segment and pain point, and tie recommendations to genuine needs.
Product strategy: connect the opportunity to company mission, macro and business goals, investment rationale, competitive landscape, differentiation, and well-reasoned success metrics. Penalize feature-first answers that skip this foundation.
Product design: generate multiple creative solutions, describe a high-level user flow, select an MVP with explicit rationale, and address technical, design, and market constraints, trade-offs, and edge cases.
Critical thinking and judgment: structure ambiguity, state assumptions, distinguish what matters from what does not, think aloud, make defensible decisions, and adapt to follow-ups. Judge reasoning quality here; verbal polish belongs in Delivery.`
    : `GENERAL PRODUCT SENSE (50 raw points; return exactly 5 productSections): product_motivation 8; segmentation 12; problem_identification 13; solution_development 13; synthesis_judgment 4. Normalize to productScore /100. Reward user/business motivation, behavior-based segmentation, specific prioritized problems, solution breadth and prioritization, credible V1, trade-offs, metrics, risks, GTM, synthesis, and adaptation. Core floor: if any of motivation, segmentation, problem identification, or solution development is below 60% of its max, productScore cannot exceed 69.`;
  const input = `Evaluate this Product Sense mock interview for a Senior/Lead PM.
QUESTION: ${session.question}\nSTYLE: ${session.style}\nDURATION: ${session.durationSeconds} seconds\nPACE: ${session.pace} words/minute\nFOLLOW-UPS: ${session.followUpCount}
WORKING NOTES (supporting evidence, not a writing contest):\n${session.notes || "No notes"}
BROWSER TRANSCRIPT:\n${transcriptText(session.transcript)}
${audioObservation}
PRIOR LOCAL HISTORY (use only to label recurring weaknesses; score this session independently):\n${prior}

SCORING — exactly 50/50 overall:
${productScoring}
DELIVERY & LANGUAGE (50 raw points): structure_waypointing 12; clarity_executive_communication 10; conversational_fluency 8; grammar 8; fillers_verbal_habits 6; pronunciation_intelligibility 6. Normalize to deliveryScore /100. Reward decision-first answers, signposting, concise logic, calm pauses, natural transitions, and collaborative interaction. Evaluate intelligibility, not accent conformity. Never penalize a non-native accent. Only name pronunciation issues when audio evidence supports a repeated or clear intelligibility problem; otherwise state insufficient evidence. Grammar patterns require short exact examples and corrections. Count fillers from audio-derived text when available.
Every rubric item must use the exact IDs and max scores above. Evidence must identify something actually said or written. Weakness tags must be stable snake_case labels. Give a focused next-session plan.`;
  const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "gpt-5.6", store: false, instructions: "You are a rigorous, fair Product Management interviewer and language coach. Ground every judgment in evidence and obey the scoring arithmetic.", input, text: { format: { type: "json_schema", name: "interview_evaluation", strict: true, schema: evaluationSchema } } }) });
  const data = await response.json();
  if (!response.ok) return Response.json({ error: data?.error?.message || "Evaluation failed" }, { status: response.status });
  const outputText = data.output?.flatMap((item: { content?: Array<{ type: string; text?: string }> }) => item.content || []).find((part: { type: string }) => part.type === "output_text")?.text;
  if (!outputText) return Response.json({ error: "No evaluation returned" }, { status: 502 });
  return Response.json({ evaluation: JSON.parse(outputText) });
}
