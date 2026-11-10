import serverless from 'serverless-http';
import { createApp } from '../../server/src/app.js';

process.env.FINCOACH_HOSTED = 'true';
const app = createApp();

export const handler = serverless(app);
