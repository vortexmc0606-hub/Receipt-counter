import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { config, hasLlm } from './config.js';
import { ReceiptStore } from './lib/store.js';
import { ask, readReceipt } from './lib/llm.js';
import { dataContext } from './lib/context.js';
import type { ChatMessage, Receipt } from './types.js';

const store = new ReceiptStore(config.dataFile);

/** Wraps an async handler so a thrown error reaches the error middleware. */
function ah(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') }));
  // Receipt images arrive as base64 data URLs inside JSON, so the body limit
  // has to clear the image limit with room to spare.
  app.use(express.json({ limit: Math.max(config.maxUploadBytes * 1.4, 16 * 1024 * 1024) }));

  // Optional shared app key: when configured, every /api call must present it.
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (!config.appKey) return next();
    if (req.get('x-app-key') === config.appKey) return next();
    res.status(401).json({ error: 'Invalid or missing app key.' });
  });

  app.get('/health', (_req, res) => {
    res.json({ ok: true, llm: hasLlm(), model: hasLlm() ? config.llmModel : null });
  });

  // ---- AI capability ----
  app.get(
    '/api/ai/status',
    ah(async (_req, res) => {
      res.json({ enabled: hasLlm(), model: hasLlm() ? config.llmModel : null, visionModel: hasLlm() ? config.visionModel : null });
    }),
  );

  // ---- Receipts CRUD ----
  app.get(
    '/api/receipts',
    ah(async (_req, res) => {
      res.json({ receipts: await store.all() });
    }),
  );

  app.post(
    '/api/receipts',
    ah(async (req, res) => {
      const body = req.body as { receipts?: Receipt[] } | Receipt;
      const incoming = Array.isArray((body as { receipts?: Receipt[] }).receipts)
        ? (body as { receipts: Receipt[] }).receipts
        : [body as Receipt];
      const valid = incoming.filter((r) => r && typeof r.id === 'string');
      const count = await store.putMany(valid);
      res.status(201).json({ saved: count });
    }),
  );

  app.delete(
    '/api/receipts/:id',
    ah(async (req, res) => {
      const removed = await store.remove(req.params.id);
      res.json({ removed });
    }),
  );

  app.delete(
    '/api/receipts',
    ah(async (_req, res) => {
      await store.clear();
      res.json({ cleared: true });
    }),
  );

  // ---- Read a receipt image with the server-held key ----
  app.post(
    '/api/parse',
    ah(async (req, res) => {
      if (!hasLlm()) {
        res.status(503).json({ error: 'AI reading is not configured on the server.' });
        return;
      }
      const { image } = req.body as { image?: string };
      if (!image || typeof image !== 'string') {
        res.status(400).json({ error: 'Expected an "image" data URL in the body.' });
        return;
      }
      const result = await readReceipt(
        { baseUrl: config.llmBaseUrl, apiKey: config.llmApiKey, model: config.visionModel || config.llmModel },
        image,
      );
      res.json(result);
    }),
  );

  // ---- Assistant ----
  app.post(
    '/api/assistant',
    ah(async (req, res) => {
      const { question, receipts: provided, history, currency } = req.body as {
        question?: string;
        receipts?: Receipt[];
        history?: ChatMessage[];
        currency?: string;
      };
      if (!question || typeof question !== 'string') {
        res.status(400).json({ error: 'Expected a "question" string.' });
        return;
      }
      if (!hasLlm()) {
        res.status(503).json({ error: 'The assistant is not configured on the server.' });
        return;
      }
      const receipts = provided && provided.length ? provided : await store.all();
      const context = dataContext(receipts, currency || '$');
      const content = await ask(
        { baseUrl: config.llmBaseUrl, apiKey: config.llmApiKey, model: config.llmModel },
        question,
        context,
        history ?? [],
      );
      res.json({ content });
    }),
  );

  // Convenience endpoint so a client can build a receipt object without knowing
  // the id format.
  app.get('/api/new-id', (_req, res) => {
    res.json({ id: uid() });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    res.status(500).json({ error: message });
  });

  return app;
}
