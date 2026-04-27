import cors from 'cors';
import express from 'express';
import { appConfig } from './config.js';
import { relayRouter } from './routes/relay.js';

const app = express();

app.use(cors({
  origin: appConfig.FRONTEND_ORIGIN
}));
app.use(express.json({ limit: '1mb' }));
app.use('/api', relayRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[Error Handler]:', message);
  res.status(500).json({ success: false, error: message });
});

app.listen(appConfig.PORT, () => {
  console.log(`z-vault-pro-v2 backend listening on ${appConfig.PORT}`);
});
