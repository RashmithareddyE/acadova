const env = require('./config/env');
const app = require('./app');
const connectDB = require('./config/db');
const mongoose = require('mongoose');

async function start() {
  const server = app.listen(env.port, () => {
    console.log(`Acadova API listening on port ${env.port} (${env.nodeEnv})`);
  });

  try {
    await connectDB();
  } catch (err) {
    console.error(`Could not connect to MongoDB at ${env.mongoUri}: ${err.message}`);
    console.log('Background reconnection scheduled every 5s...');
    const retryInterval = setInterval(async () => {
      try {
        await connectDB();
        clearInterval(retryInterval);
      } catch {
        // continue waiting
      }
    }, 5000);
    retryInterval.unref();
  }

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await mongoose.connection.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
