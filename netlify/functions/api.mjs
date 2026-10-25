import serverless from 'serverless-http';

process.env.FINCOACH_HOSTED = 'true';
const { createApp } = await import('../../server/src/app.js');
const app = createApp();

export const handler = serverless(app);
