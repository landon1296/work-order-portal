require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { setupAuthRoutes } = require('./auth');
const { setupWorkOrderRoutes } = require('./workorders');
const notifyRoutes = require('./routes/notify');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS configuration
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for testing
    methods: ["GET", "POST"],
    credentials: false // Set to false when using wildcard origin
  }
});

// Make io available globally for use in other modules
global.io = io;

app.use(cors());
app.use(express.json());
app.use('/api/notify', notifyRoutes);

const mastersRoutes = require('./masters');
app.use('/api/masters', mastersRoutes);
// Auth routes: /login
setupAuthRoutes(app);
// Work order routes: /workorders
setupWorkOrderRoutes(app);

const alertsRoutes = require('./routes/alerts');
app.use('/api/alerts', alertsRoutes);

const partsRoutes = require('./routes/parts');
app.use('/api/parts', partsRoutes);

const analyticsRoutes = require('./routes/analytics');
app.use('/api/analytics', analyticsRoutes);

const photosRoutes = require('./routes/photos');
app.use('/api/photos', photosRoutes);

const troubleshootRoutes = require('./routes/troubleshoot');
app.use('/api/troubleshoot', troubleshootRoutes);

const notificationsRoutes = require('./routes/notifications');
app.use('/api/notifications', notificationsRoutes);

const schedulerRoutes = require('./routes/scheduler-new');
app.use('/api/scheduler', schedulerRoutes);

const callLogsRoutes = require('./routes/calllogs');
app.use('/api/calllogs', callLogsRoutes);

const callLogNotesRoutes = require('./routes/calllognotes');
app.use('/api/calllognotes', callLogNotesRoutes);

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Join user to work order room for real-time updates
  socket.on('join-workorder', (workOrderNo) => {
    socket.join(`workorder-${workOrderNo}`);
    console.log(`User ${socket.id} joined workorder-${workOrderNo}`);
  });

  // Leave work order room
  socket.on('leave-workorder', (workOrderNo) => {
    socket.leave(`workorder-${workOrderNo}`);
    console.log(`User ${socket.id} left workorder-${workOrderNo}`);
  });

  // Join user to general updates room
  socket.on('join-updates', () => {
    socket.join('general-updates');
    console.log(`User ${socket.id} joined general updates`);
  });

  // Handle user authentication for WebSocket
  socket.on('authenticate', (token) => {
    try {
      // For now, just store the token - you can add JWT verification here
      socket.userToken = token;
      console.log(`User ${socket.id} authenticated`);
    } catch (error) {
      console.error('WebSocket authentication failed:', error);
      socket.disconnect();
    }
  });

  // Handle user activity tracking
  socket.on('user-activity', (data) => {
    console.log(`User activity: ${data.userName} (${data.userRole}) is ${data.activity} work order ${data.workOrderNo}`);
    
    // Broadcast to all clients in the same work order room
    socket.to(`workorder-${data.workOrderNo}`).emit('user-activity', data);
    
    // Also broadcast to general updates room for dashboard updates
    socket.to('general-updates').emit('user-activity', data);
  });

  // Handle user leaving work order
  socket.on('user-left', (data) => {
    console.log(`User left: User left work order ${data.workOrderNo}`);
    
    // Broadcast to all clients in the same work order room
    socket.to(`workorder-${data.workOrderNo}`).emit('user-left', data);
    
    // Also broadcast to general updates room for dashboard updates
    socket.to('general-updates').emit('user-left', data);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Export io for use in other modules
module.exports = { io };

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
  console.log(`WebSocket server ready for connections`);
});
