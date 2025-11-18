// WebSocket utility functions for broadcasting real-time updates
// We'll get the io instance from the global variable set in server.js

class WebSocketBroadcaster {
  // Broadcast work order updates to all connected clients
  static broadcastWorkOrderUpdate(workOrderNo, updateType, data) {
    console.log(`Broadcasting ${updateType} for work order ${workOrderNo}`);
    
    const broadcastData = {
      workOrderNo,
      updateType, // 'updated', 'created', 'deleted', 'parts-added', 'parts-updated', 'part-status-updated'
      data,
      timestamp: new Date().toISOString()
    };

    // Get the io instance from global variable
    const io = global.io;
    if (!io) {
      console.warn('WebSocket io instance not available');
      return;
    }

    // Broadcast to all clients
    io.emit('workorder-update', broadcastData);
    console.log(`✅ Broadcasted workorder-update to ${io.sockets.sockets.size} clients`);

    // Send to specific work order room
    io.to(`workorder-${workOrderNo}`).emit('workorder-update', broadcastData);

    // Send to general updates room for dashboard refreshes
    io.to('general-updates').emit('workorder-update', broadcastData);
  }

  // Broadcast general data refresh to all clients
  static broadcastDataRefresh(dataType) {
    console.log(`Broadcasting data refresh for ${dataType}`);
    
    const broadcastData = {
      dataType, // 'workorders', 'analytics', 'alerts', etc.
      timestamp: new Date().toISOString()
    };
    
    const io = global.io;
    if (!io) {
      console.warn('WebSocket io instance not available');
      return;
    }
    
    io.emit('data-refresh', broadcastData);
  }

  // Broadcast notification to specific user
  static broadcastNotification(userId, notification) {
    console.log(`Broadcasting notification to user ${userId}`);
    
    const broadcastData = {
      userId,
      notification,
      timestamp: new Date().toISOString()
    };
    
    const io = global.io;
    if (!io) {
      console.warn('WebSocket io instance not available');
      return;
    }
    
    io.emit('notification', broadcastData);
  }

  // Broadcast alert to all users
  static broadcastAlert(alert) {
    console.log(`Broadcasting alert to all users`);
    
    const broadcastData = {
      alert,
      timestamp: new Date().toISOString()
    };
    
    const io = global.io;
    if (!io) {
      console.warn('WebSocket io instance not available');
      return;
    }
    
    io.emit('alert', broadcastData);
  }

  // Get connected clients count
  static getConnectedClientsCount() {
    const io = global.io;
    if (!io) {
      return 0;
    }
    return io.sockets.sockets.size;
  }

  // Get clients in specific room
  static getClientsInRoom(roomName) {
    const io = global.io;
    if (!io) {
      return 0;
    }
    const room = io.sockets.adapter.rooms.get(roomName);
    return room ? room.size : 0;
  }

  // Broadcast work order creation
  static broadcastWorkOrderCreated(workOrder) {
    this.broadcastWorkOrderUpdate(workOrder.workOrderNo, 'created', workOrder);
  }

  // Broadcast work order update - only send changed fields, not full work order object
  static broadcastWorkOrderUpdated(workOrderNo, updatedFields) {
    console.log('WebSocketBroadcaster: Broadcasting work order update for', workOrderNo);
    console.log('WebSocketBroadcaster: Changed fields:', Object.keys(updatedFields || {}));
    
    // Only send the changed fields, not the full work order object
    // This reduces egress usage significantly
    // The data structure matches what frontend expects: { workOrderNo, updateType, data: { ...updatedFields }, timestamp }
    this.broadcastWorkOrderUpdate(workOrderNo, 'updated', updatedFields || {});
  }

  // Broadcast parts update
  static broadcastPartsUpdated(workOrderNo, parts) {
    this.broadcastWorkOrderUpdate(workOrderNo, 'parts-updated', { parts });
  }

  // Broadcast part status update
  static broadcastPartStatusUpdated(workOrderNo, partId, action, estimatedDeliveryDate) {
    this.broadcastWorkOrderUpdate(workOrderNo, 'part-status-updated', {
      partId,
      action,
      estimatedDeliveryDate
    });
  }
}

module.exports = WebSocketBroadcaster;
