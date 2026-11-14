import { configured, json, type Env } from "../../_lib/llm";
import receiptTrainingConfig from "../../../universal_crinkly_receipt_ai_training_v3.json";
import receiptEvaluationReference from "../../../receipt-image-evaluation.json";

export const onRequestGet = async ({ env }: { env: Env }): Promise<Response> =>
  json({
    enabled: configured(env),
    model: env.LLM_MODEL || null,
    visionModel: env.VISION_MODEL || env.LLM_MODEL || null,
    reference: {
      trainingProfile: receiptTrainingConfig.dataset_name,
      trainingProfileVersion: receiptTrainingConfig.version,
      evaluationDataset: receiptEvaluationReference.dataset_name,
      evaluationDatasetVersion: receiptEvaluationReference.version,
      verifiedImageCount: receiptEvaluationReference.image_count,
      distinctReceiptCount: receiptEvaluationReference.distinct_receipt_count,
      loadedServerSide: true,
      trainsModelWeights: false
    }
  });
