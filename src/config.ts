import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  port: number;
  host: string;
  pollIntervalMs: number;
  customLockfilePath?: string;
  corsOrigin: string;
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3589', 10),
  host: process.env.HOST || '0.0.0.0',
  pollIntervalMs: parseInt(process.env.LCU_POLL_INTERVAL_MS || '2500', 10),
  customLockfilePath: process.env.LOL_LOCKFILE_PATH || undefined,
  corsOrigin: process.env.CORS_ORIGIN || '*',
};
