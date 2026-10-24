// Owner: Role 3. Bitdeer AI Model Studio. Its inference API follows the OpenAI REST standard,
// so we use the `openai` SDK with Bitdeer's base URL. Pick a fast model in Model Studio and set BITDEER_MODEL.
import OpenAI from "openai";
import type { ModelProvider } from "./provider";

export const BITDEER_BASE_URL = "https://api-inference.bitdeer.ai/v1";
export const DEFAULT_BITDEER_MODEL = "set-BITDEER_MODEL-in-convex-env";

export function bitdeerProvider(): ModelProvider {
  const model = process.env.BITDEER_MODEL || DEFAULT_BITDEER_MODEL;
  return {
    name: "bitdeer",
    model,
    available: () => !!process.env.BITDEER_API_KEY && !!process.env.BITDEER_MODEL,
    async json(req) {
      const client = new OpenAI({ apiKey: process.env.BITDEER_API_KEY, baseURL: BITDEER_BASE_URL, maxRetries: 0 });
      const res = await client.chat.completions.create(
        {
          model,
          temperature: req.temperature,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: `${req.system}\nJSON Schema of your reply:\n${JSON.stringify(req.jsonSchema)}` },
            { role: "user", content: req.user },
          ],
        },
        { signal: req.signal },
      );
      const text = res.choices[0]?.message?.content ?? "";
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start < 0 || end < start) throw new Error("no JSON object in reply");
      return JSON.parse(text.slice(start, end + 1));
    },
  };
}
