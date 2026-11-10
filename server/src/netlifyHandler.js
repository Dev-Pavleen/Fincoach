import serverless from 'serverless-http';
import { createApp } from './app.js';

process.env.FINCOACH_HOSTED = 'true';

export const handler = serverless(createApp());
