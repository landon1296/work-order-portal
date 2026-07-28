import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Cutover notice: this app is being retired in favor of the v2 portal.
// Shown on every arrival at a dashboard until v1 is blocked outright, at
// which point this component (and its one line in App.jsx) can be deleted.

const V2_PORTAL_URL = 'https://glportal.landonperzee.com';

const LANDON_PHONE_HREF = '+18159541453';
const LANDON_PHONE_DISPLAY = '(815) 954-1453';
const LANDON_EMAIL = 'landon@greatlakeslifting.com';

// Dismissing only buys quiet for this long. Someone parked on a dashboard
// all afternoon gets asked again rather than dismissing once and forgetting.
const NAG_INTERVAL_MS = 15 * 60 * 1000;

// Kathy and Dan keep working here past August 1 until v2 replaces the tools
// they still need. Matched on username, not role -- Kathy is also a manager,
// and Danny and Will (manager,sales) are different people from Dan (sales).
// They get the same link but no deadline and no nagging: pushing someone to
// leave an app they are not allowed to leave yet is pure friction.
const STAYING_ON_V1 = ['kathy', 'dan'];

// Resets on page load, which in v1 is the same thing as a fresh login --
// the session lives in React state only, so a refresh logs you out.
let shownThisSession = false;

// Dashboard landing pages. Exact matches only, so backing out of a work
// order (/dashboard/workorder/123 -> /dashboard) re-triggers the notice.
const DASHBOARD_PATHS = [
  '/dashboard',
  '/tech-dashboard',
  '/reception-dashboard',
  '/sales-dashboard',
];

// v1 logs people in by first name; v2 logs them in by email. Mapping the
// two here lets the button hand v2 a prefilled email field, so the only
// thing left to type is the password — which is unchanged from this app.
// Anyone not listed gets a plain login link.
const EMAIL_BY_USERNAME = {
  dan: 'dang@greatlakeslifting.com', // not danny@ — the one that breaks the pattern
  danny: 'danny@greatlakeslifting.com',
  david: 'david@greatlakeslifting.com',
  don: 'don@greatlakeslifting.com',
  jenny: 'jenny@greatlakeslifting.com',
  joe: 'joe@greatlakeslifting.com',
  justin: 'justin@greatlakeslifting.com',
  kathy: 'kathy@greatlakeslifting.com',
  kirby: 'kirby@greatlakeslifting.com',
  landon: 'landon@greatlakeslifting.com',
  matt: 'matt@greatlakeslifting.com',
  ray: 'ray@greatlakeslifting.com',
  ron: 'ron@greatlakeslifting.com',
  steven: 'steven@greatlakeslifting.com',
  will: 'will@greatlakeslifting.com',
  zack: 'zack@greatlakeslifting.com',
};

function buildPortalUrl(user) {
  const email = EMAIL_BY_USERNAME[(user?.username || '').trim().toLowerCase()];
  if (!email) return `${V2_PORTAL_URL}/login`;
  return `${V2_PORTAL_URL}/login?email=${encodeURIComponent(email)}`;
}

const V2MigrationModal = ({ user }) => {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const onDashboard = Boolean(user) && DASHBOARD_PATHS.includes(location.pathname);
  const staying = STAYING_ON_V1.includes((user?.username || '').trim().toLowerCase());

  // Re-opens on every arrival at a dashboard; dismissing only lasts until
  // they navigate away and come back. Kathy and Dan see it once per login.
  useEffect(() => {
    if (!onDashboard) {
      setOpen(false);
      return;
    }
    if (staying) {
      if (shownThisSession) return;
      shownThisSession = true;
    }
    setOpen(true);
  }, [location.pathname, user]);

  // ...and if they never navigate at all, bring it back on a timer. The
  // timer only runs while dismissed on a dashboard, and resets each time
  // they dismiss it again. Skipped for the people staying here.
  useEffect(() => {
    if (staying || !onDashboard || open) return undefined;
    const timer = setTimeout(() => setOpen(true), NAG_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [staying, onDashboard, open]);

  if (!open) return null;

  const portalUrl = buildPortalUrl(user);
  const knownEmail = portalUrl.includes('?email=');

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '16px',
        zIndex: 2000,
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          padding: '28px',
          borderRadius: '12px',
          maxWidth: '520px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.25)',
          fontFamily: 'Inter, Arial, sans-serif',
          boxSizing: 'border-box',
        }}
      >
        <h2
          style={{
            margin: '0 0 14px 0',
            color: '#1f2937',
            fontSize: '24px',
            fontWeight: 600,
            lineHeight: 1.25,
          }}
        >
          {staying ? 'Work orders have moved' : 'This app has been redesigned'}
        </h2>

        <p
          style={{
            margin: '0 0 16px 0',
            color: '#4b5563',
            fontSize: '16px',
            lineHeight: 1.55,
          }}
        >
          {staying ? (
            <>
              Work orders now live in the new portal &mdash; same jobs, same
              history. Keep using this app for everything else; Landon will
              tell you before any of that moves.
            </>
          ) : (
            <>
              The work order portal has moved. Everything you do here now lives
              in the new portal &mdash; same work orders, same history.
            </>
          )}
        </p>

        {!staying && (
          <div
            style={{
              padding: '12px 16px',
              background: '#fffbeb',
              border: '1px solid #fcd34d',
              borderRadius: '8px',
              color: '#92400e',
              fontSize: '16px',
              fontWeight: 600,
              lineHeight: 1.45,
              marginBottom: '22px',
            }}
          >
            This app stops working August 1.
          </div>
        )}

        <a
          href={portalUrl}
          style={{
            display: 'block',
            padding: '14px 24px',
            background: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '17px',
            fontWeight: 600,
            textAlign: 'center',
            textDecoration: 'none',
            marginBottom: '18px',
          }}
        >
          Open the new portal &rarr;
        </a>

        <p
          style={{
            margin: '0 0 18px 0',
            color: '#4b5563',
            fontSize: '15px',
            lineHeight: 1.55,
          }}
        >
          {knownEmail
            ? 'Your email is already filled in. '
            : 'Log in with your work email. '}
          <strong style={{ color: '#1f2937' }}>
            Your password is the same one you use here.
          </strong>
        </p>

        <div
          style={{
            padding: '14px 16px',
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            color: '#4b5563',
            fontSize: '14px',
            lineHeight: 1.6,
            marginBottom: '20px',
          }}
        >
          Forgot your password? Use <strong>Forgot password?</strong> on the
          login page &mdash; or get ahold of me:
          <div style={{ marginTop: '8px' }}>
            <a
              href={`tel:${LANDON_PHONE_HREF}`}
              style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}
            >
              {LANDON_PHONE_DISPLAY}
            </a>
            <span style={{ color: '#9ca3af' }}> &middot; text or call </span>
          </div>
          <div>
            <a
              href={`mailto:${LANDON_EMAIL}`}
              style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}
            >
              {LANDON_EMAIL}
            </a>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              color: '#6b7280',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: 500,
            }}
          >
            {staying ? 'Got it' : 'Not right now'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default V2MigrationModal;
