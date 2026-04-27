import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  PORT: z.coerce.number().default(8787),
  FRONTEND_ORIGIN: z.string().url(),
  DATABASE_PATH: z.string().min(1),
  NETWORK: z.enum(['mainnet', 'nile']).default('mainnet'),
  ENERGY_PROVIDER_MODE: z.enum(['mock', 'netts']).default('mock'),
  TRONGRID_RPC_URL: z.string().url(),
  TRONGRID_API_KEY: z.string().optional().default(''),
  NETTS_API_URL: z.string().url(),
  NETTS_API_KEY: z.string().optional().default(''),
  NETTS_REAL_IP: z.string().optional().default(''),
  RELAYER_PRIVATE_KEY: z.string().min(64),
  RELAYER_ADDRESS: z.string().min(34),
  RELAYER_CONTRACT: z.string().min(34),
  USDT_CONTRACT: z.string().min(34),
  TREASURY_ADDRESS: z.string().min(34),
  PLATFORM_FEE_USDT: z.coerce.number().default(1),
  FIRST_SEND_FEE_USDT: z.coerce.number().default(3),
  RELAYER_TRX_BUFFER: z.coerce.number().default(10)
}).superRefine((env, ctx) => {
  if (env.ENERGY_PROVIDER_MODE === 'netts' && !env.NETTS_API_KEY) {
    ctx.addIssue({
      code: 'custom',
      path: ['NETTS_API_KEY'],
      message: 'NETTS_API_KEY is required when ENERGY_PROVIDER_MODE=netts'
    });
  }
  if (env.ENERGY_PROVIDER_MODE === 'netts' && !env.NETTS_REAL_IP) {
    ctx.addIssue({
      code: 'custom',
      path: ['NETTS_REAL_IP'],
      message: 'NETTS_REAL_IP is required when ENERGY_PROVIDER_MODE=netts'
    });
  }
});

export const appConfig = envSchema.parse(process.env);
