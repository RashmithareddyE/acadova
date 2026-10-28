const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
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

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (no Origin header) and the configured web clients.
      if (!origin || env.clientUrls.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Acadova API is running' });
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
