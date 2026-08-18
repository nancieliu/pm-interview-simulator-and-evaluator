const evaluationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["overallSummary", "strongestSignal", "topImprovement", "deliveryScore", "productScore", "deliveryEvidence", "productEvidence", "improvedExample"],
  properties: {
    overallSummary: { type: "string" },
    strongestSignal: { type: "string" },
    topImprovement: { type: "string" },
    deliveryScore: { type: "integer", minimum: 0, maximum: 100 },
    productScore: { type: "integer", minimum: 0, maximum: 100 },
    deliveryEvidence: {
      type: "array", minItems: 3, maxItems: 5,
      items: { type: "object", additionalProperties: false, required: ["title", "evidence", "coaching"], properties: { title: { type: "string" }, evidence: { type: "string" }, coaching: { type: "string" } } },
    },
    productEvidence: {
      type: "array", minItems: 3, maxItems: 5,
      items: { type: "object", additionalProperties: false, required: ["title", "evidence", "coaching"], properties: { title: { type: "string" }, evidence: { type: "string" }, coaching: { type: "string" } } },
    },
    improvedExample: { type: "string" },
  },
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ available: false }, { status: 503 });

  const session = await request.json();
  const input = `Evaluate this Product Sense mock interview.

Question: ${session.question}
Style: ${session.style}
Duration seconds: ${session.durationSeconds}
Approximate speaking pace: ${session.pace} words per minute
Detected filler count: ${session.fillerCount}
Follow-ups completed: ${session.followUpCount}

Shared working notes (assess whether they made the candidate's thinking easier to follow; treat note-taking as supporting evidence for structure, prioritization, and interview communication—not as a separate writing contest):
${session.notes || "No notes"}

Transcript:
${(session.transcript || []).map((entry: { speaker: string; text: string; at: number }) => `[${entry.at}s] ${entry.speaker}: ${entry.text}`).join("\n")}

Score Delivery and Product Thinking independently and equally. Be evidence-based, direct, and calibrated for a Senior/Lead PM interview. Delivery includes structure, signposting, concision, pacing, composure, verbal clarity, and interaction. Product Thinking includes objective, user choice, problem depth, prioritization, solutions, trade-offs, metrics, and adaptation. Do not infer emotion, personality, or competence from accent. If transcript evidence is limited, say so and lower confidence rather than inventing evidence. The improved example must preserve the candidate's ideas while making the delivery more concise and confident.`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.6",
      store: false,
      instructions: "You are a rigorous Product Management interview evaluator. Produce concise, actionable feedback grounded only in the supplied session evidence.",
      input,
      text: { format: { type: "json_schema", name: "interview_evaluation", strict: true, schema: evaluationSchema } },
    }),
  });

  const data = await response.json();
  if (!response.ok) return Response.json({ error: data?.error?.message || "Evaluation failed" }, { status: response.status });
  const outputText = data.output?.flatMap((item: { content?: Array<{ type: string; text?: string }> }) => item.content || []).find((part: { type: string }) => part.type === "output_text")?.text;
  if (!outputText) return Response.json({ error: "No evaluation returned" }, { status: 502 });
  return Response.json({ evaluation: JSON.parse(outputText) });
}
