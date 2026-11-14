import { createApp } from './app.js';
import { config, hasLlm } from './config.js';

const app = createApp();

app.listen(config.port, config.host, () => {
  const where = `http://${config.host}:${config.port}`;
  console.log(`Lumen backend listening on ${where}`);
  console.log(`  AI reading: ${hasLlm() ? `enabled (${config.visionModel || config.llmModel})` : 'disabled — set LLM_BASE_URL and LLM_API_KEY'}`);
  console.log(`  Data file:  ${config.dataFile}`);
});
