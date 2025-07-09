// This simple module stores work orders in memory.
// For demo/dev, you can swap this for a real database later.
let workOrders = [];

function getAll() {
  return workOrders;
}

function add(order) {
  order.id = Date.now(); // crude unique ID
  workOrders.push(order);
  return order;
}

function updateStatus(id, status) {
  const order = workOrders.find(w => w.id === id);
  if (order) order.status = status;
  return order;
}

function getById(id) {
  return workOrders.find(w => w.id === id);
}

module.exports = { getAll, add, updateStatus, getById };
