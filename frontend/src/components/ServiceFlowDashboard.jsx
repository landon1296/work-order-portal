import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import { getStatusColor } from '../utils/statusColors';
import API from '../api';
import LoadingSpinner from './LoadingSpinner';
import { SchedulePickupModal } from './SchedulerDashboard';
import AssignWorkOrderForm from './AssignWorkOrderForm';

const SHIPPED_STORAGE_KEY = 'glls_service_flow_shipped';
const READY_TO_SHIP_CUTOFF_KEY = 'glls_service_flow_ready_to_ship_cutoff';
const SHIPPED_VISIBLE_MS = 24 * 60 * 60 * 1000; // 24 hours
const WORK_ORDER_PAGE_SIZE = 200;

function getReadyToShipCutoff() {
  try {
    let cutoff = localStorage.getItem(READY_TO_SHIP_CUTOFF_KEY);
    if (!cutoff) {
      const now = new Date();
      cutoff = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      localStorage.setItem(READY_TO_SHIP_CUTOFF_KEY, cutoff);
    }
    return cutoff;
  } catch {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
}

function getClosedDate(order) {
  const history = order?.statusHistory ?? order?.status_history;
  if (!Array.isArray(history)) return null;
  const closedEntry = [...history].reverse().find(
    (entry) => (entry?.status || '').toLowerCase() === 'closed'
  );
  if (!closedEntry?.date) return null;
  const d = new Date(closedEntry.date);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const COLUMNS = [
  { id: 'incoming', title: 'Incoming' },
  { id: 'inProgress', title: 'In Progress' },
  { id: 'pendingParts', title: 'Pending Parts' },
  { id: 'pendingReview', title: 'Pending Review' },
  { id: 'waitingForPayment', title: 'Waiting for Payment' },
  { id: 'readyToShip', title: 'Ready to Ship' },
  { id: 'shipped', title: 'Shipped' },
];

function getShippedFromStorage() {
  try {
    const raw = localStorage.getItem(SHIPPED_STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    const now = Date.now();
    const filtered = {};
    for (const [woNo, iso] of Object.entries(data)) {
      const ts = new Date(iso).getTime();
      if (now - ts < SHIPPED_VISIBLE_MS) filtered[woNo] = iso;
    }
    return filtered;
  } catch {
    return {};
  }
}

function setShippedInStorage(workOrderNo) {
  try {
    const data = getShippedFromStorage();
    data[workOrderNo] = new Date().toISOString();
    localStorage.setItem(SHIPPED_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save shipped state', e);
  }
}

function normalizeOrder(order) {
  const no = order.work_order_no ?? order.workOrderNo;
  const status = order.status ?? '';
  const history = order.status_history ?? order.statusHistory;
  const parsedHistory = Array.isArray(history)
    ? history
    : typeof history === 'string'
    ? (() => {
        try {
          return JSON.parse(history) || [];
        } catch {
          return [];
        }
      })()
    : [];
  return {
    ...order,
    workOrderNo: no,
    id: order.id,
    status,
    statusHistory: parsedHistory,
    company_name: order.company_name ?? order.companyName,
    make: order.make,
    model: order.model,
    serial_number: order.serial_number ?? order.serialNumber,
  };
}

function getColumnForStatus(order, shippedSet, readyToShipCutoff) {
  const no = order?.workOrderNo ?? order?.work_order_no;
  const status = order?.status ?? '';
  const s = (status || '').toLowerCase();
  if (s === 'closed') {
    const closedDate = getClosedDate(order);
    if (!closedDate || (readyToShipCutoff && closedDate < readyToShipCutoff)) return null;
    if (no && shippedSet.has(String(no))) return 'shipped';
    return 'readyToShip';
  }
  if (no && shippedSet.has(String(no))) return 'shipped';
  if (s.includes('in progress') && s.includes('pending parts')) return 'pendingParts';
  if (s.includes('in progress')) return 'inProgress';
  if (s === 'assigned') return 'inProgress';
  if (s.includes('completed') && s.includes('pending approval')) return 'pendingReview';
  if (s.includes('submitted for billing')) return 'waitingForPayment';
  if (s.includes('customer invoiced')) return 'waitingForPayment';
  return 'inProgress';
}

function getStatusForColumn(columnId) {
  switch (columnId) {
    case 'inProgress':
      return 'In Progress';
    case 'pendingParts':
      return 'In Progress, Pending Parts (Ordered)';
    case 'pendingReview':
      return 'Completed, Pending Approval';
    case 'waitingForPayment':
      return 'Submitted for Billing';
    case 'readyToShip':
      return 'Closed';
    default:
      return null;
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

// Presentational work order card (used in overlay and in column)
function WorkOrderCardContent({ order, isOverlay, onView }) {
  const normalized = normalizeOrder(order);
  const color = getStatusColor(normalized.status);
  const workOrderNo = normalized.workOrderNo ?? order?.work_order_no;
  return (
    <div
      style={{
        borderLeft: `4px solid ${color}`,
        background: '#fff',
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 8,
        boxShadow: isOverlay ? '0 8px 24px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.1)',
        cursor: isOverlay ? 'grabbing' : 'grab',
        minWidth: 160,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 6 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>WO #{workOrderNo}</div>
        {onView && workOrderNo && (
          <button
            type="button"
            onPointerDown={(e) => { e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onView(order); }}
            style={{
              padding: '2px 6px',
              fontSize: 10,
              lineHeight: 1.2,
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 3,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            View
          </button>
        )}
      </div>
      <div style={{ fontSize: 12, color: '#374151' }}>
        {normalized.company_name || '—'}
      </div>
      {(normalized.make || normalized.model) && (
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
          {[normalized.make, normalized.model].filter(Boolean).join(' ')}
        </div>
      )}
      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
        {normalized.status}
      </div>
    </div>
  );
}

// Draggable work order card (uses useDraggable)
function WorkOrderCard({ order, isOverlay, onView }) {
  const normalized = normalizeOrder(order);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `wo-${normalized.workOrderNo}`,
    data: { type: 'workorder', order: normalized },
  });

  if (isOverlay) {
    return <WorkOrderCardContent order={order} isOverlay onView={onView} />;
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      <WorkOrderCardContent order={order} isOverlay={false} onView={onView} />
    </div>
  );
}

// Scheduler (incoming) card - not draggable between columns in v1
function SchedulerCard({ item, onCompleteAndAssign }) {
  const company = item.company_name ?? item.companyName;
  const po = item.po_number ?? item.poNumber;
  const pickup = item.pickup_date ?? item.pickupDate;
  const make = item.make;
  const model = item.model;

  return (
    <div
      style={{
        borderLeft: '4px solid #6366f1',
        background: '#f5f3ff',
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 8,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        minWidth: 160,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{company || '—'}</div>
      {po && <div style={{ fontSize: 12, color: '#374151' }}>PO: {po}</div>}
      {pickup && (
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
          Pickup: {formatDate(pickup)}
        </div>
      )}
      {(make || model) && (
        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
          {[make, model].filter(Boolean).join(' ')}
        </div>
      )}
      {onCompleteAndAssign && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCompleteAndAssign(item); }}
          style={{
            marginTop: 8,
            padding: '4px 8px',
            fontSize: 10,
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Complete & Assign
        </button>
      )}
    </div>
  );
}

function Column({ id, title, children, isDropTarget }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { columnId: id } });

  return (
    <div
      ref={setNodeRef}
      style={{
        minWidth: 200,
        maxWidth: 220,
        background: isOver ? '#eff6ff' : '#f9fafb',
        borderRadius: 10,
        padding: 12,
        border: isDropTarget ? '2px dashed #2563eb' : '1px solid #e5e7eb',
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: 13,
          marginBottom: 12,
          color: '#111827',
          textAlign: 'center',
        }}
      >
        {title}
      </div>
      <div style={{ minHeight: 40 }}>{children}</div>
    </div>
  );
}

export default function ServiceFlowDashboard({ user }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [workOrders, setWorkOrders] = useState([]);
  const [scheduler, setScheduler] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shippedMap, setShippedMap] = useState(getShippedFromStorage);
  const [activeId, setActiveId] = useState(null);
  const [flyAwayKey, setFlyAwayKey] = useState(null);
  const [showSchedulerForm, setShowSchedulerForm] = useState(false);
  const [assignWorkOrderOpen, setAssignWorkOrderOpen] = useState(false);
  const [prefilledWorkOrderData, setPrefilledWorkOrderData] = useState(null);

  const token = user?.token;

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [woRes, schedRes] = await Promise.all([
        API.get(`/workorders?limit=${WORK_ORDER_PAGE_SIZE}&offset=0&includeClosed=true`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        API.get('/api/scheduler', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setWorkOrders(woRes.data?.rows ?? []);
      setScheduler(Array.isArray(schedRes.data) ? schedRes.data : []);
    } catch (err) {
      console.error(err);
      setError('Failed to load data. Please refresh the page.');
      setWorkOrders([]);
      setScheduler([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Prune shipped entries older than 24h when we read
  useEffect(() => {
    setShippedMap(getShippedFromStorage());
  }, [workOrders]);

  const shippedSet = useMemo(() => new Set(Object.keys(shippedMap)), [shippedMap]);
  const readyToShipCutoff = useMemo(() => getReadyToShipCutoff(), []);

  const bucketed = useMemo(() => {
    const buckets = {};
    COLUMNS.forEach((c) => {
      buckets[c.id] = [];
    });
    const unassignedScheduler = scheduler.filter((item) => {
      const status = item.status ?? item.Status ?? 'Scheduled';
      return String(status) !== 'Completed';
    });
    unassignedScheduler.forEach((item) => {
      buckets.incoming.push({ type: 'scheduler', item });
    });
    buckets.incoming.sort((a, b) => {
      const dateStrA = a.item.pickup_date ?? a.item.pickupDate ?? '';
      const dateStrB = b.item.pickup_date ?? b.item.pickupDate ?? '';
      const dateA = dateStrA ? new Date(dateStrA) : null;
      const dateB = dateStrB ? new Date(dateStrB) : null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const pastA = dateA && !isNaN(dateA.getTime()) && dateA < today;
      const pastB = dateB && !isNaN(dateB.getTime()) && dateB < today;
      if (pastA && !pastB) return -1;
      if (!pastA && pastB) return 1;
      const timeA = dateA && !isNaN(dateA.getTime()) ? dateA.getTime() : 0;
      const timeB = dateB && !isNaN(dateB.getTime()) ? dateB.getTime() : 0;
      return timeA - timeB;
    });
    workOrders.forEach((raw) => {
      const order = normalizeOrder(raw);
      const col = getColumnForStatus(order, shippedSet, readyToShipCutoff);
      if (!col) return;
      buckets[col] = buckets[col] || [];
      buckets[col].push({ type: 'workorder', order });
    });
    return buckets;
  }, [workOrders, scheduler, shippedSet, readyToShipCutoff]);

  const activeOrder = useMemo(() => {
    if (!activeId || !activeId.startsWith('wo-')) return null;
    const no = activeId.replace('wo-', '');
    for (const col of COLUMNS) {
      const list = bucketed[col.id] || [];
      const found = list.find((x) => x.type === 'workorder' && x.order.workOrderNo === no);
      if (found) return found.order;
    }
    return null;
  }, [activeId, bucketed]);

  const handleDragStart = useCallback((ev) => {
    setActiveId(ev.active.id);
  }, []);

  const handleDragEnd = useCallback(
    async (ev) => {
      const { active, over } = ev;
      setActiveId(null);

      if (!over || !active?.data?.current) return;
      const { type, order } = active.data.current;
      if (type !== 'workorder' || !order) return;

      const targetColumnId = over.data?.current?.columnId;
      if (!targetColumnId) return;

      const currentCol = getColumnForStatus(order, shippedSet, readyToShipCutoff);

      if (targetColumnId === 'shipped') {
        if (currentCol !== 'readyToShip') return;
        setFlyAwayKey(order.workOrderNo);
        setShippedInStorage(order.workOrderNo);
        setShippedMap(getShippedFromStorage());
        setTimeout(() => setFlyAwayKey(null), 800);
        return;
      }

      const newStatus = getStatusForColumn(targetColumnId);
      if (!newStatus) return;
      if (targetColumnId === currentCol) return;

      const statusHistory = Array.isArray(order.statusHistory) ? [...order.statusHistory] : [];
      statusHistory.push({
        status: newStatus,
        date: new Date().toISOString(),
        updatedBy: user?.username || user?.name || 'System',
      });

      try {
        if (targetColumnId === 'readyToShip') {
          await API.put(`/workorders/close/${order.id}`, {}, {
            headers: { Authorization: `Bearer ${token}` },
          });
        } else {
          await API.put(
            `/workorders/${order.workOrderNo}`,
            { status: newStatus, statusHistory },
            { headers: { Authorization: `Bearer ${token}` } }
          );
        }
        fetchData();
      } catch (err) {
        console.error(err);
        setError('Failed to update status. Please try again.');
      }
    },
    [shippedSet, readyToShipCutoff, user, token, fetchData]
  );

  const handleSaveSchedulerForm = useCallback(
    async (formData) => {
      await API.post('/api/scheduler', formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setShowSchedulerForm(false);
      fetchData();
    },
    [token, fetchData]
  );

  const handleCompleteAndAssign = useCallback(
    async (pickupData) => {
      try {
        await API.patch(`/api/scheduler/${pickupData.id}/complete`, {}, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        console.error(err);
        alert('Failed to mark pickup as completed. Please try again.');
        return;
      }
      const workOrderData = {
        workOrderNo: `WO${Date.now()}`,
        companyName: pickupData.company_name || '',
        address: pickupData.address || '',
        city: pickupData.city || '',
        state: pickupData.state || '',
        zipcode: pickupData.zipcode || '',
        contactName: pickupData.contact_name || '',
        phoneNumber: pickupData.phone_number || '',
        email: pickupData.email || '',
        poNumber: pickupData.po_number || '',
        make: pickupData.make || '',
        model: pickupData.model || '',
        serialNumber: pickupData.serial_number || '',
        shop: pickupData.shop || '',
        workDescription: pickupData.notes || '',
        notes: '',
        status: 'Assigned',
        date: new Date().toISOString().split('T')[0],
      };
      setPrefilledWorkOrderData(workOrderData);
      setAssignWorkOrderOpen(true);
      fetchData();
    },
    [token, fetchData]
  );

  const handleWorkOrderAssignSuccess = useCallback(() => {
    setAssignWorkOrderOpen(false);
    setPrefilledWorkOrderData(null);
    fetchData();
  }, [fetchData]);

  const handleCardClick = useCallback(
    (order) => {
      const workOrderNo = order?.workOrderNo ?? order?.work_order_no;
      if (!workOrderNo) return;
      navigate(`/dashboard/workorder/${workOrderNo}`, {
        state: {
          from: location.pathname + location.search,
          dashboard: 'serviceflow',
        },
      });
    },
    [navigate, location.pathname, location.search]
  );

  if (loading) {
    return <LoadingSpinner message="Loading Service Flow..." />;
  }

  return (
    <div style={{ padding: '0 24px 24px', overflowX: 'auto' }}>
      {error && (
        <div
          style={{
            background: '#fef2f2',
            color: '#b91c1c',
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          {error}
          <button
            type="button"
            onClick={() => { setError(null); fetchData(); }}
            style={{ marginLeft: 12, padding: '4px 12px', cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      )}

      <DndContext
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          style={{
            display: 'flex',
            gap: 16,
            minHeight: 400,
            alignItems: 'flex-start',
          }}
        >
          {COLUMNS.map((col) => (
            <Column
              key={col.id}
              id={col.id}
              title={col.title}
              isDropTarget={col.id !== 'incoming'}
            >
              {(bucketed[col.id] || []).map((entry) => {
                if (entry.type === 'scheduler') {
                  return (
                    <SchedulerCard
                      key={`s-${entry.item.id}`}
                      item={entry.item}
                      onCompleteAndAssign={col.id === 'incoming' ? handleCompleteAndAssign : undefined}
                    />
                  );
                }
                const isFlying = flyAwayKey === entry.order.workOrderNo && col.id === 'shipped';
                return (
                  <div
                    key={`wo-${entry.order.workOrderNo}`}
                    style={{
                      animation: isFlying ? 'serviceFlowFlyAway 0.8s ease-out forwards' : undefined,
                    }}
                  >
                    <WorkOrderCard
                      order={entry.order}
                      isOverlay={false}
                      onView={handleCardClick}
                    />
                  </div>
                );
              })}
              {col.id === 'incoming' && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowSchedulerForm(true); }}
                  style={{
                    marginTop: 8,
                    width: '100%',
                    padding: '8px',
                    fontSize: 18,
                    fontWeight: 'bold',
                    background: '#e5e7eb',
                    color: '#374151',
                    border: '1px dashed #9ca3af',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                  title="Schedule new pickup"
                >
                  +
                </button>
              )}
            </Column>
          ))}
        </div>

        <DragOverlay>
          {activeOrder ? (
            <WorkOrderCardContent order={activeOrder} isOverlay onView={handleCardClick} />
          ) : null}
        </DragOverlay>
      </DndContext>

      <SchedulePickupModal
        isOpen={showSchedulerForm}
        onClose={() => setShowSchedulerForm(false)}
        onSave={handleSaveSchedulerForm}
        initialDate={null}
      />

      {assignWorkOrderOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: 8,
              width: '95%',
              maxWidth: '1200px',
              maxHeight: '95vh',
              overflow: 'auto',
              position: 'relative',
            }}
          >
            <button
              type="button"
              onClick={() => { setAssignWorkOrderOpen(false); setPrefilledWorkOrderData(null); }}
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: 30,
                height: 30,
                cursor: 'pointer',
                fontSize: 16,
                fontWeight: 'bold',
                zIndex: 1001,
              }}
            >
              ×
            </button>
            <AssignWorkOrderForm
              token={token}
              user={user}
              prefilledData={prefilledWorkOrderData}
              onSuccess={handleWorkOrderAssignSuccess}
            />
          </div>
        </div>
      )}

      <style>{`
        @keyframes serviceFlowFlyAway {
          0% { transform: scale(1); opacity: 1; }
          40% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
