const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const env = require('./config/env');
const authRoutes = require('./routes/authRoutes');
const academicRoutes = require('./routes/academicRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const importRoutes = require('./routes/importRoutes');
const studyPlannerRoutes = require('./routes/studyPlannerRoutes');
const organizerRoutes = require('./routes/organizerRoutes');
const copilotRoutes = require('./routes/copilotRoutes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');

const LOCAL_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (no Origin header) and local dev / configured web clients.
      if (!origin || LOCAL_ORIGIN_REGEX.test(origin) || env.clientUrls.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-File-Name', 'X-Requested-With', 'Accept'],
    exposedHeaders: ['Content-Disposition'],
  })
);
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => {
  const dbStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const state = dbStates[mongoose.connection.readyState] || 'unknown';
  res.json({
    success: true,
    message: 'Acadova API is running',
    database: state,
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/academic', academicRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/imports', importRoutes);
app.use('/api/study-planner', studyPlannerRoutes);
app.use('/api/tasks', organizerRoutes);
app.use('/api/copilot', copilotRoutes);

app.use('/api', notFound);
app.use(errorHandler);

module.exports = app;
