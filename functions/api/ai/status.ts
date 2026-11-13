import { configured, json, type Env } from "../../_lib/llm";

export const onRequestGet = async ({ env }: { env: Env }): Promise<Response> =>
  json({ enabled: configured(env), model: env.LLM_MODEL || null, visionModel: env.VISION_MODEL || env.LLM_MODEL || null });
