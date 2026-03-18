import serverless from 'serverless-http';
import app from './index';
import { updateConfig } from './config';

const handler = serverless(app);

export default {
  async fetch(request: Request, env: any, ctx: any) {
    // Update config with environment variables from Cloudflare
    updateConfig(env);
    
    // Pass request to our Express app
    return handler(request, ctx);
  }
};
