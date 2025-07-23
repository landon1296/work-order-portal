export function getStatusColor(status) {
    console.log("Status received in getStatusColor:", status);
  if (!status || typeof status !== 'string') return '#94a3b8';

  const normalized = status.toLowerCase();

  if (normalized.includes('pending parts')) return '#dc2626';     // red = highest priority
  if (normalized.includes('submitted for billing')) return '#facc15'; // yellow
  if (normalized.includes('in progress')) return '#10b981';       // green
  if (normalized.includes('assigned')) return '#2563eb';          // blue
  if (normalized.includes('completed')) return '#8b5cf6';
  return '#94a3b8'; // fallback gray
}
