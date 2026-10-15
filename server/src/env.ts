import 'dotenv/config';
import { z } from 'zod';

// All settings come from environment variables (a .env file locally); see .env.example
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(4000),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  // Encrypts the API keys saved in Admin → Settings. Set it once and keep it: changing it makes them unreadable.
  // Without it, JWT_SECRET is used (then changing JWT_SECRET has the same effect).
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters').optional(),
  // Where the website runs, for CORS (comma-separated)
  WEB_ORIGIN: z.string().default('http://localhost:5174'),
  // The website's address in emails (links to reset a password, the account page...). Defaults to the first WEB_ORIGIN.
  PUBLIC_URL: z.string().url().optional(),
  // The first account registered with this email becomes the admin
  ADMIN_EMAIL: z.string().email().optional(),
  // Optional starting values for Admin → Settings (a value saved there wins)
  GROQ_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  OFFLINE_PAYMENT_INFO: z.string().optional(),
  // Optional: the built website (apps/web/dist) to serve from this server, for a one-server setup
  WEB_DIST: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
});

export const env = schema.parse(process.env);
export const publicUrl = (env.PUBLIC_URL ?? env.WEB_ORIGIN.split(',')[0].trim()).replace(/\/+$/, '');
export type Env = typeof env;
