require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { setupAuthRoutes } = require('./auth');
const { setupWorkOrderRoutes } = require('./workorders');
const notifyRoutes = require('./routes/notify');


const app = express();
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


const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
