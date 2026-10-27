import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'express-async-errors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import winston from 'winston';

// Load environment variables
dotenv.config();

// Import routes (we'll create these)
// import authRoutes from './routes/authRoutes.js';
// import uploadRoutes from './routes/uploadRoutes.js';
// import projectRoutes from './routes/projectRoutes.js';
// import processingRoutes from './routes/processingRoutes.js';

// Logger configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { service: 'naat-app-backend' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }),
  );
}

// Initialize Express app
const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || 'http://localhost:3000',
    credentials: true,
  },
  pingInterval: parseInt(process.env.SOCKET_IO_PING_INTERVAL, 10) || 25000,
  pingTimeout: parseInt(process.env.SOCKET_IO_PING_TIMEOUT, 10) || 60000,
});

// ==================== MIDDLEWARE ====================

// Security middleware
app.use(helmet());

// CORS middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') || 'http://localhost:3000',
    credentials: true,
  }),
);

// Body parser middleware
app.use(express.json({ limit: process.env.MAX_REQUEST_SIZE || '500mb' }));
app.use(express.urlencoded({ limit: process.env.MAX_REQUEST_SIZE || '500mb', extended: true }));

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// ==================== ROUTES ====================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API routes (to be implemented)
// app.use('/api/auth', authRoutes);
// app.use('/api/upload', uploadRoutes);
// app.use('/api/projects', projectRoutes);
// app.use('/api/process', processingRoutes);

// API root endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'Naat-App API v1.0.0',
    version: '1.0.0',
    status: 'running',
  });
});

// ==================== 404 HANDLER ====================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path,
  });
});

// ==================== ERROR HANDLER ====================

app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ==================== SOCKET.IO EVENTS ====================

io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });

  socket.on('processing:start', (data) => {
    logger.info(`Processing started: ${data.projectId}`);
    io.emit('processing:status', { projectId: data.projectId, status: 'started' });
  });

  socket.on('processing:cancel', (data) => {
    logger.info(`Processing cancelled: ${data.projectId}`);
    io.emit('processing:status', { projectId: data.projectId, status: 'cancelled' });
  });
});

// Export io for use in routes
app.set('io', io);

// ==================== SERVER STARTUP ====================

const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  logger.info(`🎵 Naat-App Backend Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
  logger.info(`Database: ${process.env.MONGODB_URI}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

export default app;
