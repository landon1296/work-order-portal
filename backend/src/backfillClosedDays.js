const fs = require('fs');
const path = require('path');

const workOrdersPath = path.join(__dirname, 'workorders.json'); // adjust path if needed

const msInDay = 24 * 60 * 60 * 1000;
const data = JSON.parse(fs.readFileSync(workOrdersPath, 'utf8'));
let changed = false;

data.forEach(wo => {
  // Only fill if status is closed and closedDays is missing or invalid
  if (
    wo.status &&
    wo.status.toLowerCase().includes('closed') &&
    (!wo.closedDays || wo.closedDays < 0)
  ) {
    const closedDate = wo.statusHistory
      ? (wo.statusHistory.find(s => s.status && s.status.toLowerCase().includes('closed'))?.date)
      : null;
    const createdAt = wo.createdAt ? new Date(wo.createdAt) : null;
    if (createdAt && closedDate) {
      const closedDateObj = new Date(closedDate);
      const days = (closedDateObj - createdAt) / msInDay;
      wo.closedDays = Number(days.toFixed(2));
      changed = true;
    }
  }
});

if (changed) {
  fs.writeFileSync(workOrdersPath, JSON.stringify(data, null, 2), 'utf8');
  console.log('Updated closedDays for closed work orders!');
} else {
  console.log('No closed work orders to update.');
}
