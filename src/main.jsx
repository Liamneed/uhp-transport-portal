import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  LayoutDashboard,
  UserRoundCog,
  WalletCards,
  Tags,
  BarChart3,
  CarFront,
  CalendarDays,
  AlertTriangle,
  Search,
  Bell,
  Plus,
  MoreHorizontal,
  CheckCircle2,
  Clock3,
  UsersRound,
  MapPin,
  Settings
} from 'lucide-react';
import './styles.css';

const API_BASE =
  import.meta.env.DEV
    ? 'http://localhost:3001'
    : '';

const MAP_TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL ||
  (
    import.meta.env.DEV
      ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
      : ''
  );

const MAP_TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_TILE_ATTRIBUTION ||
  '&copy; OpenStreetMap contributors';

const LIVE_BOOKING_REFRESH_MS = 10000;

async function apiFetch(
  input,
  options = {}
) {
  return window.fetch(
    input,
    {
      ...options,
      credentials: 'include'
    }
  );
}

const navDefinitions = {
  uhp_admin: [
    ['admin-dashboard', 'Dashboard', LayoutDashboard],
    ['book-transport', 'Book UHP Transport', CarFront],
    ['special-transport', 'Special Transport', CalendarDays],
    ['uhp-bookings', 'All Bookings', CalendarDays],
    ['admin-users', 'Users', UserRoundCog],
    ['admin-budgets', 'Budgets', WalletCards],
    ['admin-reasons', 'Reason Codes', Tags],
    ['admin-locations', 'Locations', MapPin],
    ['coding-review', 'Coding Review', AlertTriangle],
    ['admin-reports', 'Reports', BarChart3]
  ],

  booker: [
    ['booker-dashboard', 'Dashboard', LayoutDashboard],
    ['book-transport', 'Book UHP Transport', CarFront],
    ['special-transport', 'Special Transport', CalendarDays],
    ['my-bookings', 'My Bookings', CalendarDays]
  ],

  budget_holder: [
    ['holder-dashboard', 'Dashboard', LayoutDashboard],
    ['book-transport', 'Book UHP Transport', CarFront],
    ['special-transport', 'Special Transport', CalendarDays],
    ['holder-bookings', 'Bookings', CalendarDays],
    ['holder-invoices', 'Invoices', WalletCards],
    ['holder-reports', 'Reports', BarChart3]
  ],

  department_manager: [
    ['manager-dashboard', 'Dashboard', LayoutDashboard],
    ['special-transport', 'Special Transport', CalendarDays],
    ['manager-bookings', 'Bookings', CalendarDays],
    ['manager-reports', 'Reports', BarChart3]
  ],

  finance: [
    ['finance-dashboard', 'Dashboard', LayoutDashboard],
    ['finance-invoices', 'Invoices', WalletCards],
    ['finance-reports', 'Reports', BarChart3]
  ],

  special_transport_ops: [
    ['nac-christmas', 'Christmas Transport', CarFront]
  ],

  nac_controller: [
    ['nac-control', 'Control', LayoutDashboard],
    ['nac-special-transport', 'Special Transport', UsersRound],
    ['nac-bookings', 'Bookings', CalendarDays],
    ['nac-exceptions', 'Exceptions', AlertTriangle],
    ['nac-christmas', 'Christmas', CarFront]
  ],

  nac_admin: [
    ['nac-control', 'Control', LayoutDashboard],
    ['nac-special-transport', 'Special Transport', UsersRound],
    ['nac-special-transport-settings', 'Special Transport Settings', Settings],
    ['nac-bookings', 'Bookings', CalendarDays],
    ['nac-exceptions', 'Exceptions', AlertTriangle],
    ['coding-review', 'Coding Review', AlertTriangle],
    ['nac-christmas', 'Christmas', CarFront]
  ]
};

function navigationForUser(user) {
  const seen = new Set();
  const items = [];

  for (const role of user?.roles ?? []) {
    for (
      const item of
      navDefinitions[role.code] ?? []
    ) {
      const [key] = item;

      if (seen.has(key)) continue;

      seen.add(key);
      items.push(item);
    }
  }

  return items;
}

function initialsForUser(user) {
  const first =
    String(user?.firstName || '')
      .trim()
      .charAt(0);

  const last =
    String(user?.lastName || '')
      .trim()
      .charAt(0);

  return `${first}${last}`.toUpperCase() || 'U';
}

function roleSummary(user) {
  const names =
    (user?.roles ?? [])
      .map((role) => role.name)
      .filter(Boolean);

  return names.join(' · ') || 'Portal User';
}

function LoginPage({
  onAuthenticated
}) {
  const [step, setStep] =
    useState('email');

  const [email, setEmail] =
    useState('');

  const [challengeId, setChallengeId] =
    useState('');

  const [code, setCode] =
    useState('');

  const [sending, setSending] =
    useState(false);

  const [error, setError] =
    useState('');

  async function requestCode(event) {
    event.preventDefault();

    setSending(true);
    setError('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/auth/request-code`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              email
            })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Unable to send verification code'
        );
      }

      setChallengeId(
        data.challengeId
      );

      setEmail(data.email);
      setStep('code');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to sign in'
      );
    } finally {
      setSending(false);
    }
  }

  async function verifyCode(event) {
    event.preventDefault();

    setSending(true);
    setError('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/auth/verify-code`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              challengeId,
              code
            })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Unable to verify code'
        );
      }

      onAuthenticated(
        data.user
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to verify code'
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <div className="auth-brand">
          <strong>UHP</strong>
          <span>Transport Portal</span>
        </div>

        <div className="auth-card">
          <div className="auth-heading">
            <span className="auth-kicker">
              Secure access
            </span>

            <h1>
              {step === 'email'
                ? 'Sign in to the transport portal'
                : 'Enter your verification code'}
            </h1>

            <p>
              {step === 'email'
                ? 'Use the email address registered against your UHP Transport Portal account.'
                : `We sent a 6-digit sign-in code to ${email}.`}
            </p>
          </div>

          {error && (
            <div className="notice error">
              {error}
            </div>
          )}

          {step === 'email' ? (
            <form
              className="auth-form"
              onSubmit={requestCode}
            >
              <label>
                Email address

                <input
                  type="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(
                      event.target.value
                    )
                  }
                  placeholder="name@example.nhs.uk"
                  autoComplete="email"
                  required
                  autoFocus
                />
              </label>

              <button
                className="primary-button auth-submit"
                disabled={sending}
              >
                {sending
                  ? 'Sending...'
                  : 'Send verification code'}
              </button>
            </form>
          ) : (
            <form
              className="auth-form"
              onSubmit={verifyCode}
            >
              <label>
                6-digit verification code

                <input
                  className="auth-code-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength="6"
                  pattern="[0-9]{6}"
                  value={code}
                  onChange={(event) =>
                    setCode(
                      event.target.value
                        .replace(/\D/g, '')
                        .slice(0, 6)
                    )
                  }
                  placeholder="000000"
                  required
                  autoFocus
                />
              </label>

              <button
                className="primary-button auth-submit"
                disabled={
                  sending ||
                  code.length !== 6
                }
              >
                {sending
                  ? 'Checking...'
                  : 'Sign in'}
              </button>

              <button
                type="button"
                className="auth-back-button"
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setChallengeId('');
                  setError('');
                }}
                disabled={sending}
              >
                Use a different email
              </button>
            </form>
          )}

          <div className="auth-security-note">
            Passwordless access · Verification
            codes expire after 10 minutes.
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [currentUser, setCurrentUser] =
    useState(null);

  const [checkingSession, setCheckingSession] =
    useState(true);

  const [active, setActive] =
    useState('');

  const [
    demoOptions,
    setDemoOptions
  ] = useState(null);

  const [
    demoBusy,
    setDemoBusy
  ] = useState(false);

  const [
    demoError,
    setDemoError
  ] = useState('');

  const [
    demoDataRevision,
    setDemoDataRevision
  ] = useState(0);

  const nav =
    useMemo(
      () =>
        navigationForUser(currentUser),
      [currentUser]
    );

  const specialTransportOpsOnly =
    Boolean(
      currentUser?.roles?.some(
        (role) =>
          role?.code ===
            'special_transport_ops'
      )
    );

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const response =
          await apiFetch(
            `${API_BASE}/api/auth/me`
          );

        if (!response.ok) {
          if (!cancelled) {
            setCurrentUser(null);
          }

          return;
        }

        const data =
          await response.json();

        if (!cancelled) {
          setCurrentUser(data.user);
        }
      } catch {
        if (!cancelled) {
          setCurrentUser(null);
        }
      } finally {
        if (!cancelled) {
          setCheckingSession(false);
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setActive('');
      return;
    }

    const available =
      navigationForUser(currentUser);

    if (
      !available.some(
        ([key]) => key === active
      )
    ) {
      setActive(
        available[0]?.[0] || ''
      );
    }
  }, [currentUser, active]);

  useEffect(() => {
    let cancelled = false;

    async function loadDemoOptions() {
      if (!currentUser) {
        setDemoOptions(null);
        return;
      }

      try {
        const response =
          await apiFetch(
            `${API_BASE}/api/demo/options`
          );

        if (!response.ok) {
          if (!cancelled) {
            setDemoOptions(null);
          }

          return;
        }

        const data =
          await response.json();

        if (!cancelled) {
          setDemoOptions(data);
        }
      } catch {
        if (!cancelled) {
          setDemoOptions(null);
        }
      }
    }

    loadDemoOptions();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  async function changeDemoView(
    value
  ) {
    if (
      !value ||
      demoBusy
    ) {
      return;
    }

    setDemoBusy(true);
    setDemoError('');

    try {
      if (
        value ===
          '__staff_transport__'
      ) {
        const response =
          await apiFetch(
            `${API_BASE}/api/demo/staff-transport`,
            {
              method: 'POST'
            }
          );

        const data =
          await response
            .json()
            .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.error ||
              'Unable to open Staff Transport demo'
          );
        }

        window.location.assign(
          data.redirect ||
            '/staff-transport?demo=1'
        );

        return;
      }

      const reset =
        value === '__real__';

      const response =
        await apiFetch(
          reset
            ? `${API_BASE}/api/demo/reset`
            : `${API_BASE}/api/demo/switch`,
          {
            method: 'POST',
            headers:
              reset
                ? undefined
                : {
                    'Content-Type':
                      'application/json'
                  },
            body:
              reset
                ? undefined
                : JSON.stringify({
                    roleCode:
                      value
                  })
          }
        );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to change demo view'
        );
      }

      setCurrentUser(
        data.user
      );

      setActive('');

      const optionsResponse =
        await apiFetch(
          `${API_BASE}/api/demo/options`
        );

      if (optionsResponse.ok) {
        setDemoOptions(
          await optionsResponse.json()
        );
      }
    } catch (error) {
      setDemoError(
        error instanceof Error
          ? error.message
          : 'Unable to change demo view'
      );
    } finally {
      setDemoBusy(false);
    }
  }

  async function changeChristmasDemoData(
    action
  ) {
    if (demoBusy) {
      return;
    }

    if (
      action === 'clear' &&
      !window.confirm(
        'Clear all Christmas Demo Data? This removes only records explicitly marked as demo.'
      )
    ) {
      return;
    }

    setDemoBusy(true);
    setDemoError('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/demo/data/christmas/${action}`,
          {
            method: 'POST'
          }
        );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to update Demo Data'
        );
      }

      setDemoOptions(
        current => ({
          ...(current || {}),
          demoData:
            data.demoData
        })
      );

      setDemoDataRevision(
        value => value + 1
      );
    } catch (error) {
      setDemoError(
        error instanceof Error
          ? error.message
          : 'Unable to update Demo Data'
      );
    } finally {
      setDemoBusy(false);
    }
  }

  async function logout() {
    try {
      await apiFetch(
        `${API_BASE}/api/auth/logout`,
        {
          method: 'POST'
        }
      );
    } finally {
      setCurrentUser(null);
      setDemoOptions(null);
      setActive('');
    }
  }

  if (checkingSession) {
    return (
      <div className="auth-shell">
        <div className="auth-loading">
          Checking secure session...
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginPage
        onAuthenticated={
          setCurrentUser
        }
      />
    );
  }

  return (
    <div
      className={
        specialTransportOpsOnly
          ? 'app-shell special-transport-ops-shell'
          : 'app-shell'
      }
    >
      {!specialTransportOpsOnly && (
      <aside className="sidebar">
        <div className="brand">
          <strong>UHP</strong>
          <span>Transport Portal</span>
        </div>

        <div className="signed-in-summary">
          <small>Signed in as</small>

          <strong>
            {currentUser.firstName}{' '}
            {currentUser.lastName}
          </strong>

          <span>
            {roleSummary(currentUser)}
          </span>
        </div>

        <nav>
          {nav.map(
            ([key, label, Icon]) => (
              <button
                key={key}
                className={
                  active === key
                    ? 'nav-item active'
                    : 'nav-item'
                }
                onClick={() =>
                  setActive(key)
                }
              >
                <Icon size={19}/>
                <span>{label}</span>
              </button>
            )
          )}
        </nav>
      </aside>
      )}

      <main className="main">
        <header className="topbar">
          {specialTransportOpsOnly ? (
            <div className="special-transport-ops-brand">
              <strong>
                Special Transport
              </strong>

              <span>
                Enquiries
              </span>
            </div>
          ) : (
            <div className="search">
              <Search size={18}/>

              <input
                placeholder="Search users, budgets, bookings..."
              />
            </div>
          )}

          <div className="top-actions">
            {demoOptions?.enabled && (
              <label className="demo-view-control">
                <span>View as</span>

                <select
                  value={
                    demoOptions.active
                      ? (
                          currentUser
                            ?.roles?.[0]
                            ?.code ||
                          '__real__'
                        )
                      : '__real__'
                  }
                  disabled={demoBusy}
                  onChange={(event) =>
                    changeDemoView(
                      event.target.value
                    )
                  }
                >
                  <option value="__real__">
                    My normal role
                  </option>

                  {(
                    demoOptions.roles ||
                    []
                  ).map(
                    (role) => (
                      <option
                        key={
                          role.roleCode
                        }
                        value={
                          role.roleCode
                        }
                      >
                        {role.roleName}
                      </option>
                    )
                  )}

                  {demoOptions.staffTransport && (
                    <option
                      value="__staff_transport__"
                    >
                      Staff Transport Portal
                    </option>
                  )}
                </select>
              </label>
            )}

            <Bell size={20}/>

            <div className="avatar">
              {initialsForUser(
                currentUser
              )}
            </div>

            <div className="signed-in-user">
              <strong>
                {currentUser.firstName}{' '}
                {currentUser.lastName}
              </strong>

              <small>
                {currentUser.department ||
                  roleSummary(
                    currentUser
                  )}
              </small>
            </div>

            <button
              type="button"
              className="logout-button"
              onClick={logout}
            >
              Sign out
            </button>
          </div>
        </header>

        {demoOptions?.enabled && (
          <div className="demo-data-toolbar">
            <div>
              <strong>
                Christmas Demo Data
              </strong>

              <span>
                {demoOptions.demoData?.loaded
                  ? `${demoOptions.demoData.total} demo requests loaded`
                  : 'No demo requests loaded'}
              </span>
            </div>

            <div className="demo-data-toolbar-actions">
              {!demoOptions.demoData?.loaded ? (
                <button
                  type="button"
                  disabled={demoBusy}
                  onClick={() =>
                    changeChristmasDemoData(
                      'load'
                    )
                  }
                >
                  Load Demo Data
                </button>
              ) : (
                <button
                  type="button"
                  className="danger"
                  disabled={demoBusy}
                  onClick={() =>
                    changeChristmasDemoData(
                      'clear'
                    )
                  }
                >
                  Clear Demo Data
                </button>
              )}
            </div>
          </div>
        )}

        {demoOptions?.active && (
          <div className="demo-view-banner">
            <div>
              <strong>
                DEMO VIEW
              </strong>

              <span>
                Viewing as{' '}
                {roleSummary(
                  currentUser
                )}
              </span>

              {demoOptions.realUser && (
                <small>
                  Signed in as{' '}
                  {
                    demoOptions
                      .realUser
                      .firstName
                  }{' '}
                  {
                    demoOptions
                      .realUser
                      .lastName
                  }
                </small>
              )}
            </div>

            <button
              type="button"
              disabled={demoBusy}
              onClick={() =>
                changeDemoView(
                  '__real__'
                )
              }
            >
              Return to my role
            </button>
          </div>
        )}

        {demoError && (
          <div className="demo-view-error">
            {demoError}
          </div>
        )}

        <section
          className="content"
          key={demoDataRevision}
        >
          {active === 'admin-dashboard' ? (
            <UhpAdminDashboard/>
          ) : active === 'admin-users' ? (
            <UsersPage/>
          ) : active === 'admin-budgets' ? (
            <BudgetsPage/>
          ) : active === 'admin-reasons' ? (
            <ReasonCodesPage/>
          ) : active === 'admin-locations' ? (
            <LocationsPage/>
          ) : active === 'booker-dashboard' ? (
            <BookerDashboard
              currentUser={currentUser}
            />
          ) : active === 'holder-dashboard' ? (
            <BudgetHolderDashboard
              currentUser={currentUser}
            />
          ) : active === 'special-transport' ? (
            <SpecialTransportPage
              currentUser={currentUser}
            />
          ) : active === 'book-transport' ? (
            <BookTransportPage
              currentUser={currentUser}
            />
          ) : active === 'my-bookings' ? (
            <MyBookingsPage
              currentUser={currentUser}
            />
          ) : active === 'uhp-bookings' ? (
            <MyBookingsPage
              currentUser={currentUser}
              scope="all"
            />
          ) : active === 'holder-bookings' ? (
            <MyBookingsPage
              currentUser={currentUser}
              scope="budget"
            />
          ) : active === 'holder-invoices' ? (
            <BudgetInvoicesPage/>
          ) : active === 'nac-control' ? (
            <NacControlPage/>
          ) : active === 'nac-special-transport' ? (
            <TransportOperationsPage
              currentUser={currentUser}
            />
          ) : active === 'nac-special-transport-settings' ? (
            <TransportOperationsPage
              currentUser={currentUser}
              settingsOnly
            />
          ) : active === 'nac-bookings' ? (
            <NacBookingsPage/>
          ) : active === 'nac-exceptions' ? (
            <NacBookingsPage
              exceptionsOnly
            />
          ) : active === 'nac-christmas' ? (
            <ChristmasTransportEnquiriesPage/>
          ) : active === 'coding-review' ? (
            <CodingReviewPage/>
          ) : (
            <Placeholder
              role={roleSummary(currentUser)}
              active={
                nav.find(
                  ([key]) =>
                    key === active
                )?.[1] ||
                'Dashboard'
              }
            />
          )}
        </section>
      </main>
    </div>
  );
}



function ChristmasTransportEnquiriesPage() {
  const [requests, setRequests] =
    useState([]);

  const [query, setQuery] =
    useState('');

  const [
    selectedRequest,
    setSelectedRequest
  ] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [
    detailLoading,
    setDetailLoading
  ] =
    useState(false);

  const [error, setError] =
    useState('');

  const [internalNote, setInternalNote] =
    useState('');

  const [savingNote, setSavingNote] =
    useState(false);

  const [noteMessage, setNoteMessage] =
    useState('');

  const [isAmending, setIsAmending] =
    useState(false);

  const [savingAmend, setSavingAmend] =
    useState(false);

  const [amendMessage, setAmendMessage] =
    useState('');

  const [amendForm, setAmendForm] =
    useState({
      passengerName: '',
      passengerMobile: '',
      passengerEmail: '',
      direction: 'to_work',
      shiftTime: '',
      pickupAddress: '',
      pickupPostcode: '',
      destinationAddress: '',
      destinationPostcode: '',
      passengerNotes: ''
    });


  useEffect(() => {
    let cancelled = false;

    async function loadRequests() {
      setLoading(true);
      setError('');

      try {
        const response =
          await apiFetch(
            `${API_BASE}/api/transport-operations/christmas-enquiries`
          );

        const data =
          await response
            .json()
            .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.error ||
              'Unable to load Christmas transport enquiries'
          );
        }

        if (!cancelled) {
          setRequests(
            data.requests || []
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Unable to load Christmas transport enquiries'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadRequests();

    return () => {
      cancelled = true;
    };
  }, []);


  const filteredRequests =
    useMemo(() => {
      const term =
        query
          .trim()
          .toLowerCase();

      if (!term) {
        return requests;
      }

      return requests.filter(
        (request) =>
          [
            request.id,
            `#${request.id}`,
            request.passengerName,
            request.passengerMobile,
            request.passengerEmail,
            request.pickupAddress,
            request.pickupPostcode,
            request.destinationAddress,
            request.destinationPostcode,
            request.programmeCode,
            request.programmeWindowName
          ]
            .filter(
              value =>
                value !== null &&
                value !== undefined
            )
            .join(' ')
            .toLowerCase()
            .includes(term)
      );
    }, [
      requests,
      query
    ]);


  async function openRequest(
    requestId
  ) {
    setDetailLoading(true);
    setError('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/transport-operations/christmas-enquiries/${requestId}`
        );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to open Christmas transport request'
        );
      }

      setSelectedRequest(
        data.request
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to open Christmas transport request'
      );
    } finally {
      setDetailLoading(false);
    }
  }


  function enquiryDirectionLabel(
    direction
  ) {
    return direction === 'to_work'
      ? 'To work'
      : direction === 'from_work'
        ? 'From work'
        : formatStatus(direction);
  }


  function enquiryDateTime(
    value
  ) {
    if (!value) {
      return '—';
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return value;
    }

    return date.toLocaleString(
      'en-GB',
      {
        dateStyle: 'medium',
        timeStyle: 'short'
      }
    );
  }




  function enquiryDateTimeInputValue(
    value
  ) {
    if (!value) {
      return '';
    }

    const raw =
      String(value)
        .trim()
        .replace(' ', 'T');

    const match =
      raw.match(
        /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/
      );

    return match
      ? match[1]
      : '';
  }


  function updateAmendField(
    field,
    value
  ) {
    setAmendForm(
      current => ({
        ...current,
        [field]: value
      })
    );
  }


  function beginChristmasAmend() {
    if (!selectedRequest) {
      return;
    }

    setAmendForm({
      passengerName:
        selectedRequest.passengerName || '',

      passengerMobile:
        selectedRequest.passengerMobile || '',

      passengerEmail:
        selectedRequest.passengerEmail || '',

      direction:
        selectedRequest.direction ||
          'to_work',

      shiftTime:
        enquiryDateTimeInputValue(
          selectedRequest.shiftTime
        ),

      pickupAddress:
        selectedRequest.pickupAddress || '',

      pickupPostcode:
        selectedRequest.pickupPostcode || '',

      destinationAddress:
        selectedRequest.destinationAddress || '',

      destinationPostcode:
        selectedRequest.destinationPostcode || '',

      passengerNotes:
        selectedRequest.passengerNotes || ''
    });

    setError('');
    setAmendMessage('');
    setNoteMessage('');
    setIsAmending(true);
  }


  function cancelChristmasAmend() {
    setIsAmending(false);
    setAmendMessage('');
    setError('');
  }


  async function submitChristmasAmend(
    event
  ) {
    event.preventDefault();

    if (!selectedRequest) {
      return;
    }

    setSavingAmend(true);
    setError('');
    setAmendMessage('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/transport-operations/christmas-enquiries/${selectedRequest.id}/amend`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type':
                'application/json'
            },
            body:
              JSON.stringify(
                amendForm
              )
          }
        );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to amend transport request'
        );
      }

      setSelectedRequest(
        data.request
      );

      setRequests(
        current =>
          current.map(
            request =>
              request.id ===
                data.request.id
                ? {
                    ...request,
                    ...data.request
                  }
                : request
          )
      );

      setIsAmending(false);

      setAmendMessage(
        'Request amended successfully.'
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Unable to amend transport request'
      );
    } finally {
      setSavingAmend(false);
    }
  }


  async function submitInternalNote(
    event
  ) {
    event.preventDefault();

    const note =
      internalNote.trim();

    if (
      !selectedRequest ||
      !note
    ) {
      return;
    }

    setSavingNote(true);
    setError('');
    setNoteMessage('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/transport-operations/christmas-enquiries/${selectedRequest.id}/internal-note`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body:
              JSON.stringify({
                note
              })
          }
        );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to add internal note'
        );
      }

      setSelectedRequest(
        data.request
      );

      setInternalNote('');

      setNoteMessage(
        'Internal note added.'
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Unable to add internal note'
      );
    } finally {
      setSavingNote(false);
    }
  }


  if (selectedRequest) {
    return (
      <>
        <div className="page-heading christmas-enquiry-heading">
          <div>
            <button
              type="button"
              className="christmas-enquiry-back"
              onClick={() =>
                setSelectedRequest(null)
              }
            >
              ← Back to enquiries
            </button>

            <small>
              Christmas Transport
            </small>

            <h1>
              {selectedRequest.passengerName}
            </h1>

            <p>
              Request #{selectedRequest.id}
              {' · '}
              {selectedRequest.programmeWindowName}
            </p>
          </div>

          <span
            className={`badge ${selectedRequest.status}`}
          >
            {formatStatus(
              selectedRequest.status
            )}
          </span>
        </div>

        {error && (
          <div className="notice error">
            {error}
          </div>
        )}

        <div className="christmas-enquiry-detail-actions">
          {!isAmending && (
            <button
              type="button"
              className="primary"
              onClick={beginChristmasAmend}
              disabled={
                ![
                  'submitted',
                  'needs_information',
                  'ready_for_planning'
                ].includes(
                  selectedRequest.status
                )
              }
            >
              Amend Request
            </button>
          )}

          {![
            'submitted',
            'needs_information',
            'ready_for_planning'
          ].includes(
            selectedRequest.status
          ) && (
            <small>
              This request can no longer be amended.
            </small>
          )}
        </div>

        {amendMessage && (
          <div className="notice success christmas-enquiry-amend-message">
            {amendMessage}
          </div>
        )}

        {isAmending && (
          <section className="card christmas-enquiry-amend-card">
            <div className="christmas-enquiry-card-heading">
              <div>
                <small>
                  Office amendment
                </small>

                <h2>
                  Amend request
                </h2>
              </div>
            </div>

            <form
              className="christmas-enquiry-amend-form"
              onSubmit={submitChristmasAmend}
            >
              <div className="christmas-enquiry-amend-grid">
                <label>
                  Passenger name
                  <input
                    type="text"
                    value={amendForm.passengerName}
                    onChange={(event) =>
                      updateAmendField(
                        'passengerName',
                        event.target.value
                      )
                    }
                    required
                    disabled={savingAmend}
                  />
                </label>

                <label>
                  Mobile
                  <input
                    type="tel"
                    value={amendForm.passengerMobile}
                    onChange={(event) =>
                      updateAmendField(
                        'passengerMobile',
                        event.target.value
                      )
                    }
                    required
                    disabled={savingAmend}
                  />
                </label>

                <label>
                  Email
                  <input
                    type="email"
                    value={amendForm.passengerEmail}
                    onChange={(event) =>
                      updateAmendField(
                        'passengerEmail',
                        event.target.value
                      )
                    }
                    disabled={savingAmend}
                  />
                </label>

                <label>
                  Direction
                  <select
                    value={amendForm.direction}
                    onChange={(event) =>
                      updateAmendField(
                        'direction',
                        event.target.value
                      )
                    }
                    disabled={savingAmend}
                  >
                    <option value="to_work">
                      To work
                    </option>

                    <option value="from_work">
                      From work
                    </option>
                  </select>
                </label>

                <label>
                  Shift date and time
                  <input
                    type="datetime-local"
                    value={amendForm.shiftTime}
                    onChange={(event) =>
                      updateAmendField(
                        'shiftTime',
                        event.target.value
                      )
                    }
                    required
                    disabled={savingAmend}
                  />
                </label>

                <div />
              </div>

              <div className="christmas-enquiry-amend-section">
                <strong>Pickup</strong>

                <div className="christmas-enquiry-amend-address-grid">
                  <label>
                    Address
                    <input
                      type="text"
                      value={amendForm.pickupAddress}
                      onChange={(event) =>
                        updateAmendField(
                          'pickupAddress',
                          event.target.value
                        )
                      }
                      required
                      disabled={savingAmend}
                    />
                  </label>

                  <label>
                    Postcode
                    <input
                      type="text"
                      value={amendForm.pickupPostcode}
                      onChange={(event) =>
                        updateAmendField(
                          'pickupPostcode',
                          event.target.value
                        )
                      }
                      disabled={savingAmend}
                    />
                  </label>
                </div>
              </div>

              <div className="christmas-enquiry-amend-section">
                <strong>Destination</strong>

                <div className="christmas-enquiry-amend-address-grid">
                  <label>
                    Address
                    <input
                      type="text"
                      value={amendForm.destinationAddress}
                      onChange={(event) =>
                        updateAmendField(
                          'destinationAddress',
                          event.target.value
                        )
                      }
                      required
                      disabled={savingAmend}
                    />
                  </label>

                  <label>
                    Postcode
                    <input
                      type="text"
                      value={amendForm.destinationPostcode}
                      onChange={(event) =>
                        updateAmendField(
                          'destinationPostcode',
                          event.target.value
                        )
                      }
                      disabled={savingAmend}
                    />
                  </label>
                </div>
              </div>

              <label className="christmas-enquiry-amend-notes">
                Passenger information

                <textarea
                  rows="3"
                  value={amendForm.passengerNotes}
                  onChange={(event) =>
                    updateAmendField(
                      'passengerNotes',
                      event.target.value
                    )
                  }
                  placeholder="Journey or passenger information..."
                  disabled={savingAmend}
                />
              </label>

              <div className="christmas-enquiry-amend-actions">
                <button
                  type="button"
                  onClick={cancelChristmasAmend}
                  disabled={savingAmend}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary"
                  disabled={savingAmend}
                >
                  {savingAmend
                    ? 'Saving...'
                    : 'Save Changes'}
                </button>
              </div>
            </form>
          </section>
        )}

        <div className="christmas-enquiry-detail-grid">
          <section className="card christmas-enquiry-card">
            <div className="christmas-enquiry-card-heading">
              <div>
                <small>
                  Staff member
                </small>

                <h2>
                  Contact
                </h2>
              </div>
            </div>

            <dl className="christmas-enquiry-details">
              <div>
                <dt>Name</dt>
                <dd>
                  {selectedRequest.passengerName}
                </dd>
              </div>

              <div>
                <dt>Mobile</dt>
                <dd>
                  {selectedRequest.passengerMobile || '—'}
                </dd>
              </div>

              <div>
                <dt>Email</dt>
                <dd>
                  {selectedRequest.passengerEmail || '—'}
                </dd>
              </div>

              <div>
                <dt>Requested by</dt>
                <dd>
                  {selectedRequest.requestedByName || '—'}
                </dd>
              </div>
            </dl>
          </section>

          <section className="card christmas-enquiry-card">
            <div className="christmas-enquiry-card-heading">
              <div>
                <small>
                  Journey
                </small>

                <h2>
                  Travel details
                </h2>
              </div>
            </div>

            <dl className="christmas-enquiry-details">
              <div>
                <dt>Direction</dt>
                <dd>
                  {enquiryDirectionLabel(
                    selectedRequest.direction
                  )}
                </dd>
              </div>

              <div>
                <dt>Shift time</dt>
                <dd>
                  {enquiryDateTime(
                    selectedRequest.shiftTime
                  )}
                </dd>
              </div>

              <div>
                <dt>Passengers</dt>
                <dd>
                  {selectedRequest.passengerCount || 1}
                </dd>
              </div>

              <div>
                <dt>Service</dt>
                <dd>
                  {selectedRequest.programmeName}
                  <br/>
                  <span>
                    {selectedRequest.programmeWindowName}
                  </span>
                </dd>
              </div>
            </dl>

            <div className="christmas-enquiry-route">
              <div>
                <small>
                  Pickup
                </small>

                <strong>
                  {selectedRequest.pickupAddress}
                </strong>

                {selectedRequest.pickupPostcode && (
                  <span>
                    {selectedRequest.pickupPostcode}
                  </span>
                )}
              </div>

              <div className="christmas-enquiry-route-arrow">
                →
              </div>

              <div>
                <small>
                  Destination
                </small>

                <strong>
                  {selectedRequest.destinationAddress}
                </strong>

                {selectedRequest.destinationPostcode && (
                  <span>
                    {selectedRequest.destinationPostcode}
                  </span>
                )}
              </div>
            </div>
          </section>

          <section className="card christmas-enquiry-card">
            <div className="christmas-enquiry-card-heading">
              <div>
                <small>
                  Information
                </small>

                <h2>
                  Notes
                </h2>
              </div>
            </div>

            <div className="christmas-enquiry-notes">
              <div>
                <strong>
                  Passenger information
                </strong>

                <p>
                  {selectedRequest.passengerNotes ||
                    'No passenger notes recorded.'}
                </p>
              </div>

              <div>
                <strong>
                  Accessibility
                </strong>

                <p>
                  {selectedRequest.accessibilityNotes ||
                    'No accessibility requirements recorded.'}
                </p>
              </div>

              <div className="internal christmas-enquiry-internal-notes">
                <strong>
                  Internal notes
                </strong>

                <p className="christmas-enquiry-existing-notes">
                  {selectedRequest.internalNotes ||
                    'No internal notes recorded.'}
                </p>

                <form
                  className="christmas-enquiry-note-form"
                  onSubmit={submitInternalNote}
                >
                  <label>
                    Add office note

                    <textarea
                      rows="3"
                      maxLength="2000"
                      value={internalNote}
                      onChange={(event) =>
                        setInternalNote(
                          event.target.value
                        )
                      }
                      placeholder="Record details from a phone call or email..."
                      disabled={savingNote}
                    />
                  </label>

                  <div className="christmas-enquiry-note-actions">
                    <small>
                      Internal only · maximum 2000 characters
                    </small>

                    <button
                      type="submit"
                      className="primary"
                      disabled={
                        savingNote ||
                        !internalNote.trim()
                      }
                    >
                      {savingNote
                        ? 'Adding...'
                        : 'Add Note'}
                    </button>
                  </div>
                </form>

                {noteMessage && (
                  <div className="notice success christmas-enquiry-note-message">
                    {noteMessage}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="card christmas-enquiry-card">
            <div className="christmas-enquiry-card-heading">
              <div>
                <small>
                  Record
                </small>

                <h2>
                  Request information
                </h2>
              </div>
            </div>

            <dl className="christmas-enquiry-details">
              <div>
                <dt>Request ID</dt>
                <dd>
                  #{selectedRequest.id}
                </dd>
              </div>

              <div>
                <dt>Source</dt>
                <dd>
                  {formatStatus(
                    selectedRequest.source
                  )}
                </dd>
              </div>

              <div>
                <dt>Submitted</dt>
                <dd>
                  {enquiryDateTime(
                    selectedRequest.submittedAt
                  )}
                </dd>
              </div>

              <div>
                <dt>Last updated</dt>
                <dd>
                  {enquiryDateTime(
                    selectedRequest.updatedAt
                  )}
                </dd>
              </div>

              {selectedRequest.confirmedAt && (
                <div>
                  <dt>Confirmed</dt>
                  <dd>
                    {enquiryDateTime(
                      selectedRequest.confirmedAt
                    )}
                  </dd>
                </div>
              )}

              {selectedRequest.cancelledAt && (
                <div>
                  <dt>Cancelled</dt>
                  <dd>
                    {enquiryDateTime(
                      selectedRequest.cancelledAt
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </div>

        <section className="card christmas-enquiry-history">
          <div className="christmas-enquiry-card-heading">
            <div>
              <small>
                Audit trail
              </small>

              <h2>
                Request history
              </h2>
            </div>
          </div>

          {selectedRequest.events?.length ? (
            <div className="christmas-enquiry-timeline">
              {[...selectedRequest.events]
                .reverse()
                .map(
                  (event) => (
                    <div
                      className="christmas-enquiry-event"
                      key={event.id}
                    >
                      <div className="christmas-enquiry-event-dot"/>

                      <div>
                        <div className="christmas-enquiry-event-top">
                          <strong>
                            {formatStatus(
                              event.eventType
                            )}
                          </strong>

                          <span>
                            {enquiryDateTime(
                              event.createdAt
                            )}
                          </span>
                        </div>

                        <p>
                          {event.notes ||
                            'Request updated'}
                        </p>

                        <small>
                          {event.actorName
                            ? `By ${event.actorName}`
                            : 'System'}
                          {event.oldStatus &&
                          event.newStatus &&
                          event.oldStatus !==
                            event.newStatus
                            ? ` · ${formatStatus(event.oldStatus)} → ${formatStatus(event.newStatus)}`
                            : ''}
                        </small>
                      </div>
                    </div>
                  )
                )}
            </div>
          ) : (
            <div className="state-panel">
              No request history recorded.
            </div>
          )}
        </section>
      </>
    );
  }


  return (
    <>
      <div className="page-heading christmas-enquiry-heading">
        <div>
          <small>
            Need-A-Cab Ops
          </small>

          <h1>
            Christmas Transport Enquiries
          </h1>

          <p>
            Quickly find a staff member or journey
            while handling telephone and email enquiries.
          </p>
        </div>

        <span className="christmas-enquiry-count">
          {requests.length}
          {' '}
          requests
        </span>
      </div>

      {error && (
        <div className="notice error">
          {error}
        </div>
      )}

      <section className="card christmas-enquiry-search-card">
        <div className="christmas-enquiry-search">
          <Search size={20}/>

          <input
            type="search"
            autoFocus
            value={query}
            onChange={(event) =>
              setQuery(
                event.target.value
              )
            }
            placeholder="Name, mobile, email, postcode or request number..."
          />
        </div>

        <small>
          Search works across passenger details,
          pickup, destination and request number.
        </small>
      </section>

      {loading ? (
        <div className="card state-panel">
          Loading Christmas transport requests...
        </div>
      ) : detailLoading ? (
        <div className="card state-panel">
          Opening transport request...
        </div>
      ) : (
        <section className="christmas-enquiry-results">
          <div className="christmas-enquiry-results-heading">
            <strong>
              {filteredRequests.length}
              {' '}
              {filteredRequests.length === 1
                ? 'match'
                : 'matches'}
            </strong>

            {query && (
              <span>
                for “{query}”
              </span>
            )}
          </div>

          {filteredRequests.length ? (
            <div className="christmas-enquiry-list">
              {filteredRequests.map(
                (request) => (
                  <button
                    type="button"
                    className="card christmas-enquiry-result"
                    key={request.id}
                    onClick={() =>
                      openRequest(
                        request.id
                      )
                    }
                  >
                    <div className="christmas-enquiry-result-main">
                      <div>
                        <strong>
                          {request.passengerName}
                        </strong>

                        <span>
                          {request.passengerMobile || 'No mobile'}
                          {request.passengerEmail
                            ? ` · ${request.passengerEmail}`
                            : ''}
                        </span>
                      </div>

                      <span
                        className={`badge ${request.status}`}
                      >
                        {formatStatus(
                          request.status
                        )}
                      </span>
                    </div>

                    <div className="christmas-enquiry-result-journey">
                      <div>
                        <small>
                          {enquiryDirectionLabel(
                            request.direction
                          )}
                          {' · '}
                          {enquiryDateTime(
                            request.shiftTime
                          )}
                        </small>

                        <span>
                          {request.pickupAddress}
                          {request.pickupPostcode
                            ? ` (${request.pickupPostcode})`
                            : ''}
                        </span>

                        <strong>
                          →
                        </strong>

                        <span>
                          {request.destinationAddress}
                          {request.destinationPostcode
                            ? ` (${request.destinationPostcode})`
                            : ''}
                        </span>
                      </div>

                      <small>
                        Request #{request.id}
                      </small>
                    </div>
                  </button>
                )
              )}
            </div>
          ) : (
            <div className="card state-panel">
              {query
                ? 'No Christmas transport requests match this search.'
                : 'No Christmas transport requests have been submitted yet.'}
            </div>
          )}
        </section>
      )}
    </>
  );
}


function TransportOperationsPage({
  currentUser,
  settingsOnly = false
}) {
  const [overview, setOverview] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [
    transportPlanningCandidates,
    setTransportPlanningCandidates
  ] =
    useState(null);

  const [
    transportPlanningLoading,
    setTransportPlanningLoading
  ] =
    useState(true);

  const [
    transportPlanningError,
    setTransportPlanningError
  ] =
    useState('');

  const transportOperationsIsNacAdmin =
    currentUser?.roles?.some(
      role =>
        role.code === 'nac_admin'
    ) ?? false;

  const [
    transportPlanningRefreshVersion,
    setTransportPlanningRefreshVersion
  ] =
    useState(0);

  const [
    transportCapacityEditor,
    setTransportCapacityEditor
  ] =
    useState(null);

  const [
    transportCapacitySaving,
    setTransportCapacitySaving
  ] =
    useState(false);

  const [
    transportCapacitySaveError,
    setTransportCapacitySaveError
  ] =
    useState('');

  const [
    transportCapacitySaveMessage,
    setTransportCapacitySaveMessage
  ] =
    useState('');

  const [
    transportPlanProgrammes,
    setTransportPlanProgrammes
  ] =
    useState([]);

  const [
    transportPlanProgrammeId,
    setTransportPlanProgrammeId
  ] =
    useState('');

  const [
    transportPlanProgramme,
    setTransportPlanProgramme
  ] =
    useState(null);

  const [
    transportPlanWindows,
    setTransportPlanWindows
  ] =
    useState([]);

  const [
    transportPlanAccess,
    setTransportPlanAccess
  ] =
    useState(null);

  const [
    transportPlanLoading,
    setTransportPlanLoading
  ] =
    useState(true);

  const [
    transportPlanSaving,
    setTransportPlanSaving
  ] =
    useState(false);

  const [
    transportPlanError,
    setTransportPlanError
  ] =
    useState('');

  const [
    transportPlanMessage,
    setTransportPlanMessage
  ] =
    useState('');

  const [
    transportPlanWindowEditor,
    setTransportPlanWindowEditor
  ] =
    useState(null);

  const [
    transportPlanAccessCode,
    setTransportPlanAccessCode
  ] =
    useState('');

  const [
    transportPlanCreateEditor,
    setTransportPlanCreateEditor
  ] =
    useState(null);

  const [search, setSearch] =
    useState('');

  const [statusFilter, setStatusFilter] =
    useState('all');

  const [dayFilter, setDayFilter] =
    useState('all');

  const [directionFilter, setDirectionFilter] =
    useState('all');

  const [pickupAreaFilter, setPickupAreaFilter] =
    useState('all');

  const [
    destinationAreaFilter,
    setDestinationAreaFilter
  ] =
    useState('all');

  const [attentionOnly, setAttentionOnly] =
    useState(false);

  const [sortBy, setSortBy] =
    useState('shift_asc');

  const [
    transportOperationsFiltersOpen,
    setTransportOperationsFiltersOpen
  ] =
    useState(false);

  const [
    transportAnalysisOpen,
    setTransportAnalysisOpen
  ] =
    useState(false);

  const transportOperationsActiveFilterCount =
    [
      statusFilter !== 'all',
      dayFilter !== 'all',
      directionFilter !== 'all',
      pickupAreaFilter !== 'all',
      destinationAreaFilter !== 'all',
      attentionOnly,
      sortBy !== 'shift_asc'
    ].filter(Boolean).length;

  useEffect(() => {
    if (settingsOnly) {
      setLoading(false);
      setError('');
      return;
    }

    let cancelled = false;

    async function loadOverview() {
      setLoading(true);
      setError('');

      try {
        const response =
          await apiFetch(
            `${API_BASE}/api/transport-operations/overview`
          );

        const data =
          await response.json()
            .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.error ||
              'Unable to load Special Transport operations'
          );
        }

        if (!cancelled) {
          setOverview(data);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Unable to load Special Transport operations'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadOverview();

    return () => {
      cancelled = true;
    };
  }, [settingsOnly]);

  function transportPlanDateTimeInputValue(
    value
  ) {
    if (!value) {
      return '';
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return '';
    }

    const local =
      new Date(
        date.getTime() -
          date.getTimezoneOffset() *
          60000
      );

    return local
      .toISOString()
      .slice(0, 16);
  }


  function transportPlanIsoValue(
    value
  ) {
    if (!value) {
      return null;
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return null;
    }

    return date.toISOString();
  }


  async function loadTransportPlan(
    preferredProgrammeId = null
  ) {
    setTransportPlanLoading(true);
    setTransportPlanError('');

    try {
      const programmesResponse =
        await apiFetch(
          `${API_BASE}/api/transport-programmes`
        );

      const programmesData =
        await programmesResponse
          .json()
          .catch(() => ({}));

      if (!programmesResponse.ok) {
        throw new Error(
          programmesData.error ||
            'Unable to load travel plans'
        );
      }

      const programmes =
        programmesData.programmes || [];

      setTransportPlanProgrammes(
        programmes
      );

      const selectedId =
        String(
          preferredProgrammeId ||
          transportPlanProgrammeId ||
          programmes[0]?.id ||
          ''
        );

      if (!selectedId) {
        setTransportPlanProgrammeId('');
        setTransportPlanProgramme(null);
        setTransportPlanWindows([]);
        setTransportPlanAccess(null);
        return;
      }

      setTransportPlanProgrammeId(
        selectedId
      );

      const [
        programmeResponse,
        windowsResponse
      ] =
        await Promise.all([
          apiFetch(
            `${API_BASE}/api/transport-programmes/${selectedId}`
          ),
          apiFetch(
            `${API_BASE}/api/transport-programmes/${selectedId}/windows`
          )
        ]);

      const programmeData =
        await programmeResponse
          .json()
          .catch(() => ({}));

      const windowsData =
        await windowsResponse
          .json()
          .catch(() => ({}));

      if (!programmeResponse.ok) {
        throw new Error(
          programmeData.error ||
            'Unable to load travel plan'
        );
      }

      if (!windowsResponse.ok) {
        throw new Error(
          windowsData.error ||
            'Unable to load travel windows'
        );
      }

      setTransportPlanProgramme(
        programmeData.programme || null
      );

      setTransportPlanWindows(
        windowsData.windows || []
      );

      if (transportOperationsIsNacAdmin) {
        const accessResponse =
          await apiFetch(
            `${API_BASE}/api/transport-programmes/${selectedId}/access-code`
          );

        const accessData =
          await accessResponse
            .json()
            .catch(() => ({}));

        if (!accessResponse.ok) {
          throw new Error(
            accessData.error ||
              'Unable to load campaign access'
          );
        }

        setTransportPlanAccess(
          accessData.configured || null
        );
      } else {
        setTransportPlanAccess(null);
      }
    } catch (loadError) {
      setTransportPlanError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load travel plan'
      );
    } finally {
      setTransportPlanLoading(false);
    }
  }


  useEffect(() => {
    if (
      !settingsOnly ||
      !transportOperationsIsNacAdmin
    ) {
      setTransportPlanLoading(false);
      return;
    }

    loadTransportPlan();
  }, [
    settingsOnly,
    transportOperationsIsNacAdmin
  ]);


  function openTransportPlanCreate() {
    setTransportPlanCreateEditor({
      code: '',
      name: '',
      status: 'draft',
      requestOpensAt: '',
      requestClosesAt: ''
    });

    setTransportPlanError('');
    setTransportPlanMessage('');
  }


  async function saveTransportPlanCreate() {
    if (
      !transportOperationsIsNacAdmin ||
      !transportPlanCreateEditor
    ) {
      return;
    }

    setTransportPlanSaving(true);
    setTransportPlanError('');
    setTransportPlanMessage('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/transport-programmes`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              code:
                transportPlanCreateEditor
                  .code,
              name:
                transportPlanCreateEditor
                  .name,
              status:
                transportPlanCreateEditor
                  .status,
              programmeType:
                'special_transport',
              autocabAccountType:
                'xmas_staff',
              requestOpensAt:
                transportPlanIsoValue(
                  transportPlanCreateEditor
                    .requestOpensAt
                ),
              requestClosesAt:
                transportPlanIsoValue(
                  transportPlanCreateEditor
                    .requestClosesAt
                )
            })
          }
        );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to create travel plan'
        );
      }

      setTransportPlanCreateEditor(
        null
      );

      setTransportPlanMessage(
        'Travel plan created'
      );

      await loadTransportPlan(
        data.programme.id
      );
    } catch (saveError) {
      setTransportPlanError(
        saveError instanceof Error
          ? saveError.message
          : 'Unable to create travel plan'
      );
    } finally {
      setTransportPlanSaving(false);
    }
  }


  async function toggleTransportPlanAccess() {
    if (
      !transportOperationsIsNacAdmin ||
      !transportPlanProgramme ||
      !transportPlanAccess
    ) {
      return;
    }

    setTransportPlanSaving(true);
    setTransportPlanError('');
    setTransportPlanMessage('');

    try {
      const nextActive =
        !Number(
          transportPlanAccess.isActive
        );

      const response =
        await apiFetch(
          `${API_BASE}/api/transport-programmes/${transportPlanProgramme.id}/access-code`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              isActive:
                nextActive
            })
          }
        );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to update campaign access'
        );
      }

      setTransportPlanMessage(
        Number(
          data.configured?.isActive
        )
          ? 'Campaign access enabled'
          : 'Campaign access disabled'
      );

      await loadTransportPlan(
        transportPlanProgramme.id
      );
    } catch (saveError) {
      setTransportPlanError(
        saveError instanceof Error
          ? saveError.message
          : 'Unable to update campaign access'
      );
    } finally {
      setTransportPlanSaving(false);
    }
  }


  async function saveTransportPlanProgramme() {
    if (
      !transportOperationsIsNacAdmin ||
      !transportPlanProgramme
    ) {
      return;
    }

    setTransportPlanSaving(true);
    setTransportPlanError('');
    setTransportPlanMessage('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/transport-programmes/${transportPlanProgramme.id}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              name:
                transportPlanProgramme.name,
              status:
                transportPlanProgramme.status,
              requestOpensAt:
                transportPlanIsoValue(
                  transportPlanProgramme
                    .requestOpensAt
                ),
              requestClosesAt:
                transportPlanIsoValue(
                  transportPlanProgramme
                    .requestClosesAt
                ),
              confirmationDueAt:
                transportPlanIsoValue(
                  transportPlanProgramme
                    .confirmationDueAt
                ),
              routeLockAt:
                transportPlanIsoValue(
                  transportPlanProgramme
                    .routeLockAt
                )
            })
          }
        );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to save travel plan'
        );
      }

      setTransportPlanProgramme(
        data.programme
      );

      setTransportPlanMessage(
        'Travel plan updated'
      );

      await loadTransportPlan(
        data.programme.id
      );
    } catch (saveError) {
      setTransportPlanError(
        saveError instanceof Error
          ? saveError.message
          : 'Unable to save travel plan'
      );
    } finally {
      setTransportPlanSaving(false);
    }
  }


  function openTransportPlanWindowCreate() {
    setTransportPlanWindowEditor({
      id: null,
      name: '',
      startsAt: '',
      endsAt: '',
      isActive: true
    });

    setTransportPlanError('');
    setTransportPlanMessage('');
  }


  function openTransportPlanWindowEdit(
    window
  ) {
    setTransportPlanWindowEditor({
      id: window.id,
      name: window.name || '',
      startsAt:
        transportPlanDateTimeInputValue(
          window.startsAt
        ),
      endsAt:
        transportPlanDateTimeInputValue(
          window.endsAt
        ),
      isActive:
        Number(
          window.isActive
        ) === 1
    });

    setTransportPlanError('');
    setTransportPlanMessage('');
  }


  async function saveTransportPlanWindow() {
    if (
      !transportOperationsIsNacAdmin ||
      !transportPlanProgramme ||
      !transportPlanWindowEditor
    ) {
      return;
    }

    setTransportPlanSaving(true);
    setTransportPlanError('');
    setTransportPlanMessage('');

    try {
      const editing =
        Boolean(
          transportPlanWindowEditor.id
        );

      const response =
        await apiFetch(
          editing
            ? `${API_BASE}/api/transport-programme-windows/${transportPlanWindowEditor.id}`
            : `${API_BASE}/api/transport-programmes/${transportPlanProgramme.id}/windows`,
          {
            method:
              editing
                ? 'PATCH'
                : 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              name:
                transportPlanWindowEditor
                  .name,
              startsAt:
                transportPlanIsoValue(
                  transportPlanWindowEditor
                    .startsAt
                ),
              endsAt:
                transportPlanIsoValue(
                  transportPlanWindowEditor
                    .endsAt
                ),
              isActive:
                transportPlanWindowEditor
                  .isActive
            })
          }
        );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to save travel window'
        );
      }

      setTransportPlanWindowEditor(
        null
      );

      setTransportPlanMessage(
        editing
          ? 'Travel window updated'
          : 'Travel window added'
      );

      await loadTransportPlan(
        transportPlanProgramme.id
      );

      setTransportPlanningRefreshVersion(
        value => value + 1
      );
    } catch (saveError) {
      setTransportPlanError(
        saveError instanceof Error
          ? saveError.message
          : 'Unable to save travel window'
      );
    } finally {
      setTransportPlanSaving(false);
    }
  }


  async function toggleTransportPlanWindow(
    window
  ) {
    if (!transportOperationsIsNacAdmin) {
      return;
    }

    setTransportPlanSaving(true);
    setTransportPlanError('');
    setTransportPlanMessage('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/transport-programme-windows/${window.id}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              isActive:
                !Number(
                  window.isActive
                )
            })
          }
        );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to update travel window'
        );
      }

      setTransportPlanMessage(
        Number(
          data.window.isActive
        )
          ? 'Travel window activated'
          : 'Travel window deactivated'
      );

      await loadTransportPlan(
        transportPlanProgramme.id
      );

      setTransportPlanningRefreshVersion(
        value => value + 1
      );
    } catch (saveError) {
      setTransportPlanError(
        saveError instanceof Error
          ? saveError.message
          : 'Unable to update travel window'
      );
    } finally {
      setTransportPlanSaving(false);
    }
  }


  async function saveTransportPlanAccess() {
    if (
      !transportOperationsIsNacAdmin ||
      !transportPlanProgramme ||
      transportPlanAccessCode.trim()
        .length < 6
    ) {
      return;
    }

    setTransportPlanSaving(true);
    setTransportPlanError('');
    setTransportPlanMessage('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/transport-programmes/${transportPlanProgramme.id}/access-code`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              code:
                transportPlanAccessCode,
              isActive: true
            })
          }
        );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to update access code'
        );
      }

      setTransportPlanAccessCode('');

      setTransportPlanMessage(
        'Campaign access code updated'
      );

      await loadTransportPlan(
        transportPlanProgramme.id
      );
    } catch (saveError) {
      setTransportPlanError(
        saveError instanceof Error
          ? saveError.message
          : 'Unable to update access code'
      );
    } finally {
      setTransportPlanSaving(false);
    }
  }


  function requestStatusLabel(
    status
  ) {
    const labels = {
      submitted:
        'Submitted',
      needs_information:
        'Needs Information',
      ready_for_planning:
        'Ready for Planning',
      planned:
        'Planned',
      confirmed:
        'Confirmed',
      cancelled:
        'Cancelled',
      completed:
        'Completed'
    };

    return (
      labels[status] ||
      String(
        status || 'Unknown'
      )
        .replaceAll('_', ' ')
        .replace(
          /\b\w/g,
          (character) =>
            character.toUpperCase()
        )
    );
  }

  function directionLabel(
    direction
  ) {
    if (
      direction === 'to_work'
    ) {
      return 'To work';
    }

    if (
      direction === 'from_work'
    ) {
      return 'From work';
    }

    return (
      String(
        direction || 'Unknown'
      )
        .replaceAll('_', ' ')
        .replace(
          /\b\w/g,
          (character) =>
            character.toUpperCase()
        )
    );
  }


  useEffect(() => {
    let cancelled = false;

    async function loadPlanningCandidates() {
      setTransportPlanningLoading(true);
      setTransportPlanningError('');

      try {
        const response =
          await fetch(
            `${API_BASE}/api/transport-operations/planning-candidates`,
            {
              credentials: 'include'
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error ||
              'Unable to load planning candidates'
          );
        }

        if (!cancelled) {
          setTransportPlanningCandidates(
            data
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setTransportPlanningError(
            loadError.message ||
              'Unable to load planning candidates'
          );
        }
      } finally {
        if (!cancelled) {
          setTransportPlanningLoading(
            false
          );
        }
      }
    }

    loadPlanningCandidates();

    return () => {
      cancelled = true;
    };
  }, [
    transportPlanningRefreshVersion
  ]);


  function openTransportCapacityCreate(
    window
  ) {
    setTransportCapacitySaveError('');
    setTransportCapacitySaveMessage('');

    setTransportCapacityEditor({
      mode: 'create',
      windowId: window.id,
      windowName: window.name,
      capacityId: null,
      vehicleType: '',
      seatCapacity: '4',
      quantity: '1',
      isUnlimited: false,
      notes: ''
    });
  }


  function openTransportCapacityEdit(
    window,
    capacity
  ) {
    setTransportCapacitySaveError('');
    setTransportCapacitySaveMessage('');

    setTransportCapacityEditor({
      mode: 'edit',
      windowId: window.id,
      windowName: window.name,
      capacityId: capacity.id,
      vehicleType:
        capacity.vehicleType || '',
      seatCapacity:
        String(
          capacity.seatCapacity ?? ''
        ),
      quantity:
        Number(
          capacity.isUnlimited
        )
          ? ''
          : String(
              capacity.quantity ?? ''
            ),
      isUnlimited:
        Number(
          capacity.isUnlimited
        ) === 1,
      notes:
        capacity.notes || ''
    });
  }


  function closeTransportCapacityEditor() {
    if (transportCapacitySaving) {
      return;
    }

    setTransportCapacityEditor(null);
    setTransportCapacitySaveError('');
  }


  function updateTransportCapacityEditor(
    field,
    value
  ) {
    setTransportCapacityEditor(
      current =>
        current
          ? {
              ...current,
              [field]: value
            }
          : current
    );
  }


  async function saveTransportCapacity(
    event
  ) {
    event.preventDefault();

    if (
      !transportOperationsIsNacAdmin ||
      !transportCapacityEditor
    ) {
      return;
    }

    const vehicleType =
      String(
        transportCapacityEditor
          .vehicleType || ''
      ).trim();

    const seatCapacity =
      Number(
        transportCapacityEditor
          .seatCapacity
      );

    const quantity =
      transportCapacityEditor
        .isUnlimited
        ? null
        : Number(
            transportCapacityEditor
              .quantity
          );

    if (!vehicleType) {
      setTransportCapacitySaveError(
        'Vehicle type is required.'
      );
      return;
    }

    if (
      !Number.isInteger(
        seatCapacity
      ) ||
      seatCapacity < 1
    ) {
      setTransportCapacitySaveError(
        'Seats per vehicle must be at least 1.'
      );
      return;
    }

    if (
      !transportCapacityEditor
        .isUnlimited &&
      (
        !Number.isInteger(
          quantity
        ) ||
        quantity < 0
      )
    ) {
      setTransportCapacitySaveError(
        'Number of vehicles must be zero or more.'
      );
      return;
    }

    setTransportCapacitySaving(true);
    setTransportCapacitySaveError('');
    setTransportCapacitySaveMessage('');

    try {
      const isEdit =
        transportCapacityEditor
          .mode === 'edit';

      const endpoint =
        isEdit
          ? `${API_BASE}/api/transport-programme-capacity/${transportCapacityEditor.capacityId}`
          : `${API_BASE}/api/transport-programme-windows/${transportCapacityEditor.windowId}/capacity`;

      const response =
        await apiFetch(
          endpoint,
          {
            method:
              isEdit
                ? 'PATCH'
                : 'POST',

            headers: {
              'Content-Type':
                'application/json'
            },

            body:
              JSON.stringify({
                vehicleType,
                seatCapacity,
                quantity,
                isUnlimited:
                  transportCapacityEditor
                    .isUnlimited,
                notes:
                  String(
                    transportCapacityEditor
                      .notes || ''
                  ).trim()
              })
          }
        );

      const data =
        await response.json()
          .catch(
            () => ({})
          );

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to save vehicle capacity'
        );
      }

      setTransportCapacityEditor(null);

      setTransportCapacitySaveMessage(
        isEdit
          ? 'Vehicle capacity updated.'
          : 'Vehicle capacity added.'
      );

      setTransportPlanningRefreshVersion(
        value =>
          value + 1
      );
    } catch (saveError) {
      setTransportCapacitySaveError(
        saveError instanceof Error
          ? saveError.message
          : 'Unable to save vehicle capacity'
      );
    } finally {
      setTransportCapacitySaving(false);
    }
  }


  const transportOperationsFilteredRequests =
    useMemo(() => {
      const source =
        overview?.requests || [];

      const needle =
        search
          .trim()
          .toLowerCase();

      const filtered =
        source.filter(
          (request) => {
            if (
              statusFilter !== 'all' &&
              request.status !== statusFilter
            ) {
              return false;
            }

            if (
              dayFilter !== 'all' &&
              request.shiftDate !== dayFilter
            ) {
              return false;
            }

            if (
              directionFilter !== 'all' &&
              request.direction !==
                directionFilter
            ) {
              return false;
            }

            if (
              pickupAreaFilter !== 'all' &&
              request.pickupArea !==
                pickupAreaFilter
            ) {
              return false;
            }

            if (
              destinationAreaFilter !==
                'all' &&
              request.destinationArea !==
                destinationAreaFilter
            ) {
              return false;
            }

            if (
              attentionOnly &&
              !request.needsAttention
            ) {
              return false;
            }

            if (!needle) {
              return true;
            }

            const searchable = [
              request.passengerName,
              request.passengerMobile,
              request.passengerEmail,
              request.pickupAddress,
              request.pickupPostcode,
              request.destinationAddress,
              request.destinationPostcode,
              request.programmeName,
              request.programmeWindowName,
              request.department,
              request.budgetNumber,
              request.status,
              request.direction
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();

            return searchable.includes(
              needle
            );
          }
        );

      return [
        ...filtered
      ].sort(
        (a, b) => {
          if (
            sortBy ===
            'shift_desc'
          ) {
            return String(
              b.shiftTime || ''
            ).localeCompare(
              String(
                a.shiftTime || ''
              )
            );
          }

          if (
            sortBy ===
            'passenger_asc'
          ) {
            return String(
              a.passengerName || ''
            ).localeCompare(
              String(
                b.passengerName || ''
              ),
              undefined,
              {
                sensitivity: 'base'
              }
            );
          }

          if (
            sortBy ===
            'passenger_desc'
          ) {
            return String(
              b.passengerName || ''
            ).localeCompare(
              String(
                a.passengerName || ''
              ),
              undefined,
              {
                sensitivity: 'base'
              }
            );
          }

          if (
            sortBy ===
            'status'
          ) {
            return String(
              a.status || ''
            ).localeCompare(
              String(
                b.status || ''
              )
            );
          }

          if (
            sortBy ===
            'area'
          ) {
            return String(
              a.pickupArea || ''
            ).localeCompare(
              String(
                b.pickupArea || ''
              )
            );
          }

          return String(
            a.shiftTime || ''
          ).localeCompare(
            String(
              b.shiftTime || ''
            )
          );
        }
      );
    }, [
      overview,
      search,
      statusFilter,
      dayFilter,
      directionFilter,
      pickupAreaFilter,
      destinationAreaFilter,
      attentionOnly,
      sortBy
    ]);

  const transportOperationsFilterOptions =
    useMemo(() => {
      const requests =
        overview?.requests || [];

      function uniqueValues(
        key
      ) {
        return Array.from(
          new Set(
            requests
              .map(
                (request) =>
                  request[key]
              )
              .filter(Boolean)
          )
        ).sort();
      }

      return {
        statuses:
          uniqueValues('status'),

        days:
          uniqueValues(
            'shiftDate'
          ),

        directions:
          uniqueValues(
            'direction'
          ),

        pickupAreas:
          uniqueValues(
            'pickupArea'
          ),

        destinationAreas:
          uniqueValues(
            'destinationArea'
          )
      };
    }, [overview]);

  const transportOperationsFilteredAttention =
    useMemo(
      () =>
        transportOperationsFilteredRequests
          .filter(
            (request) =>
              request.needsAttention
          ),
      [
        transportOperationsFilteredRequests
      ]
    );

  const transportOperationsAnalysis =
    useMemo(() => {
      const requests =
        transportOperationsFilteredRequests;

      function groupBy(
        getKey,
        getLabel
      ) {
        const grouped =
          new Map();

        requests.forEach(
          (request) => {
            const key =
              getKey(request) ||
              'Unknown';

            const label =
              getLabel
                ? getLabel(
                    request,
                    key
                  )
                : key;

            const current =
              grouped.get(key) || {
                key,
                label,
                requests: 0,
                passengers: 0
              };

            current.requests += 1;
            current.passengers +=
              Number(
                request.passengerCount ||
                0
              );

            grouped.set(
              key,
              current
            );
          }
        );

        return Array.from(
          grouped.values()
        );
      }

      const days =
        groupBy(
          (request) =>
            request.shiftDate,
          (request, key) =>
            key === 'Unknown'
              ? 'Unknown'
              : `${
                  request.shiftDay ||
                  ''
                } ${key}`.trim()
        ).sort(
          (a, b) => {
            if (
              a.key === 'Unknown'
            ) {
              return 1;
            }

            if (
              b.key === 'Unknown'
            ) {
              return -1;
            }

            return String(
              a.key
            ).localeCompare(
              String(b.key)
            );
          }
        );

      const hours =
        groupBy(
          (request) =>
            request.shiftHour
        ).sort(
          (a, b) => {
            if (
              a.key === 'Unknown'
            ) {
              return 1;
            }

            if (
              b.key === 'Unknown'
            ) {
              return -1;
            }

            return String(
              a.key
            ).localeCompare(
              String(b.key)
            );
          }
        );

      function busiestFirst(
        rows
      ) {
        return rows.sort(
          (a, b) =>
            b.requests -
              a.requests ||
            b.passengers -
              a.passengers ||
            String(
              a.label
            ).localeCompare(
              String(b.label)
            )
        );
      }

      return {
        days,

        hours,

        statuses:
          busiestFirst(
            groupBy(
              (request) =>
                request.status
            )
          ),

        directions:
          busiestFirst(
            groupBy(
              (request) =>
                request.direction
            )
          ),

        pickupAreas:
          busiestFirst(
            groupBy(
              (request) =>
                request.pickupArea
            )
          ),

        destinationAreas:
          busiestFirst(
            groupBy(
              (request) =>
                request.destinationArea
            )
          )
      };
    }, [
      transportOperationsFilteredRequests
    ]);


  const transportOperationsHasFilters =
    Boolean(
      search ||
      statusFilter !== 'all' ||
      dayFilter !== 'all' ||
      directionFilter !== 'all' ||
      pickupAreaFilter !== 'all' ||
      destinationAreaFilter !== 'all' ||
      attentionOnly ||
      sortBy !== 'shift_asc'
    );

  function clearTransportOperationsFilters() {
    setSearch('');
    setStatusFilter('all');
    setDayFilter('all');
    setDirectionFilter('all');
    setPickupAreaFilter('all');
    setDestinationAreaFilter('all');
    setAttentionOnly(false);
    setSortBy('shift_asc');
  }


  function transportAnalysisPanel(
    title,
    subtitle,
    rows,
    labelFormatter = null
  ) {
    const highest =
      Math.max(
        1,
        ...rows.map(
          (row) =>
            Number(
              row.requests || 0
            )
        )
      );

    return (
      <section className="card transport-analysis-panel">
        <div className="transport-analysis-heading">
          <div>
            <small>
              Demand analysis
            </small>

            <h2>
              {title}
            </h2>

            <p>
              {subtitle}
            </p>
          </div>
        </div>

        {rows.length ? (
          <div className="transport-analysis-list">
            {rows.map(
              (row) => {
                const label =
                  labelFormatter
                    ? labelFormatter(
                        row.label,
                        row
                      )
                    : row.label;

                const width =
                  Math.max(
                    6,
                    Math.round(
                      (
                        Number(
                          row.requests ||
                          0
                        ) /
                        highest
                      ) *
                        100
                    )
                  );

                return (
                  <div
                    className="transport-analysis-row"
                    key={row.key}
                  >
                    <div className="transport-analysis-row-top">
                      <strong>
                        {label}
                      </strong>

                      <span>
                        {row.requests}
                        {' '}
                        {row.requests === 1
                          ? 'request'
                          : 'requests'}
                        {' · '}
                        {row.passengers}
                        {' '}
                        {row.passengers === 1
                          ? 'passenger'
                          : 'passengers'}
                      </span>
                    </div>

                    <div className="transport-analysis-bar">
                      <span
                        style={{
                          width:
                            `${width}%`
                        }}
                      />
                    </div>
                  </div>
                );
              }
            )}
          </div>
        ) : (
          <div className="role-dashboard-empty">
            <BarChart3 size={26}/>

            <strong>
              No matching data
            </strong>

            <span>
              Change or clear the filters
              to see this analysis.
            </span>
          </div>
        )}
      </section>
    );
  }


  if (loading) {
    return (
      <div className="card state-panel">
        Loading Special Transport operations...
      </div>
    );
  }

  const summary =
    overview?.summary || {
      totalRequests: 0,
      totalPassengers: 0,
      attentionCount: 0,
      activeCount: 0,
      cancelledCount: 0
    };

  const attention =
    transportOperationsFilteredAttention;

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            {settingsOnly
              ? 'Special Transport Settings'
              : 'Special Transport Operations'}
          </h1>

          <p>
            {settingsOnly
              ? 'Need-A-Cab Admin configuration for programmes, service windows, campaign access and vehicle capacity.'
              : 'Need-A-Cab operational view of Special Transport requests before booking and route planning.'}
          </p>
        </div>
      </div>

      {!settingsOnly && error && (
        <div className="notice error">
          {error}
        </div>
      )}

      {!settingsOnly && /* operational:overview-kpi-grid */ (
<div className="overview-kpi-grid">
        <div className="card overview-kpi">
          <small>Requests</small>

          <strong>
            {summary.totalRequests}
          </strong>

          <span>all requests</span>
        </div>

        <div className="card overview-kpi">
          <small>Passengers</small>

          <strong>
            {summary.totalPassengers}
          </strong>

          <span>people travelling</span>
        </div>

        <div className="card overview-kpi">
          <small>Active</small>

          <strong>
            {summary.activeCount}
          </strong>

          <span>open requests</span>
        </div>

        <div className="card overview-kpi">
          <small>Cancelled</small>

          <strong>
            {summary.cancelledCount}
          </strong>

          <span>requests</span>
        </div>

        <div className="card overview-kpi attention">
          <small>Needs Attention</small>

          <strong>
            {summary.attentionCount}
          </strong>

          <span>action required</span>
        </div>
      </div>
)}

      {!settingsOnly && /* operational:card nac-bookings-card transport-operations-filters transport-operations-filters-compact */ (
<section className="card nac-bookings-card transport-operations-filters transport-operations-filters-compact">
        <div className="transport-request-toolbar">
          <div>
            <small>
              Requests
            </small>

            <div className="transport-request-title-row">
              <h2>
                Special Transport Requests
              </h2>

              <span>
                <strong>
                  {
                    transportOperationsFilteredRequests
                      .length
                  }
                </strong>
                {' '}
                of
                {' '}
                <strong>
                  {overview?.requests?.length || 0}
                </strong>
                {' '}
                shown
              </span>
            </div>
          </div>

          <div className="transport-request-toolbar-actions">
            <div className="transport-request-search">
              <input
                type="search"
                value={search}
                aria-label="Search requests"
                placeholder="Search passenger, address, postcode or budget..."
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
              />
            </div>

            <button
              type="button"
              className={
                transportOperationsFiltersOpen ||
                transportOperationsActiveFilterCount
                  ? 'transport-filter-toggle active'
                  : 'transport-filter-toggle'
              }
              onClick={() =>
                setTransportOperationsFiltersOpen(
                  value => !value
                )
              }
            >
              Filters
              {transportOperationsActiveFilterCount > 0
                ? ` (${transportOperationsActiveFilterCount})`
                : ''}
            </button>
          </div>
        </div>

        {transportOperationsFiltersOpen && (
          <div className="transport-filter-drawer">
            <div className="nac-filter-grid">
              <label>
                Status

                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(
                      event.target.value
                    )
                  }
                >
                  <option value="all">
                    All statuses
                  </option>

                  {transportOperationsFilterOptions
                    .statuses
                    .map(
                      (status) => (
                        <option
                          key={status}
                          value={status}
                        >
                          {requestStatusLabel(
                            status
                          )}
                        </option>
                      )
                    )}
                </select>
              </label>

              <label>
                Service day

                <select
                  value={dayFilter}
                  onChange={(event) =>
                    setDayFilter(
                      event.target.value
                    )
                  }
                >
                  <option value="all">
                    All days
                  </option>

                  {transportOperationsFilterOptions
                    .days
                    .map(
                      (day) => (
                        <option
                          key={day}
                          value={day}
                        >
                          {day}
                        </option>
                      )
                    )}
                </select>
              </label>

              <label>
                Direction

                <select
                  value={directionFilter}
                  onChange={(event) =>
                    setDirectionFilter(
                      event.target.value
                    )
                  }
                >
                  <option value="all">
                    All directions
                  </option>

                  {transportOperationsFilterOptions
                    .directions
                    .map(
                      (direction) => (
                        <option
                          key={direction}
                          value={direction}
                        >
                          {directionLabel(
                            direction
                          )}
                        </option>
                      )
                    )}
                </select>
              </label>

              <label>
                Pickup area

                <select
                  value={pickupAreaFilter}
                  onChange={(event) =>
                    setPickupAreaFilter(
                      event.target.value
                    )
                  }
                >
                  <option value="all">
                    All pickup areas
                  </option>

                  {transportOperationsFilterOptions
                    .pickupAreas
                    .map(
                      (area) => (
                        <option
                          key={area}
                          value={area}
                        >
                          {area}
                        </option>
                      )
                    )}
                </select>
              </label>

              <label>
                Destination area

                <select
                  value={
                    destinationAreaFilter
                  }
                  onChange={(event) =>
                    setDestinationAreaFilter(
                      event.target.value
                    )
                  }
                >
                  <option value="all">
                    All destination areas
                  </option>

                  {transportOperationsFilterOptions
                    .destinationAreas
                    .map(
                      (area) => (
                        <option
                          key={area}
                          value={area}
                        >
                          {area}
                        </option>
                      )
                    )}
                </select>
              </label>

              <label>
                Sort by

                <select
                  value={sortBy}
                  onChange={(event) =>
                    setSortBy(
                      event.target.value
                    )
                  }
                >
                  <option value="shift_asc">
                    Shift — earliest first
                  </option>

                  <option value="shift_desc">
                    Shift — latest first
                  </option>

                  <option value="passenger_asc">
                    Passenger — A to Z
                  </option>

                  <option value="passenger_desc">
                    Passenger — Z to A
                  </option>

                  <option value="status">
                    Status
                  </option>

                  <option value="area">
                    Pickup area
                  </option>
                </select>
              </label>

              <label>
                Attention

                <select
                  value={
                    attentionOnly
                      ? 'attention'
                      : 'all'
                  }
                  onChange={(event) =>
                    setAttentionOnly(
                      event.target.value ===
                        'attention'
                    )
                  }
                >
                  <option value="all">
                    All requests
                  </option>

                  <option value="attention">
                    Needs attention only
                  </option>
                </select>
              </label>
            </div>

            {transportOperationsHasFilters && (
              <div className="transport-filter-actions">
                <button
                  type="button"
                  className="nac-filter-reset"
                  onClick={
                    clearTransportOperationsFilters
                  }
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        )}

      </section>
)}


      {!settingsOnly && /* operational:transport-analysis-section transport-analysis-collapsible */ (
<section className="transport-analysis-section transport-analysis-collapsible">
        <div className="transport-analysis-title">
          <div>
            <small>
              Planning view
            </small>

            <h2>
              Demand Analysis
            </h2>

            <p>
              {transportOperationsFilteredRequests.length
                ? 'Review demand patterns for the current request selection.'
                : 'No request data to analyse yet.'}
            </p>
          </div>

          <div className="transport-analysis-summary-actions">
            <span>
              {
                transportOperationsFilteredRequests
                  .length
              }
              {' '}
              matching
              {' '}
              {
                transportOperationsFilteredRequests
                  .length === 1
                  ? 'request'
                  : 'requests'
              }
            </span>

            <button
              type="button"
              className="transport-analysis-toggle"
              onClick={() =>
                setTransportAnalysisOpen(
                  value => !value
                )
              }
            >
              {transportAnalysisOpen
                ? 'Hide Analysis'
                : 'Show Analysis'}
            </button>
          </div>
        </div>

        {transportAnalysisOpen && (
          <div className="transport-analysis-grid">
            {transportAnalysisPanel(
              'By Service Day',
              'Requests and passengers by date.',
              transportOperationsAnalysis.days
            )}

            {transportAnalysisPanel(
              'By Shift Hour',
              'Demand by staff shift time.',
              transportOperationsAnalysis.hours
            )}

            {transportAnalysisPanel(
              'By Status',
              'Current request workflow position.',
              transportOperationsAnalysis.statuses,
              (label) =>
                requestStatusLabel(
                  label
                )
            )}

            {transportAnalysisPanel(
              'By Direction',
              'To-work and from-work demand.',
              transportOperationsAnalysis.directions,
              (label) =>
                directionLabel(
                  label
                )
            )}

            {transportAnalysisPanel(
              'Pickup Areas',
              'Demand grouped by pickup postcode area.',
              transportOperationsAnalysis.pickupAreas
            )}

            {transportAnalysisPanel(
              'Destination Areas',
              'Demand grouped by destination postcode area.',
              transportOperationsAnalysis.destinationAreas
            )}
          </div>
        )}
      </section>
)}


      {settingsOnly && /* transport-plan-admin-section */ (
<section className="transport-plan-admin-section">
        <div className="transport-analysis-title">
          <div>
            <small>
              Service control
            </small>

            <h2>
              Travel Plan Management
            </h2>

            <p>
              Control programme dates,
              service windows and campaign
              access without using the terminal.
            </p>
          </div>

          <span>
            {transportOperationsIsNacAdmin
              ? 'NAC Admin'
              : 'Read only'}
          </span>
        </div>

        {transportPlanError && (
          <div className="notice error">
            {transportPlanError}
          </div>
        )}

        {transportPlanMessage && (
          <div className="notice success">
            {transportPlanMessage}
          </div>
        )}

        {transportPlanLoading ? (
          <div className="card state-panel">
            Loading travel plan...
          </div>
        ) : !transportPlanProgrammes.length ? (
          <div className="card role-dashboard-empty">
            <CalendarDays size={26}/>

            <strong>
              No travel plans configured
            </strong>

            <span>
              Create the first Special Transport
              programme before adding service
              windows.
            </span>
          </div>
        ) : (
          <>
            <div className="card transport-plan-card">
              <div className="transport-plan-card-heading">
                <div>
                  <small>
                    Programme
                  </small>

                  <h3>
                    {
                      transportPlanProgramme
                        ?.name ||
                      'Travel plan'
                    }
                  </h3>
                </div>

                <div className="transport-plan-heading-actions">
                  {transportOperationsIsNacAdmin && (
                    <button
                      type="button"
                      className="transport-capacity-add-button"
                      onClick={
                        openTransportPlanCreate
                      }
                    >
                      New Travel Plan
                    </button>
                  )}

                  <label className="transport-plan-selector">
                    Plan

                  <select
                    value={
                      transportPlanProgrammeId
                    }
                    onChange={(event) =>
                      loadTransportPlan(
                        event.target.value
                      )
                    }
                  >
                    {transportPlanProgrammes
                      .map(
                        (programme) => (
                          <option
                            key={programme.id}
                            value={programme.id}
                          >
                            {programme.code}
                            {' — '}
                            {programme.name}
                          </option>
                        )
                      )}
                  </select>
                  </label>
                </div>
              </div>

              {transportPlanCreateEditor && (
                <div className="transport-plan-window-editor">
                  <div className="transport-capacity-editor-heading">
                    <strong>
                      Create Travel Plan
                    </strong>

                    <span>
                      Create the programme first,
                      then add its travel windows
                      and campaign access code.
                    </span>
                  </div>

                  <div className="transport-plan-form-grid">
                    <label>
                      Programme code

                      <input
                        type="text"
                        placeholder="e.g. XMAS-2027-28"
                        value={
                          transportPlanCreateEditor
                            .code
                        }
                        onChange={(event) =>
                          setTransportPlanCreateEditor({
                            ...transportPlanCreateEditor,
                            code:
                              event.target.value
                                .toUpperCase()
                          })
                        }
                      />
                    </label>

                    <label>
                      Programme name

                      <input
                        type="text"
                        placeholder="e.g. Christmas & New Year Staff Transport 2027/28"
                        value={
                          transportPlanCreateEditor
                            .name
                        }
                        onChange={(event) =>
                          setTransportPlanCreateEditor({
                            ...transportPlanCreateEditor,
                            name:
                              event.target.value
                          })
                        }
                      />
                    </label>

                    <label>
                      Status

                      <select
                        value={
                          transportPlanCreateEditor
                            .status
                        }
                        onChange={(event) =>
                          setTransportPlanCreateEditor({
                            ...transportPlanCreateEditor,
                            status:
                              event.target.value
                          })
                        }
                      >
                        <option value="draft">
                          Draft
                        </option>

                        <option value="open">
                          Open
                        </option>
                      </select>
                    </label>

                    <label>
                      Requests open

                      <input
                        type="datetime-local"
                        value={
                          transportPlanCreateEditor
                            .requestOpensAt
                        }
                        onChange={(event) =>
                          setTransportPlanCreateEditor({
                            ...transportPlanCreateEditor,
                            requestOpensAt:
                              event.target.value
                          })
                        }
                      />
                    </label>

                    <label>
                      Requests close

                      <input
                        type="datetime-local"
                        value={
                          transportPlanCreateEditor
                            .requestClosesAt
                        }
                        onChange={(event) =>
                          setTransportPlanCreateEditor({
                            ...transportPlanCreateEditor,
                            requestClosesAt:
                              event.target.value
                          })
                        }
                      />
                    </label>
                  </div>

                  <div className="transport-capacity-editor-actions">
                    <button
                      type="button"
                      className="transport-capacity-save-button"
                      disabled={
                        transportPlanSaving ||
                        !transportPlanCreateEditor
                          .code.trim() ||
                        !transportPlanCreateEditor
                          .name.trim()
                      }
                      onClick={
                        saveTransportPlanCreate
                      }
                    >
                      Create Plan
                    </button>

                    <button
                      type="button"
                      className="transport-capacity-cancel-button"
                      disabled={
                        transportPlanSaving
                      }
                      onClick={() =>
                        setTransportPlanCreateEditor(
                          null
                        )
                      }
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {transportPlanProgramme && (
                <div className="transport-plan-form-grid">
                  <label>
                    Programme name

                    <input
                      type="text"
                      value={
                        transportPlanProgramme
                          .name || ''
                      }
                      disabled={
                        !transportOperationsIsNacAdmin
                      }
                      onChange={(event) =>
                        setTransportPlanProgramme({
                          ...transportPlanProgramme,
                          name:
                            event.target.value
                        })
                      }
                    />
                  </label>

                  <label>
                    Status

                    <select
                      value={
                        transportPlanProgramme
                          .status || 'draft'
                      }
                      disabled={
                        !transportOperationsIsNacAdmin
                      }
                      onChange={(event) =>
                        setTransportPlanProgramme({
                          ...transportPlanProgramme,
                          status:
                            event.target.value
                        })
                      }
                    >
                      <option value="draft">
                        Draft
                      </option>
                      <option value="open">
                        Open
                      </option>
                      <option value="planning">
                        Planning
                      </option>
                      <option value="confirmation">
                        Confirmation
                      </option>
                      <option value="locked">
                        Locked
                      </option>
                      <option value="active">
                        Active
                      </option>
                      <option value="completed">
                        Completed
                      </option>
                      <option value="cancelled">
                        Cancelled
                      </option>
                    </select>
                  </label>

                  <label>
                    Requests open

                    <input
                      type="datetime-local"
                      value={
                        transportPlanDateTimeInputValue(
                          transportPlanProgramme
                            .requestOpensAt
                        )
                      }
                      disabled={
                        !transportOperationsIsNacAdmin
                      }
                      onChange={(event) =>
                        setTransportPlanProgramme({
                          ...transportPlanProgramme,
                          requestOpensAt:
                            event.target.value
                        })
                      }
                    />
                  </label>

                  <label>
                    Requests close

                    <input
                      type="datetime-local"
                      value={
                        transportPlanDateTimeInputValue(
                          transportPlanProgramme
                            .requestClosesAt
                        )
                      }
                      disabled={
                        !transportOperationsIsNacAdmin
                      }
                      onChange={(event) =>
                        setTransportPlanProgramme({
                          ...transportPlanProgramme,
                          requestClosesAt:
                            event.target.value
                        })
                      }
                    />
                  </label>

                  <label>
                    Confirmation due

                    <input
                      type="datetime-local"
                      value={
                        transportPlanDateTimeInputValue(
                          transportPlanProgramme
                            .confirmationDueAt
                        )
                      }
                      disabled={
                        !transportOperationsIsNacAdmin
                      }
                      onChange={(event) =>
                        setTransportPlanProgramme({
                          ...transportPlanProgramme,
                          confirmationDueAt:
                            event.target.value
                        })
                      }
                    />
                  </label>

                  <label>
                    Route lock

                    <input
                      type="datetime-local"
                      value={
                        transportPlanDateTimeInputValue(
                          transportPlanProgramme
                            .routeLockAt
                        )
                      }
                      disabled={
                        !transportOperationsIsNacAdmin
                      }
                      onChange={(event) =>
                        setTransportPlanProgramme({
                          ...transportPlanProgramme,
                          routeLockAt:
                            event.target.value
                        })
                      }
                    />
                  </label>
                </div>
              )}

              {transportOperationsIsNacAdmin && (
                <div className="transport-plan-actions">
                  <button
                    type="button"
                    className="transport-capacity-save-button"
                    disabled={
                      transportPlanSaving ||
                      !transportPlanProgramme
                    }
                    onClick={
                      saveTransportPlanProgramme
                    }
                  >
                    Save Programme
                  </button>
                </div>
              )}
            </div>

            <div className="card transport-plan-card">
              <div className="transport-plan-card-heading">
                <div>
                  <small>
                    Service dates
                  </small>

                  <h3>
                    Travel Windows
                  </h3>
                </div>

                {transportOperationsIsNacAdmin && (
                  <button
                    type="button"
                    className="transport-capacity-add-button"
                    onClick={
                      openTransportPlanWindowCreate
                    }
                  >
                    Add Travel Window
                  </button>
                )}
              </div>

              <div className="transport-plan-window-list">
                {transportPlanWindows.length ? (
                  transportPlanWindows.map(
                    (window) => (
                      <div
                        className="transport-plan-window-row"
                        key={window.id}
                      >
                        <div>
                          <strong>
                            {window.name}
                          </strong>

                          <span>
                            {
                              new Date(
                                window.startsAt
                              ).toLocaleString()
                            }
                            {' → '}
                            {
                              new Date(
                                window.endsAt
                              ).toLocaleString()
                            }
                          </span>
                        </div>

                        <div className="transport-plan-window-actions">
                          <span
                            className={`transport-capacity-window-status ${
                              Number(
                                window.isActive
                              )
                                ? 'configured'
                                : 'missing'
                            }`}
                          >
                            {Number(
                              window.isActive
                            )
                              ? 'Active'
                              : 'Inactive'}
                          </span>

                          {transportOperationsIsNacAdmin && (
                            <>
                              <button
                                type="button"
                                className="transport-capacity-text-button"
                                onClick={() =>
                                  openTransportPlanWindowEdit(
                                    window
                                  )
                                }
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                className="transport-capacity-text-button"
                                disabled={
                                  transportPlanSaving
                                }
                                onClick={() =>
                                  toggleTransportPlanWindow(
                                    window
                                  )
                                }
                              >
                                {Number(
                                  window.isActive
                                )
                                  ? 'Deactivate'
                                  : 'Activate'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  )
                ) : (
                  <div className="transport-capacity-config-empty">
                    <CalendarDays size={20}/>

                    <div>
                      <strong>
                        No travel windows
                      </strong>

                      <span>
                        Add Christmas Day,
                        Boxing Day, New Year or
                        another service period.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {transportPlanWindowEditor && (
                <div className="transport-plan-window-editor">
                  <div className="transport-capacity-editor-heading">
                    <strong>
                      {
                        transportPlanWindowEditor.id
                          ? 'Edit Travel Window'
                          : 'Add Travel Window'
                      }
                    </strong>
                  </div>

                  <div className="transport-plan-form-grid">
                    <label>
                      Name

                      <input
                        type="text"
                        value={
                          transportPlanWindowEditor
                            .name
                        }
                        onChange={(event) =>
                          setTransportPlanWindowEditor({
                            ...transportPlanWindowEditor,
                            name:
                              event.target.value
                          })
                        }
                      />
                    </label>

                    <label>
                      Starts

                      <input
                        type="datetime-local"
                        value={
                          transportPlanWindowEditor
                            .startsAt
                        }
                        onChange={(event) =>
                          setTransportPlanWindowEditor({
                            ...transportPlanWindowEditor,
                            startsAt:
                              event.target.value
                          })
                        }
                      />
                    </label>

                    <label>
                      Ends

                      <input
                        type="datetime-local"
                        value={
                          transportPlanWindowEditor
                            .endsAt
                        }
                        onChange={(event) =>
                          setTransportPlanWindowEditor({
                            ...transportPlanWindowEditor,
                            endsAt:
                              event.target.value
                          })
                        }
                      />
                    </label>

                    <label className="transport-plan-active-option">
                      <input
                        type="checkbox"
                        checked={
                          transportPlanWindowEditor
                            .isActive
                        }
                        onChange={(event) =>
                          setTransportPlanWindowEditor({
                            ...transportPlanWindowEditor,
                            isActive:
                              event.target.checked
                          })
                        }
                      />

                      Active
                    </label>
                  </div>

                  <div className="transport-capacity-editor-actions">
                    <button
                      type="button"
                      className="transport-capacity-save-button"
                      disabled={
                        transportPlanSaving
                      }
                      onClick={
                        saveTransportPlanWindow
                      }
                    >
                      Save Window
                    </button>

                    <button
                      type="button"
                      className="transport-capacity-cancel-button"
                      disabled={
                        transportPlanSaving
                      }
                      onClick={() =>
                        setTransportPlanWindowEditor(
                          null
                        )
                      }
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {transportOperationsIsNacAdmin && (
              <div className="card transport-plan-card">
                <div className="transport-plan-card-heading">
                  <div>
                    <small>
                      Staff access
                    </small>

                    <h3>
                      Campaign Access Code
                    </h3>

                    <p>
                      {
                        transportPlanAccess
                          ? Number(
                              transportPlanAccess
                                .isActive
                            )
                            ? 'Configured and active'
                            : 'Configured but inactive'
                          : 'Not configured'
                      }
                    </p>
                  </div>

                  {transportPlanAccess && (
                    <button
                      type="button"
                      className={
                        Number(
                          transportPlanAccess
                            .isActive
                        )
                          ? 'transport-capacity-cancel-button'
                          : 'transport-capacity-save-button'
                      }
                      disabled={
                        transportPlanSaving
                      }
                      onClick={
                        toggleTransportPlanAccess
                      }
                    >
                      {Number(
                        transportPlanAccess
                          .isActive
                      )
                        ? 'Disable Access'
                        : 'Enable Access'}
                    </button>
                  )}
                </div>

                <div className="transport-plan-access-row">
                  <label>
                    New access code

                    <input
                      type="password"
                      value={
                        transportPlanAccessCode
                      }
                      autoComplete="new-password"
                      placeholder="Enter at least 6 characters"
                      onChange={(event) =>
                        setTransportPlanAccessCode(
                          event.target.value
                        )
                      }
                    />
                  </label>

                  <button
                    type="button"
                    className="transport-capacity-save-button"
                    disabled={
                      transportPlanSaving ||
                      transportPlanAccessCode
                        .trim()
                        .length < 6
                    }
                    onClick={
                      saveTransportPlanAccess
                    }
                  >
                    Change Access Code
                  </button>
                </div>

                <small className="transport-plan-help">
                  Existing access codes are never
                  displayed. Enter a new code only
                  when you want to replace it.
                </small>
              </div>
            )}
          </>
        )}
      </section>
)}


      {settingsOnly && /* transport-capacity-config-section */ (
<section className="transport-capacity-config-section">
        <div className="transport-analysis-title">
          <div>
            <small>
              Fleet configuration
            </small>

            <h2>
              Vehicle Capacity
            </h2>

            <p>
              Vehicles available for each
              active Special Transport
              service window.
            </p>
          </div>

          {transportOperationsIsNacAdmin && (
            <span>
              NAC Admin
            </span>
          )}
        </div>

        {transportPlanningLoading ? (
          <div className="card state-panel">
            Loading vehicle capacity...
          </div>
        ) : transportPlanningError ? (
          <div className="card state-panel error">
            {transportPlanningError}
          </div>
        ) : transportPlanningCandidates
            ?.serviceWindows
            ?.length ? (
          <div className="transport-capacity-window-grid">
            {transportPlanningCandidates
              .serviceWindows
              .map(
                (window) => (
                  <article
                    className="card transport-capacity-window"
                    key={window.id}
                  >
                    <div className="transport-capacity-window-heading">
                      <div>
                        <small>
                          {window.programmeCode}
                        </small>

                        <h3>
                          {window.name}
                        </h3>

                        <p>
                          {window.programmeName}
                        </p>
                      </div>

                      <span
                        className={`transport-capacity-window-status ${
                          !window.capacityConfigured
                            ? 'missing'
                            : window.hasUnlimitedCapacity
                            ? 'unlimited'
                            : 'configured'
                        }`}
                      >
                        {!window.capacityConfigured
                          ? 'Not configured'
                          : window.hasUnlimitedCapacity
                          ? 'Unlimited'
                          : `${window.finiteSeatCapacity} seats`}
                      </span>
                    </div>

                    {window.capacity?.length ? (
                      <div className="transport-capacity-config-list">
                        {window.capacity.map(
                          (capacity) => (
                            <div
                              className="transport-capacity-config-row"
                              key={capacity.id}
                            >
                              <div>
                                <strong>
                                  {capacity.vehicleType}
                                </strong>

                                {capacity.notes && (
                                  <span>
                                    {capacity.notes}
                                  </span>
                                )}
                              </div>

                              <div className="transport-capacity-config-meta">
                                <strong>
                                  {capacity.seatCapacity}
                                  {' '}
                                  seats
                                </strong>

                                <span>
                                  {Number(
                                    capacity.isUnlimited
                                  )
                                    ? 'Unlimited vehicles'
                                    : `${
                                        capacity.quantity
                                      } vehicle${
                                        Number(
                                          capacity.quantity
                                        ) === 1
                                          ? ''
                                          : 's'
                                      }`}
                                </span>

                                {transportOperationsIsNacAdmin && (
                                  <button
                                    type="button"
                                    className="transport-capacity-text-button"
                                    onClick={() =>
                                      openTransportCapacityEdit(
                                        window,
                                        capacity
                                      )
                                    }
                                  >
                                    Edit
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    ) : (
                      <div className="transport-capacity-config-empty">
                        <AlertTriangle size={20}/>

                        <div>
                          <strong>
                            Vehicle capacity has not been configured
                          </strong>

                          <span>
                            Planning can continue for review,
                            but final vehicle allocation needs
                            a capacity configuration.
                          </span>
                        </div>
                      </div>
                    )}

                    {transportOperationsIsNacAdmin && (
                      <div className="transport-capacity-admin">
                        {transportCapacitySaveMessage &&
                          !transportCapacityEditor && (
                            <div className="transport-capacity-success">
                              {transportCapacitySaveMessage}
                            </div>
                          )}

                        {transportCapacityEditor
                          ?.windowId === window.id ? (
                          <form
                            className="transport-capacity-editor"
                            onSubmit={
                              saveTransportCapacity
                            }
                          >
                            <div className="transport-capacity-editor-heading">
                              <div>
                                <strong>
                                  {transportCapacityEditor.mode ===
                                  'edit'
                                    ? 'Edit vehicle capacity'
                                    : 'Add vehicle type'}
                                </strong>

                                <span>
                                  {window.name}
                                </span>
                              </div>
                            </div>

                            <div className="form-grid two">
                              <label>
                                Vehicle type

                                <input
                                  type="text"
                                  value={
                                    transportCapacityEditor
                                      .vehicleType
                                  }
                                  onChange={
                                    event =>
                                      updateTransportCapacityEditor(
                                        'vehicleType',
                                        event.target.value
                                      )
                                  }
                                  placeholder="e.g. Saloon"
                                  disabled={
                                    transportCapacitySaving
                                  }
                                />
                              </label>

                              <label>
                                Seats per vehicle

                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={
                                    transportCapacityEditor
                                      .seatCapacity
                                  }
                                  onChange={
                                    event =>
                                      updateTransportCapacityEditor(
                                        'seatCapacity',
                                        event.target.value
                                      )
                                  }
                                  disabled={
                                    transportCapacitySaving
                                  }
                                />
                              </label>
                            </div>

                            <div className="form-grid two">
                              <label>
                                Number of vehicles

                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={
                                    transportCapacityEditor
                                      .quantity
                                  }
                                  onChange={
                                    event =>
                                      updateTransportCapacityEditor(
                                        'quantity',
                                        event.target.value
                                      )
                                  }
                                  disabled={
                                    transportCapacitySaving ||
                                    transportCapacityEditor
                                      .isUnlimited
                                  }
                                />
                              </label>

                              <label className="transport-capacity-unlimited-option">
                                <input
                                  type="checkbox"
                                  checked={
                                    transportCapacityEditor
                                      .isUnlimited
                                  }
                                  onChange={
                                    event =>
                                      updateTransportCapacityEditor(
                                        'isUnlimited',
                                        event.target.checked
                                      )
                                  }
                                  disabled={
                                    transportCapacitySaving
                                  }
                                />

                                <span>
                                  <strong>
                                    Unlimited vehicles
                                  </strong>

                                  <small>
                                    Do not apply a fixed
                                    vehicle quantity.
                                  </small>
                                </span>
                              </label>
                            </div>

                            <label className="transport-capacity-notes-field">
                              Notes
                              <textarea
                                rows="2"
                                value={
                                  transportCapacityEditor
                                    .notes
                                }
                                onChange={
                                  event =>
                                    updateTransportCapacityEditor(
                                      'notes',
                                      event.target.value
                                    )
                                }
                                placeholder="Optional operational notes"
                                disabled={
                                  transportCapacitySaving
                                }
                              />
                            </label>

                            {transportCapacitySaveError && (
                              <div className="transport-capacity-form-error">
                                {transportCapacitySaveError}
                              </div>
                            )}

                            <div className="transport-capacity-editor-actions">
                              <button
                                type="button"
                                className="transport-capacity-cancel-button"
                                onClick={
                                  closeTransportCapacityEditor
                                }
                                disabled={
                                  transportCapacitySaving
                                }
                              >
                                Cancel
                              </button>

                              <button
                                type="submit"
                                className="transport-capacity-save-button"
                                disabled={
                                  transportCapacitySaving
                                }
                              >
                                {transportCapacitySaving
                                  ? 'Saving...'
                                  : transportCapacityEditor
                                      .mode === 'edit'
                                  ? 'Save changes'
                                  : 'Add vehicle type'}
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div className="transport-capacity-admin-actions">
                            <button
                              type="button"
                              className="transport-capacity-add-button"
                              onClick={() =>
                                openTransportCapacityCreate(
                                  window
                                )
                              }
                            >
                              <Plus size={16}/>
                              Add vehicle type
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                )
              )}
          </div>
        ) : (
          <div className="card role-dashboard-empty">
            <CalendarDays size={26}/>

            <strong>
              No active service windows
            </strong>

            <span>
              Vehicle capacity will appear
              here when a Special Transport
              service window is active.
            </span>
          </div>
        )}
      </section>
)}


      {!settingsOnly && /* transport-planning-section */ (
<section className="transport-planning-section">
        <div className="transport-analysis-title">
          <div>
            <small>
              Operational planning
            </small>

            <h2>
              Planning Candidates
            </h2>

            <p>
              Requests that have completed review
              and are ready for transport planning.
            </p>
          </div>
        </div>

        {transportPlanningLoading ? (
          <div className="card state-panel">
            Loading planning candidates...
          </div>
        ) : transportPlanningError ? (
          <div className="card state-panel error">
            {transportPlanningError}
          </div>
        ) : (
          <>
            <div className="overview-kpi-grid transport-planning-kpis">
              <div className="overview-kpi">
                <small>
                  Ready Requests
                </small>

                <strong>
                  {
                    transportPlanningCandidates
                      ?.summary
                      ?.readyRequests || 0
                  }
                </strong>

                <span>
                  ready to plan
                </span>
              </div>

              <div className="overview-kpi">
                <small>
                  Ready Passengers
                </small>

                <strong>
                  {
                    transportPlanningCandidates
                      ?.summary
                      ?.readyPassengers || 0
                  }
                </strong>

                <span>
                  people travelling
                </span>
              </div>

              <div className="overview-kpi">
                <small>
                  Planning Groups
                </small>

                <strong>
                  {
                    transportPlanningCandidates
                      ?.summary
                      ?.planningGroups || 0
                  }
                </strong>

                <span>
                  shift/direction groups
                </span>
              </div>

              <div
                className={`overview-kpi ${
                  (
                    transportPlanningCandidates
                      ?.summary
                      ?.groupsWithoutCapacity ||
                    0
                  ) > 0
                    ? 'attention'
                    : ''
                }`}
              >
                <small>
                  Capacity Missing
                </small>

                <strong>
                  {
                    transportPlanningCandidates
                      ?.summary
                      ?.groupsWithoutCapacity || 0
                  }
                </strong>

                <span>
                  groups not configured
                </span>
              </div>
            </div>

            {
              transportPlanningCandidates
                ?.groups
                ?.length ? (
                <div className="transport-planning-grid">
                  {
                    transportPlanningCandidates
                      .groups
                      .map(
                        (group) => (
                          <article
                            className="card transport-planning-group"
                            key={group.key}
                          >
                            <div className="transport-planning-group-heading">
                              <div>
                                <small>
                                  {group.shiftDay}
                                  {' · '}
                                  {group.shiftDate}
                                </small>

                                <h3>
                                  {group.shiftHour}
                                  {' · '}
                                  {directionLabel(
                                    group.direction
                                  )}
                                </h3>
                              </div>

                              <span className="transport-planning-count">
                                {group.requestCount}
                                {' '}
                                {
                                  group.requestCount === 1
                                    ? 'request'
                                    : 'requests'
                                }
                                {' · '}
                                {group.passengerCount}
                                {' '}
                                {
                                  group.passengerCount === 1
                                    ? 'passenger'
                                    : 'passengers'
                                }
                              </span>
                            </div>

                            <div className="transport-planning-areas">
                              <div>
                                <small>
                                  Pickup areas
                                </small>

                                <strong>
                                  {
                                    Object.entries(
                                      group.pickupAreas || {}
                                    )
                                      .map(
                                        ([area, count]) =>
                                          `${area} (${count})`
                                      )
                                      .join(', ') ||
                                    'None'
                                  }
                                </strong>
                              </div>

                              <div>
                                <small>
                                  Destination areas
                                </small>

                                <strong>
                                  {
                                    Object.entries(
                                      group.destinationAreas || {}
                                    )
                                      .map(
                                        ([area, count]) =>
                                          `${area} (${count})`
                                      )
                                      .join(', ') ||
                                    'None'
                                  }
                                </strong>
                              </div>
                            </div>

                            <div
                              className={`transport-capacity-state ${
                                group.capacityStatus ||
                                'not_configured'
                              }`}
                            >
                              {group.capacityStatus ===
                              'unlimited' ? (
                                <>
                                  <strong>
                                    Unlimited capacity
                                  </strong>

                                  <span>
                                    This service window has an unlimited-capacity vehicle configuration.
                                  </span>
                                </>
                              ) : group.capacityStatus ===
                                'available' ? (
                                <>
                                  <strong>
                                    Capacity available
                                  </strong>

                                  <span>
                                    {group.finiteSeatCapacity}
                                    {' '}
                                    configured seats for
                                    {' '}
                                    {group.passengerCount}
                                    {' '}
                                    passengers
                                    {group.capacitySurplus > 0
                                      ? ` · ${group.capacitySurplus} spare`
                                      : ''}
                                  </span>
                                </>
                              ) : group.capacityStatus ===
                                'shortfall' ? (
                                <>
                                  <strong>
                                    Capacity shortfall
                                  </strong>

                                  <span>
                                    {group.finiteSeatCapacity}
                                    {' '}
                                    configured seats for
                                    {' '}
                                    {group.passengerCount}
                                    {' '}
                                    passengers · short by
                                    {' '}
                                    {group.capacityShortfall}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <strong>
                                    Capacity not configured
                                  </strong>

                                  <span>
                                    Vehicle availability must be configured before final planning.
                                  </span>
                                </>
                              )}
                            </div>

                            {group.capacity?.length > 0 && (
                              <div className="transport-capacity-breakdown">
                                <small>
                                  Configured vehicles
                                </small>

                                {group.capacity.map(
                                  (capacity) => (
                                    <div
                                      className="transport-capacity-vehicle"
                                      key={capacity.id}
                                    >
                                      <strong>
                                        {capacity.vehicleType}
                                      </strong>

                                      <span>
                                        {capacity.seatCapacity}
                                        {' '}
                                        seats
                                        {' · '}
                                        {Number(
                                          capacity.isUnlimited
                                        )
                                          ? 'Unlimited'
                                          : `${
                                              capacity.quantity
                                            } vehicle${
                                              Number(
                                                capacity.quantity
                                              ) === 1
                                                ? ''
                                                : 's'
                                            }`}
                                      </span>
                                    </div>
                                  )
                                )}

                                <p>
                                  Capacity shown here is an
                                  indicative group check. Final
                                  vehicle allocation will account
                                  for overlapping journeys.
                                </p>
                              </div>
                            )}

                            <div className="transport-planning-passengers">
                              {
                                group.requests.map(
                                  (request) => (
                                    <div
                                      className="transport-planning-passenger"
                                      key={request.id}
                                    >
                                      <div>
                                        <strong>
                                          {
                                            request.passengerName
                                          }
                                        </strong>

                                        <span>
                                          {
                                            request.pickupArea
                                          }
                                          {' → '}
                                          {
                                            request.destinationArea
                                          }
                                        </span>
                                      </div>

                                      <span>
                                        {
                                          request.passengerCount
                                        }
                                        {' '}
                                        {
                                          request.passengerCount === 1
                                            ? 'passenger'
                                            : 'passengers'
                                        }
                                      </span>
                                    </div>
                                  )
                                )
                              }
                            </div>
                          </article>
                        )
                      )
                  }
                </div>
              ) : (
                <div className="card role-dashboard-empty success">
                  <CheckCircle2 size={28}/>

                  <strong>
                    No requests ready for planning
                  </strong>

                  <span>
                    Requests will appear here once UHP review marks them ready for planning.
                  </span>
                </div>
              )
            }
          </>
        )}
      </section>
)}


      {!settingsOnly && /* operational:overview-dashboard-grid nac-overview-grid */ (
<div className="overview-dashboard-grid nac-overview-grid">
        <section className="card overview-panel overview-panel-wide">
          <div className="overview-panel-heading">
            <div>
              <small>
                Operations
              </small>

              <h2>
                Request Overview
              </h2>

              <p>
                Current Special Transport
                demand held locally in the
                portal.
              </p>
            </div>
          </div>

          {transportOperationsFilteredRequests.length ? (
            <div className="overview-booking-list">
              {transportOperationsFilteredRequests
                .map(
                  (request) => (
                    <div
                      className="overview-booking-row"
                      key={request.id}
                    >
                      <div className="overview-booking-time">
                        <strong>
                          {request.shiftDate}
                        </strong>

                        <small>
                          {request.shiftHour}
                        </small>
                      </div>

                      <div className="overview-booking-main">
                        <strong>
                          {request.passengerName ||
                            'Passenger'}
                        </strong>

                        <small>
                          {request.pickupArea ||
                            '—'}
                          {' → '}
                          {request.destinationArea ||
                            '—'}
                          {' · '}
                          {directionLabel(
                            request.direction
                          )}
                        </small>
                      </div>

                      <div className="overview-booking-meta">
                        <span className="badge">
                          {requestStatusLabel(
                            request.status
                          )}
                        </span>
                      </div>
                    </div>
                  )
                )}
            </div>
          ) : (
            <div className="role-dashboard-empty">
              <CalendarDays size={28}/>

              <strong>
                {overview?.requests?.length
                  ? 'No matching requests'
                  : 'No requests yet'}
              </strong>

              <span>
                {overview?.requests?.length
                  ? 'Change or clear the filters to see more requests.'
                  : 'Special Transport requests will appear here.'}
              </span>
            </div>
          )}
        </section>

        <section className="card overview-panel">
          <div className="overview-panel-heading">
            <div>
              <small>
                Attention queue
              </small>

              <h2>
                Needs Attention
              </h2>

              <p>
                Requests requiring an
                operational check before
                planning.
              </p>
            </div>

            <strong className="overview-panel-count">
              {attention.length}
            </strong>
          </div>

          {attention.length ? (
            <div className="overview-booking-list">
              {attention
                .map(
                  (request) => (
                    <div
                      className="overview-booking-row"
                      key={request.id}
                    >
                      <div className="overview-booking-time">
                        <strong>
                          {request.shiftDate}
                        </strong>

                        <small>
                          {request.shiftHour}
                        </small>
                      </div>

                      <div className="overview-booking-main">
                        <strong>
                          {request.passengerName ||
                            'Passenger'}
                        </strong>

                        <small>
                          {(
                            request
                              .attentionReasons ||
                            []
                          ).join(' · ')}
                        </small>
                      </div>

                      <div className="overview-booking-meta">
                        <span className="status-attention-chip">
                          Needs Attention
                        </span>
                      </div>
                    </div>
                  )
                )}
            </div>
          ) : (
            <div className="role-dashboard-empty success">
              <CheckCircle2 size={28}/>

              <strong>
                Nothing needs attention
              </strong>

              <span>
                All current requests are
                ready for their next stage.
              </span>
            </div>
          )}
        </section>
      </div>
)}
    </>
  );
}



function BookerDashboard({
  currentUser
}) {
  const [bookings, setBookings] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [selectedBooking, setSelectedBooking] =
    useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      setError('');

      try {
        const response =
          await apiFetch(
            `${API_BASE}/api/my-bookings`
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              'Unable to load your bookings'
          );
        }

        if (!cancelled) {
          setBookings(
            data.bookings ?? []
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load dashboard'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  const dashboard = useMemo(() => {
    const now = new Date();

    const dayValue = (date) =>
      [
        date.getFullYear(),
        String(
          date.getMonth() + 1
        ).padStart(2, '0'),
        String(
          date.getDate()
        ).padStart(2, '0')
      ].join('-');

    const today = dayValue(now);

    const tomorrowDate =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1
      );

    const tomorrow =
      dayValue(tomorrowDate);

    const sevenDays =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 7,
        23,
        59,
        59
      );

    const terminal =
      new Set([
        'completed',
        'cancelled',
        'no_show',
        'no_fare',
        'failed'
      ]);

    const upcoming =
      bookings
        .filter((booking) => {
          if (
            terminal.has(
              booking.operationalStatus
            )
          ) {
            return false;
          }

          const pickup =
            new Date(
              String(
                booking.requestedPickupAt ||
                  ''
              ).replace(' ', 'T')
            );

          return (
            !Number.isNaN(
              pickup.getTime()
            ) &&
            pickup.getTime() >=
              now.getTime()
          );
        })
        .sort(
          (a, b) =>
            new Date(
              String(
                a.requestedPickupAt
              ).replace(' ', 'T')
            ) -
            new Date(
              String(
                b.requestedPickupAt
              ).replace(' ', 'T')
            )
        );

    const todayBookings =
      upcoming.filter(
        (booking) =>
          String(
            booking.requestedPickupAt ||
              ''
          ).slice(0, 10) === today
      );

    const tomorrowBookings =
      upcoming.filter(
        (booking) =>
          String(
            booking.requestedPickupAt ||
              ''
          ).slice(0, 10) === tomorrow
      );

    const nextSevenDays =
      upcoming.filter((booking) => {
        const pickup =
          new Date(
            String(
              booking.requestedPickupAt ||
                ''
            ).replace(' ', 'T')
          );

        return (
          !Number.isNaN(
            pickup.getTime()
          ) &&
          pickup <= sevenDays
        );
      });

    const needsAttention =
      bookings.filter(
        (booking) =>
          booking.operationalStatus ===
            'requires_review' ||
          booking.financialStatus ===
            'coding_required' ||
          booking.financialStatus ===
            'pending_review' ||
          booking.financialStatus ===
            'disputed' ||
          booking.financialStatus ===
            'adjustment_required'
      );

    return {
      upcoming,
      todayBookings,
      tomorrowBookings,
      nextSevenDays,
      needsAttention,
      nextBooking:
        upcoming[0] ?? null
    };
  }, [bookings]);

  if (loading) {
    return (
      <div className="card state-panel">
        Loading your dashboard...
      </div>
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>My Transport Dashboard</h1>

          <p>
            Your upcoming UHP transport
            bookings at a glance.
          </p>
        </div>
      </div>

      {error && (
        <div className="notice error">
          {error}
        </div>
      )}

      <div className="role-dashboard-kpis">
        <div className="card role-dashboard-kpi">
          <small>Today</small>
          <strong>
            {
              dashboard
                .todayBookings
                .length
            }
          </strong>
          <span>bookings</span>
        </div>

        <div className="card role-dashboard-kpi">
          <small>Tomorrow</small>
          <strong>
            {
              dashboard
                .tomorrowBookings
                .length
            }
          </strong>
          <span>bookings</span>
        </div>

        <div className="card role-dashboard-kpi">
          <small>Next 7 Days</small>
          <strong>
            {
              dashboard
                .nextSevenDays
                .length
            }
          </strong>
          <span>bookings</span>
        </div>

        <div className="card role-dashboard-kpi attention">
          <small>Needs Attention</small>
          <strong>
            {
              dashboard
                .needsAttention
                .length
            }
          </strong>
          <span>items</span>
        </div>
      </div>

      <div className="role-dashboard-grid booker-dashboard-grid">
        <section className="card role-dashboard-panel role-next-booking">
          <div className="role-panel-heading">
            <div>
              <small>Next booking</small>
              <h2>
                {dashboard.nextBooking
                  ? formatBookingDateTime(
                      dashboard
                        .nextBooking
                        .requestedPickupAt
                    )
                  : 'No upcoming booking'}
              </h2>
            </div>
          </div>

          {dashboard.nextBooking ? (
            <button
              type="button"
              className="role-feature-booking"
              onClick={() =>
                setSelectedBooking(
                  dashboard.nextBooking
                )
              }
            >
              <div>
                <strong>
                  {
                    dashboard
                      .nextBooking
                      .passengerName
                  }
                </strong>

                <span>
                  {
                    dashboard
                      .nextBooking
                      .pickupAddress
                  }
                </span>

                <span className="role-route-arrow">
                  ↓
                </span>

                <span>
                  {
                    dashboard
                      .nextBooking
                      .destinationAddress
                  }
                </span>
              </div>

              <span
                className={
                  `badge ${
                    dashboard
                      .nextBooking
                      .operationalStatus
                  }`
                }
              >
                {formatOperationalStatus(
                  dashboard
                    .nextBooking
                    .operationalStatus
                )}
              </span>
            </button>
          ) : (
            <div className="role-dashboard-empty">
              <CalendarDays size={28}/>

              <strong>
                Nothing upcoming
              </strong>

              <span>
                Your next booking will
                appear here.
              </span>
            </div>
          )}
        </section>

        <section className="card role-dashboard-panel">
          <div className="role-panel-heading">
            <div>
              <small>Upcoming</small>
              <h2>My Bookings</h2>
            </div>
          </div>

          {dashboard.upcoming.length ? (
            <div className="role-booking-list">
              {dashboard.upcoming
                .slice(0, 6)
                .map((booking) => (
                <button
                  type="button"
                  className="role-booking-row"
                  key={booking.id}
                  onClick={() =>
                    setSelectedBooking(
                      booking
                    )
                  }
                >
                  <div>
                    <strong>
                      {formatBookingDateTime(
                        booking
                          .requestedPickupAt
                      )}
                    </strong>

                    <span>
                      {
                        booking
                          .passengerName
                      }
                    </span>

                    <small>
                      {booking.pickupAddress}
                      {' → '}
                      {
                        booking
                          .destinationAddress
                      }
                    </small>
                  </div>

                  <span
                    className={
                      `badge ${
                        booking
                          .operationalStatus
                      }`
                    }
                  >
                    {formatOperationalStatus(
                      booking
                        .operationalStatus
                    )}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="role-dashboard-empty">
              <CheckCircle2 size={28}/>

              <strong>
                No upcoming bookings
              </strong>

              <span>
                There is nothing requiring
                your attention.
              </span>
            </div>
          )}
        </section>
      </div>

      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          context="uhp"
          onClose={() =>
            setSelectedBooking(null)
          }
        />
      )}
    </>
  );
}


function BudgetHolderDashboard({
  currentUser
}) {
  const [bookings, setBookings] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [selectedBooking, setSelectedBooking] =
    useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      setError('');

      try {
        const response =
          await apiFetch(
            `${API_BASE}/api/budget-bookings`
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              'Unable to load budget bookings'
          );
        }

        if (!cancelled) {
          setBookings(
            data.bookings ?? []
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load dashboard'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  const dashboard = useMemo(() => {
    const now = new Date();

    const today =
      [
        now.getFullYear(),
        String(
          now.getMonth() + 1
        ).padStart(2, '0'),
        String(
          now.getDate()
        ).padStart(2, '0')
      ].join('-');

    const monthPrefix =
      today.slice(0, 7);

    const terminal =
      new Set([
        'completed',
        'cancelled',
        'no_show',
        'no_fare',
        'failed'
      ]);

    const upcoming =
      bookings
        .filter((booking) => {
          if (
            terminal.has(
              booking.operationalStatus
            )
          ) {
            return false;
          }

          const pickup =
            new Date(
              String(
                booking.requestedPickupAt ||
                  ''
              ).replace(' ', 'T')
            );

          return (
            !Number.isNaN(
              pickup.getTime()
            ) &&
            pickup.getTime() >=
              now.getTime()
          );
        })
        .sort(
          (a, b) =>
            new Date(
              String(
                a.requestedPickupAt
              ).replace(' ', 'T')
            ) -
            new Date(
              String(
                b.requestedPickupAt
              ).replace(' ', 'T')
            )
        );

    const todayBookings =
      bookings.filter(
        (booking) =>
          String(
            booking.requestedPickupAt ||
              ''
          ).slice(0, 10) === today
      );

    const monthBookings =
      bookings.filter(
        (booking) =>
          String(
            booking.requestedPickupAt ||
              ''
          ).slice(0, 7) ===
            monthPrefix
      );

    const needsAttention =
      bookings.filter(
        (booking) =>
          booking.operationalStatus ===
            'requires_review' ||
          booking.financialStatus ===
            'coding_required' ||
          booking.financialStatus ===
            'pending_review' ||
          booking.financialStatus ===
            'disputed' ||
          booking.financialStatus ===
            'adjustment_required'
      );

    const budgets =
      new Map();

    for (const booking of bookings) {
      const key =
        String(
          booking.budgetId ||
            booking.budgetNumber ||
            'uncoded'
        );

      if (!budgets.has(key)) {
        budgets.set(key, {
          key,
          budgetNumber:
            booking.budgetNumber ||
              'No budget',
          budgetName:
            booking.budgetName ||
              'Unallocated',
          upcoming: 0,
          thisMonth: 0,
          attention: 0
        });
      }

      const row =
        budgets.get(key);

      if (
        upcoming.some(
          (item) =>
            item.id === booking.id
        )
      ) {
        row.upcoming += 1;
      }

      if (
        String(
          booking.requestedPickupAt ||
            ''
        ).slice(0, 7) ===
          monthPrefix
      ) {
        row.thisMonth += 1;
      }

      if (
        needsAttention.some(
          (item) =>
            item.id === booking.id
        )
      ) {
        row.attention += 1;
      }
    }

    return {
      upcoming,
      todayBookings,
      monthBookings,
      needsAttention,
      budgets:
        [...budgets.values()]
          .sort(
            (a, b) =>
              a.budgetNumber
                .localeCompare(
                  b.budgetNumber
                )
          )
    };
  }, [bookings]);

  if (loading) {
    return (
      <div className="card state-panel">
        Loading budget overview...
      </div>
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Budget Overview</h1>

          <p>
            Transport activity and coding
            across the budgets you oversee.
          </p>
        </div>
      </div>

      {error && (
        <div className="notice error">
          {error}
        </div>
      )}

      <div className="role-dashboard-kpis">
        <div className="card role-dashboard-kpi">
          <small>Today</small>

          <strong>
            {
              dashboard
                .todayBookings
                .length
            }
          </strong>

          <span>bookings</span>
        </div>

        <div className="card role-dashboard-kpi">
          <small>Upcoming</small>

          <strong>
            {
              dashboard
                .upcoming
                .length
            }
          </strong>

          <span>bookings</span>
        </div>

        <div className="card role-dashboard-kpi">
          <small>This Month</small>

          <strong>
            {
              dashboard
                .monthBookings
                .length
            }
          </strong>

          <span>bookings</span>
        </div>

        <div className="card role-dashboard-kpi attention">
          <small>Needs Attention</small>

          <strong>
            {
              dashboard
                .needsAttention
                .length
            }
          </strong>

          <span>items</span>
        </div>
      </div>

      <div className="role-dashboard-grid">
        <section className="card role-dashboard-panel">
          <div className="role-panel-heading">
            <div>
              <small>Controlled budgets</small>
              <h2>My Budgets</h2>
            </div>
          </div>

          {dashboard.budgets.length ? (
            <div className="budget-overview-table">
              <div className="budget-overview-header">
                <span>Budget</span>
                <span>Upcoming</span>
                <span>This Month</span>
                <span>Attention</span>
              </div>

              {dashboard.budgets.map(
                (budget) => (
                <div
                  className="budget-overview-row"
                  key={budget.key}
                >
                  <div>
                    <strong>
                      {
                        budget
                          .budgetNumber
                      }
                    </strong>

                    <small>
                      {budget.budgetName}
                    </small>
                  </div>

                  <span>
                    {budget.upcoming}
                  </span>

                  <span>
                    {budget.thisMonth}
                  </span>

                  <span
                    className={
                      budget.attention
                        ? 'attention-count'
                        : ''
                    }
                  >
                    {budget.attention}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="role-dashboard-empty">
              <CalendarDays size={28}/>

              <strong>
                No budget activity
              </strong>
            </div>
          )}
        </section>

        <section className="card role-dashboard-panel">
          <div className="role-panel-heading">
            <div>
              <small>Review</small>
              <h2>Needs Attention</h2>
            </div>
          </div>

          {dashboard.needsAttention.length ? (
            <div className="role-booking-list">
              {dashboard
                .needsAttention
                .slice(0, 6)
                .map((booking) => (
                <button
                  type="button"
                  className="role-booking-row"
                  key={booking.id}
                  onClick={() =>
                    setSelectedBooking(
                      booking
                    )
                  }
                >
                  <div>
                    <strong>
                      {
                        booking
                          .budgetNumber ||
                        'No budget'
                      }
                    </strong>

                    <span>
                      {
                        booking
                          .passengerName
                      }
                    </span>

                    <small>
                      {formatBookingDateTime(
                        booking
                          .requestedPickupAt
                      )}
                    </small>
                  </div>

                  <span className="attention-label">
                    Needs Attention
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="role-dashboard-empty success">
              <CheckCircle2 size={28}/>

              <strong>
                Nothing needs attention
              </strong>

              <span>
                Your budgets currently have
                no review items.
              </span>
            </div>
          )}
        </section>
      </div>

      <section className="card role-dashboard-panel role-dashboard-wide">
        <div className="role-panel-heading">
          <div>
            <small>Next journeys</small>
            <h2>Upcoming Bookings</h2>
          </div>
        </div>

        {dashboard.upcoming.length ? (
          <div className="role-booking-list">
            {dashboard.upcoming
              .slice(0, 8)
              .map((booking) => (
              <button
                type="button"
                className="role-booking-row"
                key={booking.id}
                onClick={() =>
                  setSelectedBooking(
                    booking
                  )
                }
              >
                <div>
                  <strong>
                    {formatBookingDateTime(
                      booking
                        .requestedPickupAt
                    )}
                  </strong>

                  <span>
                    {
                      booking
                        .passengerName
                    }
                  </span>

                  <small>
                    {booking.pickupAddress}
                    {' → '}
                    {
                      booking
                        .destinationAddress
                    }
                  </small>
                </div>

                <div className="role-booking-budget">
                  <strong>
                    {
                      booking
                        .budgetNumber ||
                      '—'
                    }
                  </strong>

                  <small>
                    {
                      booking
                        .budgetName ||
                      ''
                    }
                  </small>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="role-dashboard-empty">
            <CalendarDays size={28}/>

            <strong>
              No upcoming bookings
            </strong>
          </div>
        )}
      </section>

      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          context="uhp"
          onClose={() =>
            setSelectedBooking(null)
          }
        />
      )}
    </>
  );
}



function UhpAdminDashboard() {
  const [bookings, setBookings] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [selectedBooking, setSelectedBooking] =
    useState(null);

  useEscapeClose(
    Boolean(selectedBooking),
    () => setSelectedBooking(null)
  );

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      setError('');

      try {
        const response =
          await apiFetch(
            `${API_BASE}/api/uhp/bookings`
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              'Unable to load dashboard'
          );
        }

        if (!cancelled) {
          setBookings(
            data.bookings ?? []
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load dashboard'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  const dashboard = useMemo(() => {
    const now = new Date();

    const today =
      [
        now.getFullYear(),
        String(
          now.getMonth() + 1
        ).padStart(2, '0'),
        String(
          now.getDate()
        ).padStart(2, '0')
      ].join('-');

    const terminal =
      new Set([
        'completed',
        'cancelled',
        'no_show',
        'no_fare',
        'failed'
      ]);

    const todaysBookings =
      bookings.filter(
        (booking) =>
          String(
            booking.requestedPickupAt ||
              ''
          ).slice(0, 10) === today
      );

    const live =
      bookings.filter(
        (booking) =>
          bookingStatusGroup(
            booking
          ) === 'live'
      );

    const completedToday =
      todaysBookings.filter(
        (booking) =>
          booking.operationalStatus ===
            'completed'
      );

    const cancelledOrNoFareToday =
      todaysBookings.filter(
        (booking) =>
          [
            'cancelled',
            'no_show',
            'no_fare'
          ].includes(
            booking.operationalStatus
          )
      );

    const upcoming =
      bookings
        .filter((booking) => {
          if (
            terminal.has(
              booking.operationalStatus
            )
          ) {
            return false;
          }

          const pickup =
            new Date(
              String(
                booking.requestedPickupAt ||
                  ''
              ).replace(' ', 'T')
            );

          return (
            !Number.isNaN(
              pickup.getTime()
            ) &&
            pickup.getTime() >=
              now.getTime()
          );
        })
        .sort(
          (a, b) =>
            new Date(
              String(
                a.requestedPickupAt
              ).replace(' ', 'T')
            ) -
            new Date(
              String(
                b.requestedPickupAt
              ).replace(' ', 'T')
            )
        );

    const operationalAttention =
      bookings.filter(
        (booking) =>
          booking.operationalStatus ===
            'requires_review' ||
          booking.operationalStatus ===
            'failed' ||
          bookingIsStale(booking) ||
          bookingIsOverdue(booking)
      );

    const financialAttention =
      bookings.filter(
        (booking) =>
          [
            'coding_required',
            'pending_review',
            'disputed',
            'adjustment_required'
          ].includes(
            booking.financialStatus
          )
      );

    const attentionIds =
      new Set([
        ...operationalAttention.map(
          (booking) => booking.id
        ),
        ...financialAttention.map(
          (booking) => booking.id
        )
      ]);

    const recent =
      [...bookings]
        .sort(
          (a, b) =>
            new Date(
              String(
                bookingDisplayBookedAt(b) ||
                  ''
              ).replace(' ', 'T')
            ) -
            new Date(
              String(
                bookingDisplayBookedAt(a) ||
                  ''
              ).replace(' ', 'T')
            )
        )
        .slice(0, 6);

    return {
      todaysBookings,
      live,
      completedToday,
      cancelledOrNoFareToday,
      upcoming,
      operationalAttention,
      financialAttention,
      needsAttention:
        attentionIds.size,
      recent
    };
  }, [bookings]);

  function accountBookingRow(
    booking,
    options = {}
  ) {
    const {
      showOperationalAttention = false,
      showFinancialAttention = false
    } = options;

    return (
      <button
        type="button"
        className="overview-booking-row"
        key={booking.id}
        onClick={() =>
          setSelectedBooking(booking)
        }
      >
        <div className="overview-booking-time">
          <strong>
            {formatBookingDateTime(
              booking.requestedPickupAt
            )}
          </strong>

          <small>
            {autocabBookingPrimary(
              booking
            )}
          </small>
        </div>

        <div className="overview-booking-main">
          <strong>
            {booking.passengerName ||
              'Passenger'}
          </strong>

          <small>
            {booking.pickupAddress ||
              '—'}
            {' → '}
            {booking.destinationAddress ||
              '—'}
          </small>
        </div>

        <div className="overview-booking-meta">
          <span
            className={
              `badge ${
                booking.operationalStatus
              }`
            }
          >
            {formatOperationalStatus(
              booking.operationalStatus
            )}
          </span>

          {showOperationalAttention &&
            bookingIsOverdue(
              booking
            ) && (
            <span className="status-attention-chip">
              Status overdue
            </span>
          )}

          {showOperationalAttention &&
            bookingIsStale(
              booking
            ) && (
            <span className="status-attention-chip">
              Status stale
            </span>
          )}

          {showOperationalAttention &&
            booking.operationalStatus ===
              'requires_review' && (
            <span className="status-attention-chip">
              Needs Attention
            </span>
          )}

          {showFinancialAttention &&
            booking.financialStatus ===
              'coding_required' && (
            <span className="financial-attention-chip">
              Coding required
            </span>
          )}

          {showFinancialAttention &&
            booking.financialStatus ===
              'pending_review' && (
            <span className="financial-attention-chip">
              Financial review
            </span>
          )}

          {showFinancialAttention &&
            booking.financialStatus ===
              'disputed' && (
            <span className="financial-attention-chip">
              Disputed
            </span>
          )}

          {showFinancialAttention &&
            booking.financialStatus ===
              'adjustment_required' && (
            <span className="financial-attention-chip">
              Adjustment required
            </span>
          )}
        </div>
      </button>
    );
  }

  if (loading) {
    return (
      <div className="card state-panel">
        Loading UHP dashboard...
      </div>
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>UHP Transport Dashboard</h1>

          <p>
            Whole-account view of hospital
            transport activity, operational
            attention and financial workload.
          </p>
        </div>
      </div>

      {error && (
        <div className="notice error">
          {error}
        </div>
      )}

      <div className="overview-kpi-grid">
        <div className="card overview-kpi">
          <small>Today</small>

          <strong>
            {
              dashboard
                .todaysBookings
                .length
            }
          </strong>

          <span>journeys</span>
        </div>

        <div className="card overview-kpi">
          <small>Upcoming</small>

          <strong>
            {
              dashboard
                .upcoming
                .length
            }
          </strong>

          <span>future journeys</span>
        </div>

        <div className="card overview-kpi">
          <small>Live</small>

          <strong>
            {dashboard.live.length}
          </strong>

          <span>in progress</span>
        </div>

        <div className="card overview-kpi">
          <small>Completed</small>

          <strong>
            {
              dashboard
                .completedToday
                .length
            }
          </strong>

          <span>today</span>
        </div>

        <div className="card overview-kpi">
          <small>Cancelled / No Fare</small>

          <strong>
            {
              dashboard
                .cancelledOrNoFareToday
                .length
            }
          </strong>

          <span>today</span>
        </div>

        <div className="card overview-kpi attention">
          <small>Needs Attention</small>

          <strong>
            {dashboard.needsAttention}
          </strong>

          <span>account items</span>
        </div>
      </div>

      <div className="overview-dashboard-grid">
        <section className="card overview-panel overview-panel-wide">
          <div className="overview-panel-heading">
            <div>
              <small>Account activity</small>

              <h2>
                Upcoming Journeys
              </h2>

              <p>
                Next hospital transport
                bookings across UHP.
              </p>
            </div>
          </div>

          {dashboard.upcoming.length ? (
            <div className="overview-booking-list">
              {dashboard.upcoming
                .slice(0, 8)
                .map(
                  (booking) =>
                    accountBookingRow(
                      booking
                    )
                )}
            </div>
          ) : (
            <div className="role-dashboard-empty">
              <CalendarDays size={28}/>

              <strong>
                No upcoming journeys
              </strong>

              <span>
                Future UHP bookings will
                appear here.
              </span>
            </div>
          )}
        </section>

        <section className="card overview-panel">
          <div className="overview-panel-heading">
            <div>
              <small>Operations</small>

              <h2>
                Operational Attention
              </h2>

              <p>
                Journeys whose operational
                status may need checking.
              </p>
            </div>

            <strong className="overview-panel-count">
              {
                dashboard
                  .operationalAttention
                  .length
              }
            </strong>
          </div>

          {dashboard
            .operationalAttention
            .length ? (
            <div className="overview-booking-list">
              {dashboard
                .operationalAttention
                .slice(0, 5)
                .map(
                  (booking) =>
                    accountBookingRow(
                      booking,
                      {
                        showOperationalAttention:
                          true
                      }
                    )
                )}
            </div>
          ) : (
            <div className="role-dashboard-empty success">
              <CheckCircle2 size={28}/>

              <strong>
                Operations clear
              </strong>

              <span>
                No journeys currently
                require operational attention.
              </span>
            </div>
          )}
        </section>

        <section className="card overview-panel">
          <div className="overview-panel-heading">
            <div>
              <small>Finance</small>

              <h2>
                Financial Attention
              </h2>

              <p>
                Coding, review, dispute and
                adjustment workload.
              </p>
            </div>

            <strong className="overview-panel-count finance">
              {
                dashboard
                  .financialAttention
                  .length
              }
            </strong>
          </div>

          {dashboard
            .financialAttention
            .length ? (
            <div className="overview-booking-list">
              {dashboard
                .financialAttention
                .slice(0, 5)
                .map(
                  (booking) =>
                    accountBookingRow(
                      booking,
                      {
                        showFinancialAttention:
                          true
                      }
                    )
                )}
            </div>
          ) : (
            <div className="role-dashboard-empty success">
              <CheckCircle2 size={28}/>

              <strong>
                Financial review clear
              </strong>

              <span>
                No bookings currently
                require financial attention.
              </span>
            </div>
          )}
        </section>

        <section className="card overview-panel overview-panel-wide">
          <div className="overview-panel-heading">
            <div>
              <small>Account history</small>

              <h2>Recent Activity</h2>

              <p>
                Latest transport bookings
                received by the portal.
              </p>
            </div>
          </div>

          {dashboard.recent.length ? (
            <div className="overview-booking-list">
              {dashboard.recent.map(
                (booking) =>
                  accountBookingRow(
                    booking
                  )
              )}
            </div>
          ) : (
            <div className="role-dashboard-empty">
              <CalendarDays size={28}/>

              <strong>
                No recent activity
              </strong>
            </div>
          )}
        </section>
      </div>

      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          context="uhp"
          onClose={() =>
            setSelectedBooking(null)
          }
        />
      )}
    </>
  );
}


function UsersPage() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [roles, setRoles] = useState([]);

  const [query, setQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [showAddUser, setShowAddUser] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    departmentId: '',
    roleCode: 'booker',
    budgetIds: []
  });

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const [
        usersResponse,
        departmentsResponse,
        budgetsResponse,
        rolesResponse
      ] = await Promise.all([
        apiFetch(`${API_BASE}/api/users`),
        apiFetch(`${API_BASE}/api/departments`),
        apiFetch(`${API_BASE}/api/budgets`),
        apiFetch(`${API_BASE}/api/roles`)
      ]);

      if (
        !usersResponse.ok ||
        !departmentsResponse.ok ||
        !budgetsResponse.ok ||
        !rolesResponse.ok
      ) {
        throw new Error('Unable to load administration data');
      }

      const usersData = await usersResponse.json();
      const departmentsData = await departmentsResponse.json();
      const budgetsData = await budgetsResponse.json();
      const rolesData = await rolesResponse.json();

      setUsers(usersData.users ?? []);
      setDepartments(departmentsData.departments ?? []);
      setBudgets(budgetsData.budgets ?? []);
      setRoles(rolesData.roles ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load users'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const stats = useMemo(() => {
    return {
      active: users.filter((u) => u.status === 'active').length,
      invited: users.filter((u) => u.status === 'invited').length,
      budgetHolders: users.filter((u) =>
        String(u.roles || '').toLowerCase().includes('budget holder')
      ).length,
      suspended: users.filter((u) => u.status === 'suspended').length
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return users.filter((user) => {
      const matchesQuery =
        !normalizedQuery ||
        [
          user.firstName,
          user.lastName,
          user.email,
          user.department,
          user.roles,
          user.budgets
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);

      const matchesDepartment =
        departmentFilter === 'all' ||
        String(user.departmentId) === departmentFilter;

      const matchesStatus =
        statusFilter === 'all' ||
        user.status === statusFilter;

      return matchesQuery && matchesDepartment && matchesStatus;
    });
  }, [users, query, departmentFilter, statusFilter]);

  function resetForm() {
    setForm({
      firstName: '',
      lastName: '',
      email: '',
      departmentId: '',
      roleCode: 'booker',
      budgetIds: []
    });
  }

  function toggleBudget(budgetId) {
    setForm((current) => {
      const exists = current.budgetIds.includes(budgetId);

      return {
        ...current,
        budgetIds: exists
          ? current.budgetIds.filter((id) => id !== budgetId)
          : [...current.budgetIds, budgetId]
      };
    });
  }

  async function submitUser(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');

    try {
      const response = await apiFetch(
        `${API_BASE}/api/users`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ...form,
            departmentId: Number(form.departmentId)
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Unable to create user');
      }

      setNotice(
        `${form.firstName} ${form.lastName} has been invited.`
      );

      setShowAddUser(false);
      resetForm();
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to create user'
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(user, status) {
    const labels = {
      active: 'reactivate',
      suspended: 'suspend',
      archived: 'archive'
    };

    const action = labels[status] || 'update';

    if (
      !window.confirm(
        `Are you sure you want to ${action} ${user.firstName} ${user.lastName}?`
      )
    ) {
      return;
    }

    setError('');
    setNotice('');

    try {
      const response = await apiFetch(
        `${API_BASE}/api/users/${user.id}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Unable to update user');
      }

      setNotice(
        `${user.firstName} ${user.lastName} is now ${formatStatus(status).toLowerCase()}.`
      );

      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to update user'
      );
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Users</h1>
          <p>Manage hospital access without exposing complex permission settings.</p>
        </div>

        <button
          className="primary"
          onClick={() => {
            setError('');
            setNotice('');
            setShowAddUser(true);
          }}
        >
          <Plus size={18}/>
          Add User
        </button>
      </div>

      {notice && (
        <div className="notice success">
          {notice}
        </div>
      )}

      {error && !loading && (
        <div className="notice error">
          {error}
        </div>
      )}

      <div className="stats-grid">
        <Stat icon={<UsersRound/>} label="Active Users" value={stats.active} />
        <Stat icon={<Clock3/>} label="Invited" value={stats.invited} />
        <Stat icon={<CheckCircle2/>} label="Budget Holders" value={stats.budgetHolders} />
        <Stat icon={<AlertTriangle/>} label="Suspended" value={stats.suspended} />
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search compact">
            <Search size={17}/>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users..."
            />
          </div>

          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
          >
            <option value="all">All departments</option>
            {departments.map((department) => (
              <option key={department.id} value={String(department.id)}>
                {department.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="suspended">Suspended</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {loading && (
          <div className="state-panel">
            Loading users...
          </div>
        )}

        {!loading && !error && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Department</th>
                  <th>Role</th>
                  <th>Budget Access</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>
                        {user.firstName} {user.lastName}
                      </strong>
                      <small>{user.email}</small>
                    </td>

                    <td>{user.department || '—'}</td>
                    <td>{user.roles || '—'}</td>
                    <td>{user.budgets || '—'}</td>

                    <td>
                      <span className={`badge ${user.status}`}>
                        {formatStatus(user.status)}
                      </span>
                    </td>

                    <td>
                      <div className="row-actions">
                        {user.status !== 'active' && (
                          <button
                            className="text-action"
                            onClick={() => changeStatus(user, 'active')}
                          >
                            Reactivate
                          </button>
                        )}

                        {user.status === 'active' && (
                          <button
                            className="text-action warning"
                            onClick={() => changeStatus(user, 'suspended')}
                          >
                            Suspend
                          </button>
                        )}

                        {user.status !== 'archived' && (
                          <button
                            className="text-action danger"
                            onClick={() => changeStatus(user, 'archived')}
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan="6">
                      <div className="empty-table">
                        No users match the current filters.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddUser && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setShowAddUser(false);
            }
          }}
        >
          <form className="modal-card" onSubmit={submitUser}>
            <div className="modal-header">
              <div>
                <h2>Add User</h2>
                <p>
                  Invite a hospital user and assign their initial access.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={() => setShowAddUser(false)}
                disabled={saving}
              >
                ×
              </button>
            </div>

            <div className="form-grid two">
              <label>
                First Name
                <input
                  required
                  value={form.firstName}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      firstName: e.target.value
                    })
                  }
                />
              </label>

              <label>
                Last Name
                <input
                  required
                  value={form.lastName}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      lastName: e.target.value
                    })
                  }
                />
              </label>
            </div>

            <label>
              Email
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) =>
                  setForm({
                    ...form,
                    email: e.target.value
                  })
                }
              />
            </label>

            <div className="form-grid two">
              <label>
                Department
                <select
                  required
                  value={form.departmentId}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      departmentId: e.target.value
                    })
                  }
                >
                  <option value="">Select department...</option>

                  {departments
                    .filter((department) => department.status === 'active')
                    .map((department) => (
                      <option
                        key={department.id}
                        value={department.id}
                      >
                        {department.name}
                      </option>
                    ))}
                </select>
              </label>

              <label>
                Role
                <select
                  required
                  value={form.roleCode}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      roleCode: e.target.value
                    })
                  }
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.code}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <fieldset className="budget-picker">
              <legend>Budget Access</legend>
              <p>
                Select the budgets this user is allowed to access.
              </p>

              <div className="budget-options">
                {budgets
                  .filter((budget) => budget.status === 'active')
                  .map((budget) => (
                    <label
                      key={budget.id}
                      className="budget-option"
                    >
                      <input
                        type="checkbox"
                        checked={form.budgetIds.includes(budget.id)}
                        onChange={() => toggleBudget(budget.id)}
                      />

                      <span>
                        <strong>{budget.budgetNumber}</strong>
                        <small>
                          {budget.name}
                          {budget.department
                            ? ` · ${budget.department}`
                            : ''}
                        </small>
                      </span>
                    </label>
                  ))}
              </div>
            </fieldset>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowAddUser(false)}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Send Invite'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}





function formatOperationalStatus(status) {
  const map = {
    draft: 'Request Recorded',
    submitting: 'Sending to Dispatch',
    cancelling: 'Cancelling',
    booked: 'Booked',
    confirmed: 'Confirmed',
    driver_allocated: 'Driver Allocated',
    driver_en_route: 'Driver En Route',
    driver_arrived: 'Driver Arrived',
    passenger_on_board: 'Passenger On Board',
    completed: 'Completed',
    cancelled: 'Cancelled',
    no_show: 'No Show',
    no_fare: 'No Fare',
    failed: 'Failed',
    requires_review: 'Needs Attention'
  };

  return map[status] || formatStatus(status);
}

function formatBookingDateTime(value) {
  if (!value) return '—';

  return value
    .replace('T', ' ')
    .slice(0, 16);
}


function friendlyAutocabText(value) {
  if (!value) return '—';

  return String(value)
    .replace(/[._]+/g, ' ')
    .replace(
      /([a-z0-9])([A-Z])/g,
      '$1 $2'
    )
    .replace(/\s+/g, ' ')
    .trim();
}


function bookingDisplayBooker(booking) {
  if (
    booking?.source === 'portal' &&
    booking?.createdBy
  ) {
    return booking.createdBy;
  }

  if (booking?.autocabBookedBy) {
    return friendlyAutocabText(
      booking.autocabBookedBy
    );
  }

  if (booking?.createdBy) {
    return booking.createdBy;
  }

  return booking?.source === 'portal'
    ? 'Portal user unavailable'
    : 'Autocab / external booking';
}


function bookingDisplaySource(booking) {
  if (booking?.source === 'portal') {
    return 'UHP Transport Portal';
  }

  if (booking?.autocabBookingSource) {
    return friendlyAutocabText(
      booking.autocabBookingSource
    );
  }

  return booking?.source
    ? formatStatus(booking.source)
    : '—';
}


function bookingDisplayBookedAt(booking) {
  return (
    booking?.autocabBookedAt ||
    booking?.submittedAt ||
    booking?.createdAt ||
    null
  );
}


function bookingHasVisiblePortalReference(
  booking
) {
  return (
    booking?.source === 'portal' &&
    Boolean(booking?.publicReference)
  );
}


const LIVE_OPERATIONAL_STATUSES =
  new Set([
    'driver_allocated',
    'driver_en_route',
    'driver_arrived',
    'passenger_on_board'
  ]);


const BOOKED_OPERATIONAL_STATUSES =
  new Set([
    'draft',
    'submitting',
    'cancelling',
    'booked',
    'confirmed',
    'requires_review'
  ]);


const CANCELLABLE_OPERATIONAL_STATUSES =
  new Set([
    'draft',
    'booked',
    'confirmed',
    'driver_allocated',
    'driver_en_route',
    'driver_arrived'
  ]);


function bookingStatusGroup(booking) {
  const status =
    booking?.operationalStatus;

  if (
    LIVE_OPERATIONAL_STATUSES.has(
      status
    )
  ) {
    if (
      booking?.liveState === 'stale'
    ) {
      return 'stale';
    }

    return 'live';
  }

  if (
    BOOKED_OPERATIONAL_STATUSES.has(
      status
    )
  ) {
    return 'booked';
  }

  if (status === 'completed') {
    return 'completed';
  }

  if (status === 'no_fare') {
    return 'no_fare';
  }

  if (status === 'cancelled') {
    return 'cancelled';
  }

  return 'other';
}


function bookingIsStale(booking) {
  return (
    booking?.liveState === 'stale' &&
    LIVE_OPERATIONAL_STATUSES.has(
      booking?.operationalStatus
    )
  );
}


function bookingIsOverdue(booking) {
  if (
    bookingStatusGroup(booking) !==
      'booked' ||
    !booking?.requestedPickupAt
  ) {
    return false;
  }

  const pickup =
    new Date(
      String(
        booking.requestedPickupAt
      ).replace(' ', 'T')
    );

  if (
    Number.isNaN(
      pickup.getTime()
    )
  ) {
    return false;
  }

  return pickup.getTime() < Date.now();
}


function bookingSearchText(booking) {
  return [
    booking?.autocabBookingId,
    booking?.publicReference,
    booking?.autocabReference,
    booking?.passengerName,
    booking?.passengerMobile,
    booking?.pickupAddress,
    booking?.destinationAddress,
    booking?.budgetNumber,
    booking?.budgetName,
    booking?.reasonCode,
    booking?.reasonDescription,
    booking?.createdBy,
    booking?.autocabBookedBy,
    bookingDisplayBooker(booking),
    booking?.department
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}


function useEscapeClose(
  active,
  onClose
) {
  useEffect(() => {
    if (!active) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      onClose();
    }

    document.addEventListener(
      'keydown',
      handleKeyDown
    );

    return () => {
      document.removeEventListener(
        'keydown',
        handleKeyDown
      );
    };
  }, [
    active,
    onClose
  ]);
}



function bookingMapPointIsValid(point) {
  return (
    Number.isFinite(
      Number(point?.latitude)
    ) &&
    Number.isFinite(
      Number(point?.longitude)
    )
  );
}


function bookingMapStopLabel(
  point,
  index,
  total
) {
  if (point?.stopType === 'pickup') {
    return 'P';
  }

  if (
    point?.stopType === 'destination' ||
    index === total - 1
  ) {
    return 'D';
  }

  return String(index);
}


function bookingMapStopTitle(
  point,
  index
) {
  if (point?.stopType === 'pickup') {
    return 'Pickup';
  }

  if (point?.stopType === 'destination') {
    return 'Destination';
  }

  return `Via ${index}`;
}


function bookingCodingStatusText(status) {
  const labels = {
    valid: 'Recognised',
    invalid: 'Not recognised',
    mismatch: 'Does not match',
    not_checked: 'Not checked',
    missing: 'Missing'
  };

  return (
    labels[status] ||
    formatStatus(status || '')
  );
}


function AnimatedVehicleMarker({
  position,
  icon,
  children
}) {
  const markerRef =
    useRef(null);

  const previousPositionRef =
    useRef(position);

  useEffect(() => {
    const marker =
      markerRef.current;

    if (
      !marker ||
      !Array.isArray(position) ||
      position.length !== 2
    ) {
      return;
    }

    const previous =
      previousPositionRef.current;

    previousPositionRef.current =
      position;

    if (
      !Array.isArray(previous) ||
      previous.length !== 2
    ) {
      marker.setLatLng(position);
      return;
    }

    const fromLat =
      Number(previous[0]);

    const fromLng =
      Number(previous[1]);

    const toLat =
      Number(position[0]);

    const toLng =
      Number(position[1]);

    if (
      !Number.isFinite(fromLat) ||
      !Number.isFinite(fromLng) ||
      !Number.isFinite(toLat) ||
      !Number.isFinite(toLng)
    ) {
      marker.setLatLng(position);
      return;
    }

    if (
      fromLat === toLat &&
      fromLng === toLng
    ) {
      return;
    }

    const durationMs = 1400;
    const startedAt =
      performance.now();

    let animationFrame = null;

    function animate(now) {
      const elapsed =
        now - startedAt;

      const progress =
        Math.min(
          elapsed / durationMs,
          1
        );

      const eased =
        1 -
        Math.pow(
          1 - progress,
          3
        );

      const nextLat =
        fromLat +
        (
          toLat - fromLat
        ) * eased;

      const nextLng =
        fromLng +
        (
          toLng - fromLng
        ) * eased;

      marker.setLatLng([
        nextLat,
        nextLng
      ]);

      if (progress < 1) {
        animationFrame =
          requestAnimationFrame(
            animate
          );
      }
    }

    animationFrame =
      requestAnimationFrame(
        animate
      );

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(
          animationFrame
        );
      }
    };
  }, [position]);

  return (
    <Marker
      ref={markerRef}
      position={
        previousPositionRef.current
      }
      icon={icon}
      zIndexOffset={1000}
    >
      {children}
    </Marker>
  );
}


function BookingMapBounds({
  coordinates
}) {
  const map = useMap();

  useEffect(() => {
    if (!coordinates.length) {
      return;
    }

    const bounds =
      L.latLngBounds(
        coordinates.map(
          ([latitude, longitude]) =>
            [latitude, longitude]
        )
      );

    map.invalidateSize();

    if (coordinates.length === 1) {
      map.setView(
        coordinates[0],
        15
      );

      return;
    }

    map.fitBounds(
      bounds,
      {
        padding: [48, 48],
        maxZoom: 14
      }
    );
  }, [map, coordinates]);

  return null;
}


function BookingRouteMap({
  booking
}) {
  const routePoints =
    (
      Array.isArray(
        booking?.routePoints
      )
        ? booking.routePoints
        : []
    )
      .filter(
        bookingMapPointIsValid
      )
      .map(
        (point) => ({
          ...point,
          latitude:
            Number(point.latitude),
          longitude:
            Number(point.longitude)
        })
      )
      .sort(
        (a, b) =>
          Number(
            a.sequenceNumber ?? 0
          ) -
          Number(
            b.sequenceNumber ?? 0
          )
      );

  const hasLiveVehicle =
    booking?.liveState === 'live' &&
    Number.isFinite(
      Number(
        booking?.vehicleLatitude
      )
    ) &&
    Number.isFinite(
      Number(
        booking?.vehicleLongitude
      )
    );

  const liveVehiclePoint =
    hasLiveVehicle
      ? [
          Number(
            booking.vehicleLatitude
          ),
          Number(
            booking.vehicleLongitude
          )
        ]
      : null;

  const routeCoordinates =
    routePoints.map(
      (point) => [
        point.latitude,
        point.longitude
      ]
    );

  const routeRequestCoordinates =
    routeCoordinates
      .map(
        ([latitude, longitude]) =>
          `${longitude},${latitude}`
      )
      .join(';');

  const [
    roadRouteCoordinates,
    setRoadRouteCoordinates
  ] = useState([]);

  const [
    roadRouteState,
    setRoadRouteState
  ] = useState(
    routeCoordinates.length > 1
      ? 'loading'
      : 'idle'
  );

  useEffect(() => {
    if (
      routeCoordinates.length < 2 ||
      !routeRequestCoordinates
    ) {
      setRoadRouteCoordinates([]);
      setRoadRouteState('idle');
      return;
    }

    const controller =
      new AbortController();

    setRoadRouteCoordinates([]);
    setRoadRouteState('loading');

    const url =
      `${API_BASE}/api/routing/route?` +
      new URLSearchParams({
        coordinates:
          routeRequestCoordinates
      }).toString();

    apiFetch(
      url,
      {
        signal: controller.signal
      }
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Routing service returned ${response.status}`
          );
        }

        return response.json();
      })
      .then((data) => {
        const coordinates =
          data?.route
            ?.geometry
            ?.coordinates;

        if (
          data?.code !== 'Ok' ||
          !Array.isArray(coordinates)
        ) {
          throw new Error(
            'Routing service returned no usable route'
          );
        }

        const roadCoordinates =
          coordinates
            .map((coordinate) => {
              const longitude =
                Number(coordinate?.[0]);

              const latitude =
                Number(coordinate?.[1]);

              return [
                latitude,
                longitude
              ];
            })
            .filter(
              ([latitude, longitude]) =>
                Number.isFinite(latitude) &&
                Number.isFinite(longitude)
            );

        if (
          roadCoordinates.length < 2
        ) {
          throw new Error(
            'Routing service returned an empty route'
          );
        }

        setRoadRouteCoordinates(
          roadCoordinates
        );

        setRoadRouteState('ready');
      })
      .catch((error) => {
        if (
          error?.name ===
          'AbortError'
        ) {
          return;
        }

        setRoadRouteCoordinates([]);
        setRoadRouteState('fallback');
      });

    return () => {
      controller.abort();
    };
  }, [routeRequestCoordinates]);

  const displayedRouteCoordinates =
    roadRouteCoordinates.length > 1
      ? roadRouteCoordinates
      : routeCoordinates;

  const allCoordinates = [
    ...displayedRouteCoordinates,
    ...(
      liveVehiclePoint
        ? [liveVehiclePoint]
        : []
    )
  ];

  if (!allCoordinates.length) {
    return (
      <div className="booking-map-unavailable">
        Route coordinates are not available for this booking.
      </div>
    );
  }

  const initialCentre =
    routeCoordinates[0] ||
    liveVehiclePoint;

  const createStopPinIcon = (
    markerClass,
    label
  ) =>
    L.divIcon({
      className:
        'booking-map-div-icon booking-map-pin-wrapper',
      html: `
        <span class="booking-map-pin ${markerClass}">
          <span class="booking-map-pin-label">
            ${label}
          </span>
        </span>
      `,
      iconSize: [32, 44],
      iconAnchor: [16, 44],
      popupAnchor: [0, -39]
    });

  const pickupIcon =
    createStopPinIcon(
      'pickup',
      'P'
    );

  const destinationIcon =
    createStopPinIcon(
      'destination',
      'D'
    );

  const viaIcon = (label) =>
    createStopPinIcon(
      'via',
      label
    );

  const vehicleHeading =
    Number.isFinite(
      Number(
        booking.vehicleHeadingDegrees
      )
    )
      ? Number(
          booking.vehicleHeadingDegrees
        )
      : 0;

  const vehicleIcon =
    L.divIcon({
      className:
        'booking-map-div-icon booking-live-vehicle-icon',
      html: `
        <span class="booking-live-vehicle-marker">
          <span class="booking-live-vehicle-badge">
            <svg
              class="booking-live-vehicle-svg"
              viewBox="0 0 32 32"
              aria-hidden="true"
              focusable="false"
              style="transform:rotate(${vehicleHeading}deg)"
            >
              <g class="booking-live-vehicle-shape">
                <rect
                  x="10"
                  y="5"
                  width="12"
                  height="22"
                  rx="4"
                />
                <rect
                  x="12"
                  y="8"
                  width="8"
                  height="5"
                  rx="1.5"
                  class="booking-live-vehicle-glass"
                />
                <rect
                  x="12"
                  y="15"
                  width="8"
                  height="5"
                  rx="1.5"
                  class="booking-live-vehicle-glass"
                />
                <rect
                  x="8"
                  y="9"
                  width="3"
                  height="5"
                  rx="1"
                />
                <rect
                  x="21"
                  y="9"
                  width="3"
                  height="5"
                  rx="1"
                />
                <rect
                  x="8"
                  y="18"
                  width="3"
                  height="5"
                  rx="1"
                />
                <rect
                  x="21"
                  y="18"
                  width="3"
                  height="5"
                  rx="1"
                />
                <path
                  d="
                    M13 5
                    L16 2
                    L19 5
                    Z
                  "
                />
              </g>
            </svg>
          </span>

          <span
            class="booking-live-vehicle-status"
            aria-hidden="true"
          />
        </span>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -18]
    });

  return (
    <div className="booking-route-map-shell">
      <MapContainer
        className="booking-route-map"
        center={initialCentre}
        zoom={13}
        scrollWheelZoom={false}
      >
        {MAP_TILE_URL && (
          <TileLayer
            attribution={
              MAP_TILE_ATTRIBUTION
            }
            url={MAP_TILE_URL}
          />
        )}

        <BookingMapBounds
          coordinates={
            allCoordinates
          }
        />

        {displayedRouteCoordinates.length > 1 && (
          <Polyline
            positions={
              displayedRouteCoordinates
            }
            pathOptions={{
              weight: 4,
              opacity: 0.78
            }}
          />
        )}

        {routePoints.map(
          (point, index) => {
            const label =
              bookingMapStopLabel(
                point,
                index,
                routePoints.length
              );

            const icon =
              point.stopType ===
                'pickup'
                ? pickupIcon
                : point.stopType ===
                    'destination'
                  ? destinationIcon
                  : viaIcon(label);

            return (
              <Marker
                key={
                  `${booking.id}-map-${point.stopType}-${point.sequenceNumber ?? index}`
                }
                position={[
                  point.latitude,
                  point.longitude
                ]}
                icon={icon}
              >
                <Popup>
                  <strong>
                    {bookingMapStopTitle(
                      point,
                      index
                    )}
                  </strong>

                  <div>
                    {point.address ||
                      'Address unavailable'}
                  </div>
                </Popup>
              </Marker>
            );
          }
        )}

        {liveVehiclePoint && (
          <AnimatedVehicleMarker
            position={
              liveVehiclePoint
            }
            icon={vehicleIcon}
          >
            <Popup>
              <strong>
                Live taxi
                {booking.vehicleCallsign
                  ? ` ${booking.vehicleCallsign}`
                  : ''}
              </strong>

              {booking.driverName && (
                <div>
                  {booking.driverName}
                </div>
              )}

              {booking.vehicleRegistration && (
                <div>
                  {booking.vehicleRegistration}
                </div>
              )}

              {booking.vehicleSpeedMph !==
                null &&
                booking.vehicleSpeedMph !==
                  undefined && (
                  <div>
                    {booking.vehicleSpeedMph} mph
                    {booking.vehicleHeadingDirection
                      ? ` · ${booking.vehicleHeadingDirection}`
                      : ''}
                  </div>
                )}
            </Popup>
          </AnimatedVehicleMarker>
        )}
      </MapContainer>

      <div className="booking-map-legend">
        <span>
          <i className="booking-map-legend-dot pickup"/>
          Pickup
        </span>

        <span>
          <i className="booking-map-legend-dot via"/>
          Via
        </span>

        <span>
          <i className="booking-map-legend-dot destination"/>
          Destination
        </span>

        {liveVehiclePoint && (
          <span className="booking-map-live-legend">
            <i
              className="booking-map-live-car-symbol"
              aria-hidden="true"
            />
            Live taxi
          </span>
        )}
      </div>

      {routeCoordinates.length > 1 && (
        <div
          className={`booking-map-route-status ${roadRouteState}`}
        >
          {roadRouteState === 'ready'
            ? 'Road route shown between the booked stops.'
            : roadRouteState === 'loading'
              ? 'Loading road route…'
              : roadRouteState === 'fallback'
                ? 'Road routing is unavailable. Showing the booked stops with an approximate route.'
                : ''}
        </div>
      )}
    </div>
  );
}


function formatBookingAuditEvent(event) {
  const labels = {
    booking_created: 'Booking Created',
    booking_imported: 'Booking Created',
    booking_amended: 'Booking Amended',
    booking_modified: 'Booking Modified',
    autocab_submission_started: 'Sent to Autocab',
    autocab_booking_created: 'Autocab Booking Created',
    booking_dispatch_accepted: 'Driver Allocated / Dispatched',
    booking_arrived: 'Driver Arrived',
    passenger_on_board: 'Passenger On Board',
    booking_running_late: 'Running Late',
    booking_complete: 'Booking Completed',
    booking_completed: 'Booking Completed',
    booking_cancelled: 'Booking Cancelled',
    autocab_cancellation_started: 'Cancellation Sent to Autocab',
    autocab_cancellation_succeeded: 'Cancellation Confirmed',
    no_fare: 'No Fare',
    invoice_created: 'Invoice Created',
    credit_note_issued: 'Credit Note Issued'
  };

  return (
    labels[event?.eventType] ||
    String(event?.eventType || 'Booking Event')
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (character) =>
        character.toUpperCase()
      )
  );
}


function bookingEventPayload(event) {
  if (
    !event?.rawPayload
  ) {
    return null;
  }

  if (
    typeof event.rawPayload ===
      'object'
  ) {
    return event.rawPayload;
  }

  try {
    return JSON.parse(
      event.rawPayload
    );
  } catch {
    return null;
  }
}


function bookingAmendmentChanges(event) {
  if (
    event?.eventType !==
      'booking_amended'
  ) {
    return [];
  }

  const payload =
    bookingEventPayload(event);

  return Array.isArray(
    payload?.changes
  )
    ? payload.changes
        .filter(
          (change) =>
            change &&
            change.label &&
            (
              change.before !==
                undefined ||
              change.after !==
                undefined
            )
        )
    : [];
}


function formatAmendmentHistoryValue(
  change,
  value
) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ''
  ) {
    return 'None';
  }

  if (
    change?.valueType ===
      'datetime'
  ) {
    return formatBookingDateTime(
      value
    );
  }

  return String(value);
}


function formatAuditSource(source) {
  const labels = {
    autocab: 'Autocab',
    portal: 'UHP Portal',
    uhp_admin: 'UHP Portal',
    system: 'System'
  };

  return (
    labels[source] ||
    String(source || 'System')
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (character) =>
        character.toUpperCase()
      )
  );
}


function formatInternalAuditAction(action) {
  return String(action || 'Internal Action')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) =>
      character.toUpperCase()
    );
}


function BookingDetailModal({
  booking: initialBooking,
  onClose,
  context = 'uhp',
  actions = null,
  children
}) {
  const [
    liveOperational,
    setLiveOperational
  ] = useState({});

  useEscapeClose(
    Boolean(initialBooking),
    onClose
  );

  useEffect(() => {
    setLiveOperational({});

    if (!initialBooking?.id) {
      return;
    }

    const shouldTrack =
      LIVE_OPERATIONAL_STATUSES.has(
        initialBooking.operationalStatus
      ) ||
      initialBooking.liveState === 'live' ||
      initialBooking.liveState === 'stale';

    if (!shouldTrack) {
      return;
    }

    let cancelled = false;
    let timerId = null;

    async function refreshLiveState() {
      try {
        const response =
          await apiFetch(
            `${API_BASE}/api/bookings/${initialBooking.id}/live-state`
          );

        if (!response.ok) {
          return;
        }

        const data =
          await response.json();

        if (
          cancelled ||
          !data?.booking
        ) {
          return;
        }

        setLiveOperational(
          data.booking
        );

        const nextStatus =
          data.booking
            .operationalStatus;

        const stillOperational =
          LIVE_OPERATIONAL_STATUSES.has(
            nextStatus
          ) ||
          data.booking.liveState ===
            'live' ||
          data.booking.liveState ===
            'stale';

        if (
          !stillOperational &&
          timerId
        ) {
          window.clearInterval(
            timerId
          );

          timerId = null;
        }
      } catch {
        // Keep the last known operational
        // state if a refresh temporarily fails.
      }
    }

    refreshLiveState();

    timerId =
      window.setInterval(
        refreshLiveState,
        LIVE_BOOKING_REFRESH_MS
      );

    return () => {
      cancelled = true;

      if (timerId) {
        window.clearInterval(
          timerId
        );
      }
    };
  }, [
    initialBooking?.id,
    initialBooking?.operationalStatus,
    initialBooking?.liveState
  ]);

  if (!initialBooking) return null;

  const booking = {
    ...initialBooking,
    ...liveOperational
  };

  const stops =
    booking.stops?.length
      ? booking.stops
      : [
          {
            sequenceNumber: 0,
            stopType: 'pickup',
            address: booking.pickupAddress,
            postcode: booking.pickupPostcode
          },
          {
            sequenceNumber: 999,
            stopType: 'destination',
            address: booking.destinationAddress,
            postcode: booking.destinationPostcode
          }
        ].filter((stop) => stop.address);

  const history =
    booking.events ?? [];

  const internalAuditHistory =
    booking.auditEvents ?? [];

  const uhpVisibleBookingEvents =
    new Set([
      'booking_imported',
      'booking_created',
      'booking_amended',
      'autocab_submission_started',
      'autocab_booking_created',
      'booking_dispatch_accepted',
      'booking_arrived',
      'passenger_on_board',
      'booking_complete',
      'booking_completed',
      'booking_cancelled',
      'autocab_cancellation_started',
      'autocab_cancellation_succeeded',
      'no_fare'
    ]);

  const unifiedAuditHistory = [
    ...history
      .filter((event) =>
        uhpVisibleBookingEvents.has(
          event.eventType
        )
      )
      .map((event) => ({
        ...event,
        auditKey: `event-${event.id}`,
        auditType: 'booking'
      })),

    ...internalAuditHistory.map((event) => ({
      ...event,
      auditKey: `audit-${event.id}`,
      auditType: 'internal',
      eventSource: event.source || 'system',
      eventType: event.action || 'internal_action',
      oldStatus: null,
      newStatus: null,
      notes:
        event.fieldName
          ? [
              event.fieldName
                .replaceAll('_', ' ')
                .replace(/\b\w/g, (character) =>
                  character.toUpperCase()
                ),
              event.oldValue !== null &&
              event.oldValue !== undefined &&
              event.newValue !== null &&
              event.newValue !== undefined
                ? `${event.oldValue} → ${event.newValue}`
                : event.newValue !== null &&
                    event.newValue !== undefined
                  ? String(event.newValue)
                  : null
            ]
              .filter(Boolean)
              .join(': ')
          : null
    }))
  ]
    .sort((left, right) => {
      const leftTime =
        Date.parse(left.eventAt || '') || 0;

      const rightTime =
        Date.parse(right.eventAt || '') || 0;

      return rightTime - leftTime;
    });

  const compactAuditHistory =
    unifiedAuditHistory.reduce(
      (items, event) => {
        const previous =
          items[items.length - 1];

        const groupable =
          event.auditType === 'booking' &&
          event.eventType === 'booking_modified' &&
          event.eventSource === 'autocab';

        if (
          groupable &&
          previous &&
          previous.auditType === 'booking' &&
          previous.eventType === 'booking_modified' &&
          previous.eventSource === 'autocab'
        ) {
          previous.repeatCount += 1;
          return items;
        }

        items.push({
          ...event,
          repeatCount: 1
        });

        return items;
      },
      []
    );

  const isNac =
    context === 'nac';

  const codingReviewRequired =
    booking.financialStatus ===
      'coding_required';

  const hasParsedCoding =
    Boolean(
      booking.parsedReasonCode ||
      booking.parsedBudgetNumber ||
      booking.parsedBudgetHolder
    );

  const hasOperationalDetail =
    Boolean(
      booking.driverName ||
      booking.driverCallsign ||
      booking.vehicleCallsign ||
      booking.vehicleRegistration ||
      booking.vehiclePlateNumber ||
      booking.acceptedAt ||
      booking.arrivedAt ||
      booking.passengerOnBoardAt ||
      booking.completedEventAt ||
      booking.cancelledEventAt ||
      booking.noFareAt ||
      booking.liveState
    );

  const operationalTimeline = [
    {
      label: 'Driver Allocated / Dispatched',
      at: booking.acceptedAt
    },
    {
      label: 'Driver Arrived',
      at: booking.arrivedAt
    },
    {
      label: 'Passenger On Board',
      at: booking.passengerOnBoardAt
    },
    {
      label: 'Completed',
      at:
        booking.completedEventAt ||
        booking.completedAt
    },
    {
      label: 'Cancelled',
      at:
        booking.cancelledEventAt ||
        booking.cancelledAt
    },
    {
      label: 'No Fare',
      at: booking.noFareAt
    }
  ].filter((item) => item.at);

  return (
    <div
      className="modal-backdrop booking-detail-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="modal-card booking-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Booking details"
      >
        <div className="booking-modal-header">
          <div>
            {bookingHasVisiblePortalReference(
              booking
            ) && (
              <div className="booking-modal-eyebrow">
                {portalBookingReference(
                  booking
                )}
              </div>
            )}

            <div className="booking-modal-title-row">
              <h2>
                {autocabBookingPrimary(booking)}
              </h2>

              <span
                className={
                  `badge ${booking.operationalStatus}`
                }
              >
                {formatOperationalStatus(
                  booking.operationalStatus
                )}
              </span>

              {(
                booking.hasBeenAmended ||
                booking.events?.some(
                  (event) =>
                    event.eventType ===
                      'booking_amended'
                )
              ) && (
                <span className="amended-chip">
                  Amended
                </span>
              )}

              {booking.hasException && (
                <span className="exception-chip">
                  Attention
                </span>
              )}
            </div>

            <p>
              {formatBookingDateTime(
                booking.requestedPickupAt
              )}
              {' · '}
              {booking.passengerName || 'Passenger'}
            </p>
          </div>

          <button
            type="button"
            className="modal-close booking-detail-close"
            onClick={onClose}
            aria-label="Close booking details"
          >
            ×
          </button>
        </div>

        <div className="booking-modal-body">
          {actions && (
            <div className="booking-modal-primary-actions">
              {actions}
            </div>
          )}

          {booking.hasException && (
            <div className="exception-panel">
              <strong>
                Attention Required
              </strong>

              {booking.exceptionReasons?.map(
                (reason) => (
                  <span key={reason}>
                    {reason}
                  </span>
                )
              )}
            </div>
          )}

          <div className="booking-modal-section">
            <div className="booking-modal-section-heading">
              <h3>Passenger & Booking</h3>
            </div>

            <div className="booking-modal-facts">
              <div>
                <small>Passenger</small>
                <strong>
                  {booking.passengerName || '—'}
                </strong>
              </div>

              <div>
                <small>Contact Number</small>
                <strong>
                  {booking.passengerMobile || '—'}
                </strong>
              </div>

              <div>
                <small>Passengers</small>
                <strong>
                  {booking.passengerCount ?? '—'}
                </strong>
              </div>

              <div>
                <small>Booked By</small>
                <strong>
                  {bookingDisplayBooker(booking)}
                </strong>
              </div>

              <div>
                <small>Booking Source</small>
                <strong>
                  {bookingDisplaySource(booking)}
                </strong>
              </div>

              <div>
                <small>Pickup Date & Time</small>
                <strong>
                  {formatBookingDateTime(
                    booking.requestedPickupAt
                  )}
                </strong>
              </div>

              <div>
                <small>Booked At</small>
                <strong>
                  {formatBookingDateTime(
                    bookingDisplayBookedAt(booking)
                  )}
                </strong>
              </div>

              <div>
                <small>Autocab Booking</small>
                <strong>
                  {booking.autocabBookingId || 'Pending'}
                </strong>
              </div>

              {bookingHasVisiblePortalReference(
                booking
              ) && (
                <div>
                  <small>
                    Portal Reference
                  </small>

                  <strong>
                    {booking.publicReference}
                  </strong>
                </div>
              )}
            </div>
          </div>

          <div className="booking-modal-columns">
            <div className="booking-modal-section">
              <div className="booking-modal-section-heading">
                <h3>Journey</h3>
              </div>

              <div className="booking-route-detail booking-modal-route">
                {stops.map((stop, index) => (
                  <div
                    className="detail-stop"
                    key={
                      `${booking.id}-${stop.sequenceNumber ?? index}`
                    }
                  >
                    <span
                      className={
                        `detail-stop-dot ${stop.stopType}`
                      }
                    />

                    <div>
                      <small>
                        {stop.stopType === 'pickup'
                          ? 'Pickup'
                          : stop.stopType === 'destination'
                            ? 'Destination'
                            : `Via ${index}`}
                      </small>

                      <strong>
                        {stop.address || '—'}
                      </strong>

                      {stop.postcode && (
                        <span>
                          {stop.postcode}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="booking-modal-map">
                <BookingRouteMap
                  booking={booking}
                />
              </div>
            </div>

            <div className="booking-modal-section">
              <div className="booking-modal-section-heading">
                <h3>UHP Coding</h3>
              </div>

              {codingReviewRequired && (
                <div className="booking-coding-review booking-coding-review-compact">
                  <div className="booking-coding-review-heading">
                    <strong>
                      Coding review required
                    </strong>

                    <span>
                      Requested Autocab coding needs matching to UHP records.
                    </span>
                  </div>

                  {hasParsedCoding && (
                    <div className="booking-coding-requested booking-coding-requested-compact">
                      <div>
                        <small>Reason</small>
                        <strong>
                          {booking.parsedReasonCode ||
                            'Not supplied'}
                        </strong>
                        {booking.codingReasonStatus && (
                          <span>
                            {bookingCodingStatusText(
                              booking.codingReasonStatus
                            )}
                          </span>
                        )}
                      </div>

                      <div>
                        <small>Budget</small>
                        <strong>
                          {booking.parsedBudgetNumber ||
                            'Not supplied'}
                        </strong>
                        {booking.codingBudgetStatus && (
                          <span>
                            {bookingCodingStatusText(
                              booking.codingBudgetStatus
                            )}
                          </span>
                        )}
                      </div>

                      <div>
                        <small>Budget Holder</small>
                        <strong>
                          {booking.parsedBudgetHolder ||
                            'Not supplied'}
                        </strong>
                        {booking.codingHolderStatus && (
                          <span>
                            {bookingCodingStatusText(
                              booking.codingHolderStatus
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="booking-modal-facts booking-modal-facts-single">
                {booking.department && (
                  <div>
                    <small>Department</small>
                    <strong>
                      {booking.department}
                    </strong>
                  </div>
                )}

                {booking.budgetNumber && (
                  <div>
                    <small>Budget</small>
                    <strong>
                      {booking.budgetNumber}
                      {booking.budgetName
                        ? ` · ${booking.budgetName}`
                        : ''}
                    </strong>
                  </div>
                )}

                {booking.budgetHolder && (
                  <div>
                    <small>Budget Holder</small>
                    <strong>
                      {booking.budgetHolder}
                    </strong>
                  </div>
                )}

                {booking.reasonCode && (
                  <div>
                    <small>Reason</small>
                    <strong>
                      {booking.reasonCode}
                      {booking.reasonDescription
                        ? ` · ${booking.reasonDescription}`
                        : ''}
                    </strong>
                  </div>
                )}

                <div>
                  <small>Financial Status</small>
                  <strong>
                    {booking.financialStatus
                      ? formatStatus(
                          booking.financialStatus
                        )
                      : '—'}
                  </strong>
                </div>

                {isNac && (
                  <div>
                    <small>OurReference</small>
                    <strong>
                      {booking.autocabReference || '—'}
                    </strong>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="booking-modal-section">
            <div className="booking-modal-section-heading">
              <h3>Notes</h3>
            </div>

            <div className="booking-modal-notes">
              <div>
                <small>Driver Notes</small>
                <p>
                  {booking.driverNotes || 'No driver notes.'}
                </p>
              </div>

              {isNac && (
                <div>
                  <small>Office / Internal Notes</small>
                  <p>
                    {booking.internalNotes ||
                      'No internal notes.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {hasOperationalDetail && (
            <>
              <div className="booking-modal-section">
                <div className="booking-modal-section-heading">
                  <h3>Driver &amp; Vehicle</h3>
                </div>

                <div className="booking-modal-facts">
                  <div>
                    <small>Driver</small>
                    <strong>
                      {booking.driverName || '—'}
                    </strong>
                  </div>

                  <div>
                    <small>Driver Callsign</small>
                    <strong>
                      {booking.driverCallsign || '—'}
                    </strong>
                  </div>

                  <div>
                    <small>Vehicle</small>
                    <strong>
                      {booking.vehicleCallsign || '—'}
                    </strong>
                  </div>

                  <div>
                    <small>Registration</small>
                    <strong>
                      {booking.vehicleRegistration || '—'}
                    </strong>
                  </div>

                  <div>
                    <small>Plate Number</small>
                    <strong>
                      {booking.vehiclePlateNumber || '—'}
                    </strong>
                  </div>

                  <div>
                    <small>Operational State</small>
                    <strong>
                      {booking.liveState === 'live'
                        ? 'Live'
                        : booking.liveState === 'stale'
                          ? 'Stale last-known status'
                          : 'Not Live'}
                    </strong>
                  </div>

                  <div>
                    <small>Last Fleet Update</small>
                    <strong>
                      {formatBookingDateTime(
                        booking.fleetStateAt
                      )}
                    </strong>
                  </div>

                  <div>
                    <small>Snapshot Captured</small>
                    <strong>
                      {formatBookingDateTime(
                        booking.identitySnapshotAt ||
                        booking.operationalSnapshotAt
                      )}
                    </strong>
                  </div>
                </div>

                {booking.liveState === 'stale' && (
                  <div className="operational-state-note stale">
                    <strong>
                      Last known Autocab status
                    </strong>

                    <span>
                      {formatOperationalStatus(
                        booking.operationalStatus
                      )}
                      {booking.liveStateReason
                        ? ` · ${booking.liveStateReason}`
                        : ''}
                    </span>
                  </div>
                )}

                {booking.liveState === 'live' &&
                  booking.vehicleLatitude !== null &&
                  booking.vehicleLatitude !== undefined &&
                  booking.vehicleLongitude !== null &&
                  booking.vehicleLongitude !== undefined && (
                    <div className="operational-state-note live">
                      <strong>
                        Live vehicle telemetry
                      </strong>

                      <span>
                        {booking.vehicleSpeedMph !== null &&
                        booking.vehicleSpeedMph !== undefined
                          ? `${booking.vehicleSpeedMph} mph`
                          : 'Position available'}

                        {booking.vehicleHeadingDirection
                          ? ` · ${booking.vehicleHeadingDirection}`
                          : ''}

                        {booking.vehiclePositionAt
                          ? ` · Updated ${formatBookingDateTime(
                              booking.vehiclePositionAt
                            )}`
                          : ''}
                      </span>
                    </div>
                  )}
              </div>

              {isNac && (
                <div className="booking-modal-section">
                  <div className="booking-modal-section-heading">
                    <h3>Operational Timeline</h3>
                  </div>

                  {operationalTimeline.length ? (
                    <div className="operational-timeline">
                      {operationalTimeline.map(
                        (item) => (
                          <div
                            className="operational-timeline-item"
                            key={`${item.label}-${item.at}`}
                          >
                            <span className="operational-timeline-dot"/>

                            <div>
                              <strong>
                                {item.label}
                              </strong>

                              <small>
                                {formatBookingDateTime(
                                  item.at
                                )}
                              </small>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    <span className="history-empty">
                      No operational timestamps recorded yet.
                    </span>
                  )}
                </div>
              )}

            </>
          )}

          {!isNac && (
            <div className="booking-modal-section booking-audit-section">
              <div className="booking-modal-section-heading">
                <h3>Booking History</h3>
              </div>

              {compactAuditHistory.length ? (
                <div className="booking-audit-log">
                  {compactAuditHistory.map((event) => {
                    const importedBooker =
                      booking.autocabBookedBy ||
                      booking.bookedBy ||
                      booking.createdBy ||
                      booking.bookerName ||
                      null;

                    let actor = 'System';

                    if (event.auditType === 'internal') {
                      actor = event.actorName
                        ? `${event.actorName} · UHP`
                        : 'UHP Portal · System';
                    } else if (
                      event.eventSource === 'portal'
                    ) {
                      actor = event.actorName
                        ? `${event.actorName} · UHP`
                        : 'UHP Portal · System';
                    } else if (
                      event.eventSource === 'autocab'
                    ) {
                      if (event.actorName) {
                        actor =
                          `${event.actorName} · Need-A-Cab`;
                      } else if (
                        (
                          event.eventType ===
                            'booking_imported' ||
                          event.eventType ===
                            'booking_created'
                        ) &&
                        importedBooker
                      ) {
                        actor =
                          `${importedBooker} · Need-A-Cab`;
                      } else {
                        actor = 'Autocab · System';
                      }
                    }

                    const title =
                      event.auditType === 'internal'
                        ? formatInternalAuditAction(
                            event.eventType
                          )
                        : formatBookingAuditEvent(
                            event
                          );

                    const amendmentChanges =
                      bookingAmendmentChanges(
                        event
                      );

                    return (
                      <div
                        className="booking-audit-item"
                        key={event.auditKey}
                      >
                        <div className="booking-audit-heading">
                          <strong>
                            {title}

                            {event.repeatCount > 1 && (
                              <span className="booking-audit-repeat">
                                ×{event.repeatCount}
                              </span>
                            )}
                          </strong>

                          <span className="booking-audit-summary">
                            {actor}

                            {event.eventType !==
                              'booking_amended' &&
                              event.oldStatus &&
                              event.newStatus &&
                              event.oldStatus !==
                                event.newStatus && (
                              <>
                                {' · '}
                                {formatOperationalStatus(
                                  event.oldStatus
                                )}
                                {' → '}
                                {formatOperationalStatus(
                                  event.newStatus
                                )}
                              </>
                            )}
                          </span>

                          <small>
                            {formatBookingDateTime(
                              event.eventAt
                            )}
                          </small>
                        </div>

                        {amendmentChanges.length > 0 && (
                          <div className="booking-audit-changes">
                            {amendmentChanges.map(
                              (
                                change,
                                changeIndex
                              ) => (
                                <div
                                  className="booking-audit-change"
                                  key={
                                    `${event.auditKey}-${change.field || changeIndex}`
                                  }
                                >
                                  <strong>
                                    {change.label}
                                  </strong>

                                  <div>
                                    <span>
                                      {formatAmendmentHistoryValue(
                                        change,
                                        change.before
                                      )}
                                    </span>

                                    <span
                                      className="booking-audit-change-arrow"
                                      aria-hidden="true"
                                    >
                                      →
                                    </span>

                                    <span>
                                      {formatAmendmentHistoryValue(
                                        change,
                                        change.after
                                      )}
                                    </span>
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        )}

                        {event.notes &&
                          amendmentChanges.length === 0 && (
                          <div className="booking-audit-notes">
                            {event.notes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <span className="history-empty">
                  No audit events recorded for this booking.
                </span>
              )}
            </div>
          )}


          {isNac && (
            <div className="booking-modal-section">
              <div className="booking-modal-section-heading">
                <h3>Job History</h3>
              </div>

              <div className="booking-history-panel booking-modal-history">
                {history.length ? (
                  history.map((event) => (
                    <div
                      className="history-event"
                      key={event.id}
                    >
                      <strong>
                        {formatStatus(
                          event.eventType
                        )}
                      </strong>

                      <span>
                        {event.eventAt}
                      </span>

                      {event.notes && (
                        <small>
                          {event.notes}
                        </small>
                      )}
                    </div>
                  ))
                ) : (
                  <span className="history-empty">
                    No recorded events.
                  </span>
                )}
              </div>
            </div>
          )}

          {children && (
            <div className="booking-modal-actions-area">
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



function NacControlPage() {
  const [summary, setSummary] =
    useState(null);

  const [bookings, setBookings] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [selectedBooking, setSelectedBooking] =
    useState(null);

  const [controlFilter, setControlFilter] =
    useState('today');

  async function loadControl() {
    setLoading(true);
    setError('');

    try {
      const [
        summaryResponse,
        bookingsResponse
      ] =
        await Promise.all([
          apiFetch(
            `${API_BASE}/api/control/summary`
          ),
          apiFetch(
            `${API_BASE}/api/control/bookings`
          )
        ]);

      const summaryData =
        await summaryResponse.json();

      const bookingData =
        await bookingsResponse.json();

      if (!summaryResponse.ok) {
        throw new Error(
          summaryData.error ||
            'Unable to load control summary'
        );
      }

      if (!bookingsResponse.ok) {
        throw new Error(
          bookingData.error ||
            'Unable to load bookings'
        );
      }

      setSummary(summaryData);

      setBookings(
        bookingData.bookings ?? []
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load control'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadControl();
  }, []);

  const dashboard = useMemo(() => {
    const now = new Date();

    const today =
      [
        now.getFullYear(),
        String(
          now.getMonth() + 1
        ).padStart(2, '0'),
        String(
          now.getDate()
        ).padStart(2, '0')
      ].join('-');

    const terminal =
      new Set([
        'completed',
        'cancelled',
        'no_show',
        'no_fare',
        'failed'
      ]);

    const todaysBookings =
      bookings
        .filter(
          (booking) =>
            String(
              booking.requestedPickupAt ||
                ''
            ).slice(0, 10) === today
        )
        .sort(
          (a, b) =>
            new Date(
              String(
                a.requestedPickupAt
              ).replace(' ', 'T')
            ) -
            new Date(
              String(
                b.requestedPickupAt
              ).replace(' ', 'T')
            )
        );

    const upcomingToday =
      todaysBookings.filter(
        (booking) => {
          if (
            terminal.has(
              booking.operationalStatus
            )
          ) {
            return false;
          }

          const pickup =
            new Date(
              String(
                booking.requestedPickupAt ||
                  ''
              ).replace(' ', 'T')
            );

          return (
            !Number.isNaN(
              pickup.getTime()
            ) &&
            pickup.getTime() >=
              now.getTime()
          );
        }
      );

    const live =
      bookings.filter(
        (booking) =>
          bookingStatusGroup(
            booking
          ) === 'live'
      );

    const completedToday =
      todaysBookings.filter(
        (booking) =>
          booking.operationalStatus ===
            'completed'
      );

    const cancelledOrNoFareToday =
      todaysBookings.filter(
        (booking) =>
          [
            'cancelled',
            'no_show',
            'no_fare'
          ].includes(
            booking.operationalStatus
          )
      );

    const operationalAttention =
      bookings
        .filter(
          (booking) =>
            booking.operationalStatus ===
              'requires_review' ||
            booking.operationalStatus ===
              'failed' ||
            bookingIsStale(booking) ||
            bookingIsOverdue(booking)
        )
        .sort(
          (a, b) => {
            const aPickup =
              new Date(
                String(
                  a.requestedPickupAt ||
                    ''
                ).replace(' ', 'T')
              );

            const bPickup =
              new Date(
                String(
                  b.requestedPickupAt ||
                    ''
                ).replace(' ', 'T')
              );

            return (
              bPickup.getTime() -
              aPickup.getTime()
            );
          }
        );

    return {
      todaysBookings,
      upcomingToday,
      live,
      completedToday,
      cancelledOrNoFareToday,
      operationalAttention
    };
  }, [bookings]);

  const controlFilterOptions = {
    today: {
      title: "Today's Journeys",
      description:
        'UHP journeys scheduled for today in pickup-time order.',
      emptyTitle: 'No journeys today',
      emptyText:
        "Today's UHP bookings will appear here.",
      bookings: dashboard.todaysBookings,
      showAttention: false
    },

    upcoming: {
      title: 'Upcoming Today',
      description:
        'UHP journeys still due to run today.',
      emptyTitle: 'No upcoming journeys',
      emptyText:
        'There are no more UHP journeys due today.',
      bookings: dashboard.upcomingToday,
      showAttention: false
    },

    live: {
      title: 'Live Journeys',
      description:
        'UHP journeys currently in progress.',
      emptyTitle: 'No live journeys',
      emptyText:
        'There are no UHP journeys currently in progress.',
      bookings: dashboard.live,
      showAttention: false
    },

    completed: {
      title: 'Completed Today',
      description:
        'UHP journeys completed today.',
      emptyTitle: 'No completed journeys',
      emptyText:
        'No UHP journeys have completed today.',
      bookings: dashboard.completedToday,
      showAttention: false
    },

    cancelled: {
      title: 'Cancelled / No Fare',
      description:
        'UHP journeys cancelled, no-show or no-fare today.',
      emptyTitle:
        'No cancelled or no-fare journeys',
      emptyText:
        'There are no cancelled, no-show or no-fare journeys today.',
      bookings:
        dashboard.cancelledOrNoFareToday,
      showAttention: false
    },

    attention: {
      title: 'Needs Attention',
      description:
        'Statuses that may require operational checking.',
      emptyTitle: 'Nothing needs attention',
      emptyText:
        'There are no operational items requiring attention.',
      bookings:
        dashboard.operationalAttention,
      showAttention: true
    }
  };

  const activeControlFilter =
    controlFilterOptions[controlFilter] ||
    controlFilterOptions.today;

  function controlBookingRow(
    booking,
    showAttention = false
  ) {
    return (
      <button
        type="button"
        className="overview-booking-row"
        key={booking.id}
        onClick={() =>
          setSelectedBooking(booking)
        }
      >
        <div className="overview-booking-time">
          <strong>
            {formatBookingDateTime(
              booking.requestedPickupAt
            )}
          </strong>

          <small>
            {autocabBookingPrimary(
              booking
            )}
          </small>
        </div>

        <div className="overview-booking-main">
          <strong>
            {booking.passengerName ||
              'Passenger'}
          </strong>

          <small>
            {booking.pickupAddress ||
              '—'}
            {' → '}
            {booking.destinationAddress ||
              '—'}
          </small>
        </div>

        <div className="overview-booking-meta">
          <span
            className={
              `badge ${
                booking.operationalStatus
              }`
            }
          >
            {formatOperationalStatus(
              booking.operationalStatus
            )}
          </span>

          {showAttention &&
            bookingIsOverdue(
              booking
            ) && (
            <span className="status-attention-chip">
              Status overdue
            </span>
          )}

          {showAttention &&
            bookingIsStale(
              booking
            ) && (
            <span className="status-attention-chip">
              Status stale
            </span>
          )}

          {showAttention &&
            booking.operationalStatus ===
              'requires_review' && (
            <span className="status-attention-chip">
              Needs Attention
            </span>
          )}
        </div>
      </button>
    );
  }

  if (loading) {
    return (
      <div className="card state-panel">
        Loading Need-A-Cab control...
      </div>
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Need-A-Cab Control</h1>

          <p>
            Today's operational view of
            UHP-funded transport.
          </p>
        </div>
      </div>

      {error && (
        <div className="notice error">
          {error}
        </div>
      )}

      <div className="overview-kpi-grid">
        {[
          {
            key: 'today',
            label: 'Today',
            count:
              dashboard.todaysBookings.length,
            detail: 'journeys'
          },
          {
            key: 'upcoming',
            label: 'Upcoming Today',
            count:
              dashboard.upcomingToday.length,
            detail: 'still to run'
          },
          {
            key: 'live',
            label: 'Live',
            count: dashboard.live.length,
            detail: 'in progress'
          },
          {
            key: 'completed',
            label: 'Completed',
            count:
              dashboard.completedToday.length,
            detail: 'today'
          },
          {
            key: 'cancelled',
            label: 'Cancelled / No Fare',
            count:
              dashboard
                .cancelledOrNoFareToday
                .length,
            detail: 'today'
          },
          {
            key: 'attention',
            label: 'Needs Attention',
            count:
              dashboard
                .operationalAttention
                .length,
            detail: 'operational items'
          }
        ].map((item) => (
          <button
            type="button"
            key={item.key}
            className={
              `card overview-kpi overview-kpi-filter ${
                item.key === 'attention'
                  ? 'attention'
                  : ''
              } ${
                controlFilter === item.key
                  ? 'selected'
                  : ''
              }`
            }
            aria-pressed={
              controlFilter === item.key
            }
            onClick={() =>
              setControlFilter(item.key)
            }
          >
            <small>{item.label}</small>
            <strong>{item.count}</strong>
            <span>{item.detail}</span>
          </button>
        ))}
      </div>

      <div className="overview-dashboard-grid nac-overview-grid">
        <section className="card overview-panel overview-panel-wide">
          <div className="overview-panel-heading">
            <div>
              <small>Daily operation</small>

              <h2>
                {activeControlFilter.title}
              </h2>

              <p>
                {
                  activeControlFilter
                    .description
                }
              </p>
            </div>
          </div>

          {activeControlFilter
            .bookings
            .length ? (
            <div className="overview-booking-list">
              {activeControlFilter
                .bookings
                .map(
                  (booking) =>
                    controlBookingRow(
                      booking,
                      activeControlFilter
                        .showAttention
                    )
                )}
            </div>
          ) : (
            <div className="role-dashboard-empty">
              <CalendarDays size={28}/>

              <strong>
                {
                  activeControlFilter
                    .emptyTitle
                }
              </strong>

              <span>
                {
                  activeControlFilter
                    .emptyText
                }
              </span>
            </div>
          )}
        </section>

        <section className="card overview-panel">
          <div className="overview-panel-heading">
            <div>
              <small>Operations</small>

              <h2>
                Needs Attention
              </h2>

              <p>
                Statuses that may require
                operational checking.
              </p>
            </div>

            <strong className="overview-panel-count">
              {
                dashboard
                  .operationalAttention
                  .length
              }
            </strong>
          </div>

          {dashboard
            .operationalAttention
            .length ? (
            <div className="overview-booking-list">
              {dashboard
                .operationalAttention
                .slice(0, 8)
                .map(
                  (booking) =>
                    controlBookingRow(
                      booking,
                      true
                    )
                )}
            </div>
          ) : (
            <div className="role-dashboard-empty success">
              <CheckCircle2 size={28}/>

              <strong>
                Operations clear
              </strong>

              <span>
                Nothing currently requires
                operational attention.
              </span>
            </div>
          )}
        </section>
      </div>

      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          context="nac"
          onClose={() =>
            setSelectedBooking(null)
          }
        />
      )}
    </>
  );
}


function NacBookingsPage({
  exceptionsOnly = false
}) {
  const [bookings, setBookings] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [budgets, setBudgets] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] =
    useState('all');
  const [departmentFilter, setDepartmentFilter] =
    useState('all');
  const [budgetFilter, setBudgetFilter] =
    useState('all');
  const [fromDate, setFromDate] =
    useState('');

  const [toDate, setToDate] =
    useState('');

  const [selectedBooking, setSelectedBooking] =
    useState(null);

  async function loadOperationalBookings() {
    setLoading(true);
    setError('');

    try {
      const [
        bookingResponse,
        departmentResponse,
        budgetResponse
      ] = await Promise.all([
        apiFetch(
          `${API_BASE}/api/control/bookings`
        ),
        apiFetch(
          `${API_BASE}/api/departments`
        ),
        apiFetch(
          `${API_BASE}/api/budgets`
        )
      ]);

      const bookingData =
        await bookingResponse.json();

      const departmentData =
        await departmentResponse.json();

      const budgetData =
        await budgetResponse.json();

      if (!bookingResponse.ok) {
        throw new Error(
          bookingData.error ||
          'Unable to load operational bookings'
        );
      }

      if (!departmentResponse.ok) {
        throw new Error(
          departmentData.error ||
          'Unable to load departments'
        );
      }

      if (!budgetResponse.ok) {
        throw new Error(
          budgetData.error ||
          'Unable to load budgets'
        );
      }

      setBookings(
        bookingData.bookings ?? []
      );

      setDepartments(
        departmentData.departments ?? []
      );

      setBudgets(
        budgetData.budgets ?? []
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load operational bookings'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOperationalBookings();
  }, []);

  const filteredBookings = useMemo(() => {
    const term =
      query.trim().toLowerCase();

    return bookings.filter((booking) => {
      if (
        exceptionsOnly &&
        !booking.hasException
      ) {
        return false;
      }

      if (
        statusFilter !== 'all' &&
        bookingStatusGroup(
          booking
        ) !== statusFilter
      ) {
        return false;
      }

      if (
        departmentFilter !== 'all' &&
        String(booking.departmentId) !==
          String(departmentFilter)
      ) {
        return false;
      }

      if (
        budgetFilter !== 'all' &&
        String(booking.budgetId) !==
          String(budgetFilter)
      ) {
        return false;
      }

      const pickupDate =
        String(
          booking.requestedPickupAt || ''
        ).slice(0, 10);

      if (
        fromDate &&
        pickupDate < fromDate
      ) {
        return false;
      }

      if (
        toDate &&
        pickupDate > toDate
      ) {
        return false;
      }

      if (!term) {
        return true;
      }

      return bookingSearchText(
        booking
      ).includes(term);
    });
  }, [
    bookings,
    exceptionsOnly,
    query,
    statusFilter,
    departmentFilter,
    budgetFilter,
    fromDate,
    toDate
  ]);

  const statusCounts = useMemo(
    () => ({
      all: bookings.length,

      live: bookings.filter(
        (booking) =>
          bookingStatusGroup(booking) ===
            'live'
      ).length,

      booked: bookings.filter(
        (booking) =>
          bookingStatusGroup(booking) ===
            'booked'
      ).length,

      completed: bookings.filter(
        (booking) =>
          bookingStatusGroup(booking) ===
            'completed'
      ).length,

      no_fare: bookings.filter(
        (booking) =>
          bookingStatusGroup(booking) ===
            'no_fare'
      ).length,

      cancelled: bookings.filter(
        (booking) =>
          bookingStatusGroup(booking) ===
            'cancelled'
      ).length
    }),
    [bookings]
  );


  if (loading) {
    return (
      <div className="card state-panel">
        Loading operational bookings...
      </div>
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            {exceptionsOnly
              ? 'UHP Exceptions'
              : 'UHP Bookings'}
          </h1>

          <p>
            {exceptionsOnly
              ? 'Bookings requiring operational or financial attention.'
              : 'All UHP-funded transport requests across the portal.'}
          </p>
        </div>
      </div>

      {error && (
        <div className="notice error">
          {error}
        </div>
      )}

      {!exceptionsOnly && (
        <div className="booking-status-cards">
          {[
            ['all', 'All', statusCounts.all],
            ['live', 'Live', statusCounts.live],
            ['booked', 'Booked', statusCounts.booked],
            ['completed', 'Completed', statusCounts.completed],
            ['no_fare', 'No Fare', statusCounts.no_fare],
            ['cancelled', 'Cancelled', statusCounts.cancelled]
          ].map(
            ([key, label, value]) => (
              <button
                key={key}
                type="button"
                className={
                  `booking-status-card ${
                    statusFilter === key
                      ? 'active'
                      : ''
                  }`
                }
                onClick={() =>
                  setStatusFilter(key)
                }
              >
                <small>{label}</small>
                <strong>{value}</strong>
              </button>
            )
          )}
        </div>
      )}

      <div className="card nac-bookings-card">
        <div className="nac-filter-grid">
          <div className="search compact">
            <Search size={17}/>

            <input
              value={query}
              onChange={(e) =>
                setQuery(e.target.value)
              }
              placeholder="Search ID, passenger, phone, journey, booked by..."
            />
          </div>

          <label className="date-filter-field">
            <span>From</span>

            <input
              type="date"
              value={fromDate}
              onChange={(e) =>
                setFromDate(
                  e.target.value
                )
              }
            />
          </label>

          <label className="date-filter-field">
            <span>To</span>

            <input
              type="date"
              value={toDate}
              onChange={(e) =>
                setToDate(
                  e.target.value
                )
              }
            />
          </label>

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value
              )
            }
          >
            <option value="all">
              All statuses
            </option>

            <option value="live">
              Live
            </option>

            <option value="booked">
              Booked
            </option>

            <option value="completed">
              Completed
            </option>

            <option value="no_fare">
              No Fare
            </option>

            <option value="cancelled">
              Cancelled
            </option>
          </select>

          <select
            value={departmentFilter}
            onChange={(e) =>
              setDepartmentFilter(
                e.target.value
              )
            }
          >
            <option value="all">
              All departments
            </option>

            {departments.map(
              (department) => (
                <option
                  key={department.id}
                  value={department.id}
                >
                  {department.name}
                </option>
              )
            )}
          </select>

          <select
            value={budgetFilter}
            onChange={(e) =>
              setBudgetFilter(
                e.target.value
              )
            }
          >
            <option value="all">
              All budgets
            </option>

            {budgets.map((budget) => (
              <option
                key={budget.id}
                value={budget.id}
              >
                {budget.budgetNumber}
              </option>
            ))}
          </select>
        </div>

        <div className="nac-results-summary">
          <strong>
            {filteredBookings.length}
          </strong>

          <span>
            {exceptionsOnly
              ? 'exceptions'
              : 'bookings'}
          </span>
        </div>

        {filteredBookings.length === 0 ? (
          <div className="empty-bookings">
            {exceptionsOnly ? (
              <AlertTriangle size={30}/>
            ) : (
              <CalendarDays size={30}/>
            )}

            <strong>
              {exceptionsOnly
                ? 'No exceptions'
                : 'No bookings found'}
            </strong>

            <span>
              {exceptionsOnly
                ? 'There are currently no bookings requiring attention.'
                : 'Adjust the filters or create a UHP transport request.'}
            </span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="bookings-table booking-list-compact nac-bookings-table">
              <thead>
                <tr>
                  <th>Date / Time</th>
                  <th>Booking</th>
                  <th>Passenger</th>
                  <th>Journey</th>
                  <th>Department</th>
                  <th>Budget</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {filteredBookings.map(
                  (booking) => {
                    return (
                      <React.Fragment
                        key={booking.id}
                      >
                        <tr
                          className={
                            `booking-row-clickable ${
                              booking.hasException
                                ? 'exception-row'
                                : ''
                            }`
                          }
                          role="button"
                          tabIndex="0"
                          onClick={() =>
                            setSelectedBooking(booking)
                          }
                          onKeyDown={(event) => {
                            if (
                              event.key === 'Enter' ||
                              event.key === ' '
                            ) {
                              event.preventDefault();
                              setSelectedBooking(booking);
                            }
                          }}
                        >
                          <td>
                            <strong>
                              {formatBookingDateTime(
                                booking.requestedPickupAt
                              )}
                            </strong>

                            <small>
                              Booked{' '}
                              {formatBookingDateTime(
                                bookingDisplayBookedAt(
                                  booking
                                )
                              )}
                            </small>
                          </td>

                          <td>
                            <strong>
                              {autocabBookingPrimary(booking)}
                            </strong>

                            {bookingHasVisiblePortalReference(
                              booking
                            ) && (
                              <small>
                                {portalBookingReference(
                                  booking
                                )}
                              </small>
                            )}
                          </td>

                          <td>
                            <strong>
                              {booking.passengerName}
                            </strong>

                            <small>
                              {booking.passengerMobile}
                            </small>
                          </td>

                          <td className="journey-cell">
                            <strong>
                              {booking.pickupAddress}
                            </strong>

                            <small>
                              to {booking.destinationAddress}
                            </small>
                          </td>

                          <td>
                            <strong>
                              {booking.department || '—'}
                            </strong>

                            <small>
                              Booked by {bookingDisplayBooker(booking)}
                            </small>
                          </td>

                          <td>
                            <strong>
                              {booking.budgetNumber}
                            </strong>

                            <small>
                              {booking.reasonCode}
                            </small>
                          </td>

                          <td>
                            <span
                              className={
                                `badge ${booking.operationalStatus}`
                              }
                            >
                              {formatOperationalStatus(
                                booking.operationalStatus
                              )}
                            </span>

                            {booking.hasBeenAmended && (
                              <span className="amended-chip">
                                Amended
                              </span>
                            )}

                            {bookingIsStale(
                              booking
                            ) && (
                              <span className="stale-chip">
                                Stale
                              </span>
                            )}

                            {bookingIsOverdue(
                              booking
                            ) && (
                              <span className="overdue-chip">
                                Overdue
                              </span>
                            )}

                            {booking.hasException && (
                              <span className="exception-chip table-exception">
                                Attention
                              </span>
                            )}
                          </td>

                        </tr>

                      </React.Fragment>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          context="nac"
          onClose={() =>
            setSelectedBooking(null)
          }
        />
      )}
    </>
  );
}


function formatMoneyFromPence(
  value,
  currency = 'GBP'
) {
  if (
    value === null ||
    value === undefined
  ) {
    return '—';
  }

  return new Intl.NumberFormat(
    'en-GB',
    {
      style: 'currency',
      currency
    }
  ).format(
    Number(value) / 100
  );
}


function autocabBookingPrimary(booking) {
  return booking?.autocabBookingId
    ? `Autocab ${booking.autocabBookingId}`
    : 'Autocab Pending';
}


function portalBookingReference(booking) {
  return booking?.publicReference
    ? `Portal Ref: ${booking.publicReference}`
    : 'Portal Ref: —';
}


function bookingNoticeReference(booking) {
  if (booking?.autocabBookingId) {
    return `Autocab ${booking.autocabBookingId}`;
  }

  if (booking?.publicReference) {
    return `Portal ${booking.publicReference}`;
  }

  return 'Booking';
}


function formatPickup(value) {
  if (!value) return '—';

  return value
    .replace('T', ' ')
    .slice(0, 16);
}


function BudgetInvoicesPage() {
  const [bookings, setBookings] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [query, setQuery] =
    useState('');

  const [statusFilter, setStatusFilter] =
    useState('all');

  useEffect(() => {
    let cancelled = false;

    async function loadInvoiceReady() {
      setLoading(true);
      setError('');

      try {
        const response = await apiFetch(
          `${API_BASE}/api/budget-invoice-ready`
        );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
            'Unable to load invoice-ready bookings'
          );
        }

        if (!cancelled) {
          setBookings(
            data.bookings ?? []
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load invoice-ready bookings'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadInvoiceReady();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredBookings =
    useMemo(() => {
      const term =
        query.trim().toLowerCase();

      return bookings.filter(
        (booking) => {
          const matchesStatus =
            statusFilter === 'all' ||
            booking.financialStatus ===
              statusFilter;

          const matchesQuery =
            !term ||
            [
              booking.autocabBookingId,
              booking.publicReference,
              booking.autocabReference,
              booking.passengerName,
              booking.pickupAddress,
              booking.destinationAddress,
              booking.budgetNumber,
              booking.budgetName,
              booking.reasonCode,
              booking.reasonDescription,
              booking.createdBy,
              booking.department
            ]
              .filter(Boolean)
              .some((value) =>
                String(value)
                  .toLowerCase()
                  .includes(term)
              );

          return (
            matchesStatus &&
            matchesQuery
          );
        }
      );
    }, [
      bookings,
      query,
      statusFilter
    ]);

  const readyCount =
    bookings.filter(
      (booking) =>
        booking.financialStatus ===
          'approved_for_invoice'
    ).length;

  const invoicedCount =
    bookings.filter(
      (booking) =>
        booking.financialStatus ===
          'invoiced'
    ).length;

  if (loading) {
    return (
      <div className="card state-panel">
        Loading invoice-ready bookings...
      </div>
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Invoices</h1>

          <p>
            View completed UHP transport that has passed financial review for budgets you oversee.
          </p>
        </div>
      </div>

      {error && (
        <div className="notice error">
          {error}
        </div>
      )}

      <div className="invoice-foundation-note">
        Fare totals, invoice numbers and downloadable invoices will appear here once completed fare data and invoice generation are integrated.
      </div>

      <div className="stats-grid">
        <Stat
          icon={<CheckCircle2/>}
          label="Ready for Invoice"
          value={readyCount}
        />

        <Stat
          icon={<WalletCards/>}
          label="Invoiced"
          value={invoicedCount}
        />
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search compact">
            <Search size={17}/>

            <input
              value={query}
              onChange={(event) =>
                setQuery(
                  event.target.value
                )
              }
              placeholder="Search invoice-ready bookings..."
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value
              )
            }
          >
            <option value="all">
              All financial statuses
            </option>

            <option value="approved_for_invoice">
              Ready for Invoice
            </option>

            <option value="invoiced">
              Invoiced
            </option>
          </select>
        </div>

        {filteredBookings.length === 0 ? (
          <div className="empty-bookings">
            <WalletCards size={30}/>

            <strong>
              No invoice-ready bookings
            </strong>

            <span>
              Completed bookings will appear here after they have been approved for invoice.
            </span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="bookings-table invoice-ready-table">
              <thead>
                <tr>
                  <th>Completed</th>
                  <th>Booking</th>
                  <th>Passenger</th>
                  <th>Journey</th>
                  <th>Budget</th>
                  <th>Reason</th>
                  <th>Booked By</th>
                  <th>Actual Fare</th>
                  <th>Financial Status</th>
                </tr>
              </thead>

              <tbody>
                {filteredBookings.map(
                  (booking) => (
                    <tr key={booking.id}>
                      <td>
                        <strong>
                          {booking.completedAt
                            ? formatPickup(
                                booking.completedAt
                              )
                            : '—'}
                        </strong>
                      </td>

                      <td>
                        <strong>
                          {autocabBookingPrimary(booking)}
                        </strong>

                        <small>
                          {portalBookingReference(booking)}
                        </small>
                      </td>

                      <td>
                        <strong>
                          {booking.passengerName}
                        </strong>
                      </td>

                      <td className="journey-cell">
                        <strong>
                          {booking.pickupAddress}
                        </strong>

                        <small>
                          to{' '}
                          {booking.destinationAddress}
                        </small>
                      </td>

                      <td>
                        <strong>
                          {booking.budgetNumber}
                        </strong>

                        <small>
                          {booking.budgetName}
                        </small>
                      </td>

                      <td>
                        <strong>
                          {booking.reasonCode}
                        </strong>

                        <small>
                          {booking.reasonDescription}
                        </small>
                      </td>

                      <td>
                        <strong>
                          {booking.createdBy || '—'}
                        </strong>
                      </td>

                      <td>
                        <strong>
                          {formatMoneyFromPence(
                            booking.grossAmountPence,
                            booking.currency || 'GBP'
                          )}
                        </strong>

                        {booking.grossAmountPence ===
                          null ||
                        booking.grossAmountPence ===
                          undefined ? (
                          <small>
                            Fare not received
                          </small>
                        ) : (
                          <small>
                            {booking.financialSource
                              ? formatStatus(
                                  booking.financialSource
                                )
                              : 'Posted fare'}
                          </small>
                        )}
                      </td>

                      <td>
                        <span
                          className={
                            `badge financial-${booking.financialStatus}`
                          }
                        >
                          {booking.financialStatus ===
                          'approved_for_invoice'
                            ? 'Ready for Invoice'
                            : formatStatus(
                                booking.financialStatus
                              )}
                        </span>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}



function CodingReviewPage() {
  const [bookings, setBookings] =
    useState([]);

  const [options, setOptions] =
    useState({
      reasonCodes: [],
      budgets: []
    });

  const [selectedBookingId, setSelectedBookingId] =
    useState(null);

  const [form, setForm] =
    useState({
      reasonCodeId: '',
      budgetId: '',
      budgetHolderUserId: ''
    });

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState('');

  const [notice, setNotice] =
    useState('');


  async function loadCodingReview(
    preferredBookingId = null
  ) {
    setLoading(true);
    setError('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/coding-review`
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Unable to load coding review'
        );
      }

      const nextBookings =
        data.bookings ?? [];

      setBookings(
        nextBookings
      );

      setOptions({
        reasonCodes:
          data.options?.reasonCodes ?? [],

        budgets:
          data.options?.budgets ?? []
      });

      const stillExists =
        preferredBookingId &&
        nextBookings.some(
          (booking) =>
            booking.id ===
              preferredBookingId
        );

      const nextSelectedId =
        stillExists
          ? preferredBookingId
          : nextBookings[0]?.id ??
            null;

      setSelectedBookingId(
        nextSelectedId
      );

      setForm({
        reasonCodeId: '',
        budgetId: '',
        budgetHolderUserId: ''
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load coding review'
      );
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    loadCodingReview();
  }, []);


  const selectedBooking =
    useMemo(
      () =>
        bookings.find(
          (booking) =>
            booking.id ===
              selectedBookingId
        ) || null,
      [
        bookings,
        selectedBookingId
      ]
    );


  const selectedBudget =
    useMemo(
      () =>
        options.budgets.find(
          (budget) =>
            String(budget.id) ===
              String(form.budgetId)
        ) || null,
      [
        options.budgets,
        form.budgetId
      ]
    );


  const availableHolders =
    selectedBudget?.holders ?? [];


  function selectBooking(bookingId) {
    setSelectedBookingId(
      bookingId
    );

    setForm({
      reasonCodeId: '',
      budgetId: '',
      budgetHolderUserId: ''
    });

    setError('');
    setNotice('');
  }


  function codingStatusLabel(status) {
    if (!status) {
      return 'Not provided';
    }

    return formatStatus(status);
  }


  function codingStatusClass(status) {
    if (status === 'valid') {
      return 'valid';
    }

    if (
      status === 'missing' ||
      status === 'invalid' ||
      status === 'mismatch'
    ) {
      return 'invalid';
    }

    return 'neutral';
  }


  async function approveCoding(event) {
    event.preventDefault();

    if (
      !selectedBooking ||
      !form.reasonCodeId ||
      !form.budgetId ||
      !form.budgetHolderUserId
    ) {
      setError(
        'Select a reason code, budget and budget holder before approving.'
      );

      return;
    }

    setSaving(true);
    setError('');
    setNotice('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/coding-review/${selectedBooking.id}/approve`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json'
            },

            body:
              JSON.stringify({
                reasonCodeId:
                  Number(
                    form.reasonCodeId
                  ),

                budgetId:
                  Number(
                    form.budgetId
                  ),

                budgetHolderUserId:
                  Number(
                    form.budgetHolderUserId
                  )
              })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Unable to approve coding'
        );
      }

      const approvedReference =
        bookingNoticeReference(selectedBooking);

      setNotice(
        `${approvedReference} coding has been approved.`
      );

      await loadCodingReview();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to approve coding'
      );
    } finally {
      setSaving(false);
    }
  }


  if (loading) {
    return (
      <div className="card state-panel">
        Loading coding review...
      </div>
    );
  }


  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Coding Review</h1>

          <p>
            Review UHP bookings where the
            operator-supplied financial coding
            could not be validated.
          </p>
        </div>

        <div className="coding-review-count">
          <strong>
            {bookings.length}
          </strong>

          <span>
            awaiting review
          </span>
        </div>
      </div>


      {error && (
        <div className="notice error">
          {error}
        </div>
      )}


      {notice && (
        <div className="notice success">
          {notice}
        </div>
      )}


      {!bookings.length ? (
        <div className="card coding-review-empty">
          <CheckCircle2 size={36}/>

          <strong>
            No coding exceptions
          </strong>

          <span>
            All imported UHP bookings currently
            have valid financial coding.
          </span>
        </div>
      ) : (
        <div className="coding-review-layout">
          <div className="card coding-review-queue">
            <div className="coding-review-card-heading">
              <div>
                <h2>
                  Awaiting Review
                </h2>

                <p>
                  Select a booking to inspect the
                  original Autocab coding.
                </p>
              </div>
            </div>


            <div className="coding-review-list">
              {bookings.map(
                (booking) => {
                  const active =
                    booking.id ===
                      selectedBookingId;

                  return (
                    <button
                      type="button"
                      key={booking.id}
                      className={
                        active
                          ? 'coding-review-list-item active'
                          : 'coding-review-list-item'
                      }
                      onClick={() =>
                        selectBooking(
                          booking.id
                        )
                      }
                    >
                      <div className="coding-review-list-top">
                        <strong>
                          {autocabBookingPrimary(booking)}
                        </strong>

                        <span className="coding-required-chip">
                          Coding Required
                        </span>
                      </div>

                      <small>
                        {portalBookingReference(booking)}
                      </small>

                      <span>
                        {formatPickup(
                          booking.requestedPickupAt
                        )}
                      </span>

                      <small>
                        {booking.passengerName}
                      </small>

                      <small>
                        {booking.pickupAddress}
                        {' → '}
                        {booking.destinationAddress}
                      </small>
                    </button>
                  );
                }
              )}
            </div>
          </div>


          {selectedBooking && (
            <div className="coding-review-main">
              <div className="card coding-review-booking">
                <div className="coding-review-card-heading">
                  <div>
                    <span className="coding-review-kicker">
                      Booking
                    </span>

                    <h2>
                      {autocabBookingPrimary(selectedBooking)}
                    </h2>

                    <p>
                      {selectedBooking.passengerName}
                      {' · '}
                      {formatPickup(
                        selectedBooking.requestedPickupAt
                      )}
                    </p>
                  </div>

                  <div className="coding-autocab-id">
                    <small>
                      Portal Reference
                    </small>

                    <strong>
                      {selectedBooking.publicReference || '—'}
                    </strong>
                  </div>
                </div>


                <div className="coding-journey-grid">
                  <div>
                    <small>
                      Pickup
                    </small>

                    <strong>
                      {selectedBooking.pickupAddress}
                    </strong>
                  </div>

                  <div>
                    <small>
                      Destination
                    </small>

                    <strong>
                      {selectedBooking.destinationAddress}
                    </strong>
                  </div>
                </div>


                {selectedBooking.stops?.length > 2 && (
                  <div className="coding-vias">
                    <small>
                      Vias
                    </small>

                    {selectedBooking.stops
                      .filter(
                        (stop) =>
                          stop.stopType ===
                            'via'
                      )
                      .map(
                        (stop) => (
                          <span
                            key={
                              `${selectedBooking.id}-${stop.sequenceNumber}`
                            }
                          >
                            {stop.address}
                          </span>
                        )
                      )}
                  </div>
                )}
              </div>


              <div className="card coding-source-card">
                <div className="coding-review-card-heading">
                  <div>
                    <span className="coding-review-kicker">
                      Original Autocab coding
                    </span>

                    <h2>
                      Validation Result
                    </h2>

                    <p>
                      The original values are
                      retained for audit purposes
                      and are not overwritten.
                    </p>
                  </div>
                </div>


                <div className="coding-raw-reference">
                  <small>
                    Raw OurReference
                  </small>

                  <strong>
                    {selectedBooking.rawReference ||
                      selectedBooking.autocabReference ||
                      '—'}
                  </strong>
                </div>


                <div className="coding-source-grid">
                  <div>
                    <small>
                      Reason Code
                    </small>

                    <strong>
                      {selectedBooking.parsedReasonCode ||
                        '—'}
                    </strong>

                    <span
                      className={
                        `coding-validation ${codingStatusClass(
                          selectedBooking.reasonStatus
                        )}`
                      }
                    >
                      {codingStatusLabel(
                        selectedBooking.reasonStatus
                      )}
                    </span>
                  </div>


                  <div>
                    <small>
                      Budget
                    </small>

                    <strong>
                      {selectedBooking.parsedBudgetNumber ||
                        '—'}
                    </strong>

                    <span
                      className={
                        `coding-validation ${codingStatusClass(
                          selectedBooking.budgetStatus
                        )}`
                      }
                    >
                      {codingStatusLabel(
                        selectedBooking.budgetStatus
                      )}
                    </span>
                  </div>


                  <div>
                    <small>
                      Budget Holder
                    </small>

                    <strong>
                      {selectedBooking.parsedBudgetHolder ||
                        '—'}
                    </strong>

                    <span
                      className={
                        `coding-validation ${codingStatusClass(
                          selectedBooking.holderStatus
                        )}`
                      }
                    >
                      {codingStatusLabel(
                        selectedBooking.holderStatus
                      )}
                    </span>
                  </div>
                </div>
              </div>


              <form
                className="card coding-correction-card"
                onSubmit={approveCoding}
              >
                <div className="coding-review-card-heading">
                  <div>
                    <span className="coding-review-kicker">
                      Correct coding
                    </span>

                    <h2>
                      Apply Valid Master Data
                    </h2>

                    <p>
                      Select existing approved UHP
                      reference data. This does not
                      create new budgets, reason
                      codes or holders.
                    </p>
                  </div>
                </div>


                <div className="coding-form-grid">
                  <label>
                    Reason Code

                    <select
                      required
                      value={
                        form.reasonCodeId
                      }
                      onChange={(event) =>
                        setForm({
                          ...form,
                          reasonCodeId:
                            event.target.value
                        })
                      }
                    >
                      <option value="">
                        Select reason code...
                      </option>

                      {options.reasonCodes.map(
                        (reason) => (
                          <option
                            key={reason.id}
                            value={reason.id}
                          >
                            {reason.code}
                            {' — '}
                            {reason.description}
                          </option>
                        )
                      )}
                    </select>
                  </label>


                  <label>
                    Budget

                    <select
                      required
                      value={
                        form.budgetId
                      }
                      onChange={(event) =>
                        setForm({
                          ...form,
                          budgetId:
                            event.target.value,
                          budgetHolderUserId:
                            ''
                        })
                      }
                    >
                      <option value="">
                        Select budget...
                      </option>

                      {options.budgets.map(
                        (budget) => (
                          <option
                            key={budget.id}
                            value={budget.id}
                          >
                            {budget.budgetNumber}
                            {' — '}
                            {budget.name}
                          </option>
                        )
                      )}
                    </select>
                  </label>


                  <label>
                    Budget Holder

                    <select
                      required
                      disabled={
                        !form.budgetId ||
                        !availableHolders.length
                      }
                      value={
                        form.budgetHolderUserId
                      }
                      onChange={(event) =>
                        setForm({
                          ...form,
                          budgetHolderUserId:
                            event.target.value
                        })
                      }
                    >
                      <option value="">
                        {!form.budgetId
                          ? 'Select a budget first...'
                          : availableHolders.length
                            ? 'Select budget holder...'
                            : 'No active holder assigned'}
                      </option>

                      {availableHolders.map(
                        (holder) => (
                          <option
                            key={
                              `${selectedBudget.id}-${holder.id}-${holder.assignmentType}`
                            }
                            value={holder.id}
                          >
                            {holder.name}
                            {' — '}
                            {formatStatus(
                              holder.assignmentType
                            )}
                          </option>
                        )
                      )}
                    </select>
                  </label>
                </div>


                {form.budgetId &&
                  !availableHolders.length && (
                    <div className="inline-warning">
                      The selected budget has no
                      active primary or deputy
                      budget holder. Update the
                      budget assignment before
                      approving this booking.
                    </div>
                  )}


                <div className="coding-approval-note">
                  <AlertTriangle size={18}/>

                  <span>
                    Approval changes the booking
                    from <strong>Coding Required</strong>
                    {' '}to <strong>Authorised</strong>
                    {' '}and records the approving
                    user in the audit trail.
                  </span>
                </div>


                <div className="coding-review-actions">
                  <button
                    type="submit"
                    className="primary"
                    disabled={
                      saving ||
                      !form.reasonCodeId ||
                      !form.budgetId ||
                      !form.budgetHolderUserId
                    }
                  >
                    <CheckCircle2 size={17}/>

                    {saving
                      ? 'Approving...'
                      : 'Approve Coding'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </>
  );
}



function MyBookingsPage({
  currentUser,
  scope = 'mine'
}) {
  const bookingUserId = currentUser.id;

  const budgetScope =
    scope === 'budget';

  const allScope =
    scope === 'all';

  const ownScope =
    scope === 'mine';

  const broaderScope =
    budgetScope || allScope;

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] =
    useState('all');

  const [fromDate, setFromDate] =
    useState('');

  const [toDate, setToDate] =
    useState('');

  const [datePreset, setDatePreset] =
    useState('all');

  const [budgetFilter, setBudgetFilter] =
    useState('all');

  const [budgetHolderFilter, setBudgetHolderFilter] =
    useState('all');

  const [reasonFilter, setReasonFilter] =
    useState('all');

  const [bookerFilter, setBookerFilter] =
    useState('all');

  const [sourceFilter, setSourceFilter] =
    useState('all');

  const [showAdvancedFilters, setShowAdvancedFilters] =
    useState(false);

  const [selectedBooking, setSelectedBooking] =
    useState(null);

  const selectedBookingOwnedByCurrentUser =
    Boolean(
      selectedBooking &&
      selectedBooking.createdByUserId ===
        currentUser.id
    );

  const selectedBookingManageable =
    Boolean(
      selectedBooking &&
      (
        selectedBookingOwnedByCurrentUser ||
        allScope
      )
    );

  const [editingBooking, setEditingBooking] = useState(null);
  const [editOptions, setEditOptions] = useState({
    budgets: [],
    reasonCodes: []
  });
  const [editForm, setEditForm] = useState(null);
  const [editVias, setEditVias] = useState([]);

  const [
    editSavedLocations,
    setEditSavedLocations
  ] = useState([]);

  const [savingEdit, setSavingEdit] = useState(false);
  const [editReview, setEditReview] = useState(null);
  const [
    editFailureMode,
    setEditFailureMode
  ] = useState(null);

  const [cancelBooking, setCancelBooking] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const [financialActionId, setFinancialActionId] =
    useState(null);

  const [disputeBooking, setDisputeBooking] =
    useState(null);

  const [disputeReason, setDisputeReason] =
    useState('');

  const [financialActionError, setFinancialActionError] =
    useState('');

  useEscapeClose(
    Boolean(disputeBooking),
    () => {
      if (
        disputeBooking &&
        financialActionId !==
          disputeBooking.id
      ) {
        closeDisputeFinancialBooking();
      }
    }
  );

  useEffect(() => {
    if (!editingBooking?.id) {
      setEditSavedLocations([]);
      return undefined;
    }

    let cancelled = false;

    async function loadEditSavedLocations() {
      try {
        const response =
          await apiFetch(
            `${API_BASE}/api/booking-options?userId=${bookingUserId}`
          );

        const data =
          await response.json();

        if (
          cancelled ||
          !response.ok
        ) {
          return;
        }

        setEditSavedLocations(
          Array.isArray(data.savedLocations)
            ? data.savedLocations
            : []
        );
      } catch {
        if (!cancelled) {
          /*
            Amendment remains usable with
            external address search if the
            shared directory is temporarily
            unavailable.
          */
          setEditSavedLocations([]);
        }
      }
    }

    loadEditSavedLocations();

    return () => {
      cancelled = true;
    };
  }, [
    editingBooking?.id,
    bookingUserId
  ]);


  useEscapeClose(
    Boolean(editingBooking),
    () => {
      if (!savingEdit) {
        closeAmend();
      }
    }
  );

  useEscapeClose(
    Boolean(cancelBooking),
    () => {
      if (!cancelling) {
        closeCancel();
      }
    }
  );


  async function loadBookings() {
    setLoading(true);
    setError('');

    try {
      const endpoint =
        allScope
          ? `${API_BASE}/api/uhp/bookings`
          : budgetScope
            ? `${API_BASE}/api/budget-bookings`
            : `${API_BASE}/api/my-bookings`;

      const response =
        await apiFetch(endpoint);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || 'Unable to load bookings'
        );
      }

      setBookings(data.bookings ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load bookings'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBookings();
  }, [
    allScope,
    budgetScope,
    bookingUserId
  ]);

  const bookingFilterOptions = useMemo(() => {
    const uniqueOptions = (
      valueKey,
      labelKey
    ) => {
      const values = new Map();

      for (const booking of bookings) {
        const value =
          booking[valueKey];

        const label =
          booking[labelKey];

        if (
          value === null ||
          value === undefined ||
          String(value).trim() === '' ||
          !label
        ) {
          continue;
        }

        values.set(
          String(value),
          String(label)
        );
      }

      return [...values.entries()]
        .map(([value, label]) => ({
          value,
          label
        }))
        .sort((a, b) =>
          a.label.localeCompare(
            b.label
          )
        );
    };

    const bookers =
      new Set();

    for (const booking of bookings) {
      const label =
        bookingDisplayBooker(
          booking
        );

      if (
        label &&
        label !== '—'
      ) {
        bookers.add(label);
      }
    }

    return {
      budgets:
        uniqueOptions(
          'budgetId',
          'budgetNumber'
        ),

      budgetHolders:
        uniqueOptions(
          'budgetHolderUserId',
          'budgetHolder'
        ),

      reasons:
        uniqueOptions(
          'reasonCodeId',
          'reasonCode'
        ),

      bookers:
        [...bookers]
          .sort((a, b) =>
            a.localeCompare(b)
          )
    };
  }, [bookings]);


  function localBookingDateValue(
    date
  ) {
    return [
      date.getFullYear(),
      String(
        date.getMonth() + 1
      ).padStart(2, '0'),
      String(
        date.getDate()
      ).padStart(2, '0')
    ].join('-');
  }


  function applyBookingDatePreset(
    preset
  ) {
    setDatePreset(preset);

    const now = new Date();

    const today =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );

    if (preset === 'all') {
      setFromDate('');
      setToDate('');
      return;
    }

    if (preset === 'today') {
      const value =
        localBookingDateValue(
          today
        );

      setFromDate(value);
      setToDate(value);
      return;
    }

    if (preset === 'tomorrow') {
      const tomorrow =
        new Date(today);

      tomorrow.setDate(
        tomorrow.getDate() + 1
      );

      const value =
        localBookingDateValue(
          tomorrow
        );

      setFromDate(value);
      setToDate(value);
      return;
    }

    if (preset === 'next7') {
      const end =
        new Date(today);

      end.setDate(
        end.getDate() + 6
      );

      setFromDate(
        localBookingDateValue(
          today
        )
      );

      setToDate(
        localBookingDateValue(
          end
        )
      );

      return;
    }

    if (preset === 'month') {
      const start =
        new Date(
          today.getFullYear(),
          today.getMonth(),
          1
        );

      const end =
        new Date(
          today.getFullYear(),
          today.getMonth() + 1,
          0
        );

      setFromDate(
        localBookingDateValue(
          start
        )
      );

      setToDate(
        localBookingDateValue(
          end
        )
      );

      return;
    }

    if (
      preset ===
        'christmas-2026'
    ) {
      setFromDate(
        '2026-12-21'
      );

      setToDate(
        '2027-01-04'
      );
    }
  }


  function clearBookingFilters() {
    setQuery('');
    setStatusFilter('all');
    setDatePreset('all');
    setFromDate('');
    setToDate('');
    setBudgetFilter('all');
    setBudgetHolderFilter('all');
    setReasonFilter('all');
    setBookerFilter('all');
    setSourceFilter('all');
  }


  const filteredBookings = useMemo(() => {
    const term =
      query.trim().toLowerCase();

    return bookings.filter((booking) => {
      const matchesStatus =
        statusFilter === 'all' ||
        bookingStatusGroup(
          booking
        ) === statusFilter;

      const pickupDate =
        String(
          booking.requestedPickupAt || ''
        ).slice(0, 10);

      const matchesFrom =
        !fromDate ||
        pickupDate >= fromDate;

      const matchesTo =
        !toDate ||
        pickupDate <= toDate;

      const matchesQuery =
        !term ||
        bookingSearchText(
          booking
        ).includes(term);

      const matchesBudget =
        budgetFilter === 'all' ||
        String(
          booking.budgetId
        ) === budgetFilter;

      const matchesBudgetHolder =
        budgetHolderFilter === 'all' ||
        String(
          booking.budgetHolderUserId
        ) === budgetHolderFilter;

      const matchesReason =
        reasonFilter === 'all' ||
        String(
          booking.reasonCodeId
        ) === reasonFilter;

      const matchesBooker =
        bookerFilter === 'all' ||
        bookingDisplayBooker(
          booking
        ) === bookerFilter;

      const matchesSource =
        sourceFilter === 'all' ||
        (
          sourceFilter === 'portal'
            ? booking.source ===
                'portal'
            : booking.source !==
                'portal'
        );

      return (
        matchesStatus &&
        matchesFrom &&
        matchesTo &&
        matchesQuery &&
        matchesBudget &&
        matchesBudgetHolder &&
        matchesReason &&
        matchesBooker &&
        matchesSource
      );
    });
  }, [
    bookings,
    query,
    statusFilter,
    fromDate,
    toDate,
    budgetFilter,
    budgetHolderFilter,
    reasonFilter,
    bookerFilter,
    sourceFilter
  ]);

  const stats = useMemo(
    () => ({
      total: bookings.length,

      live: bookings.filter(
        (booking) =>
          bookingStatusGroup(booking) ===
            'live'
      ).length,

      booked: bookings.filter(
        (booking) =>
          bookingStatusGroup(booking) ===
            'booked'
      ).length,

      completed: bookings.filter(
        (booking) =>
          bookingStatusGroup(booking) ===
            'completed'
      ).length,

      noFare: bookings.filter(
        (booking) =>
          bookingStatusGroup(booking) ===
            'no_fare'
      ).length,

      cancelled: bookings.filter(
        (booking) =>
          bookingStatusGroup(booking) ===
            'cancelled'
      ).length
    }),
    [bookings]
  );

  function friendlyBookingStatus(status) {
    const map = {
      draft: 'Request Recorded',
      submitting: 'Sending to Dispatch',
      cancelling: 'Cancelling',
      modifying: 'Updating Booking',
      booked: 'Booked',
      confirmed: 'Confirmed',
      driver_allocated: 'Driver Allocated',
      driver_en_route: 'Driver En Route',
      driver_arrived: 'Driver Arrived',
      passenger_on_board: 'Passenger On Board',
      completed: 'Completed',
      cancelled: 'Cancelled',
      no_show: 'No Show',
      no_fare: 'No Fare',
      failed: 'Needs Attention',
      requires_review: 'Needs Attention'
    };

    return map[status] || formatStatus(status);
  }

  async function openAmend(bookingId) {
    setError('');
    setNotice('');

    try {
      const [bookingResponse, optionsResponse] =
        await Promise.all([
          apiFetch(
            `${API_BASE}/api/bookings/${bookingId}?userId=${bookingUserId}`
          ),
          apiFetch(
            `${API_BASE}/api/booking-options?userId=${bookingUserId}`
          )
        ]);

      const bookingData =
        await bookingResponse.json();

      const optionsData =
        await optionsResponse.json();

      if (!bookingResponse.ok) {
        throw new Error(
          bookingData.error ||
          'Unable to load booking'
        );
      }

      if (!optionsResponse.ok) {
        throw new Error(
          optionsData.error ||
          'Unable to load booking options'
        );
      }

      const booking = bookingData.booking;

      if (
        ![
          'draft',
          'booked',
          'confirmed'
        ].includes(
          booking.operationalStatus
        )
      ) {
        throw new Error(
          'This booking can no longer be amended'
        );
      }

      const [pickupDate = '', pickupTime = ''] =
        String(booking.requestedPickupAt || '')
          .split('T');

      const pickup =
        booking.stops?.find(
          (stop) => stop.stopType === 'pickup'
        ) ?? {};

      const destination =
        booking.stops?.find(
          (stop) => stop.stopType === 'destination'
        ) ?? {};

      const vias =
        booking.stops
          ?.filter(
            (stop) => stop.stopType === 'via'
          )
          .map((stop) => ({
            address: stop.address || '',
            postcode: stop.postcode || ''
          })) ?? [];

      setEditOptions({
        budgets: optionsData.budgets ?? [],
        reasonCodes:
          optionsData.reasonCodes ?? []
      });

      setEditForm({
        pickupDate,
        pickupTime: pickupTime.slice(0, 5),
        pickupAddress:
          pickup.address ||
          booking.pickupAddress ||
          '',
        pickupPostcode:
          pickup.postcode ||
          booking.pickupPostcode ||
          '',
        destinationAddress:
          destination.address ||
          booking.destinationAddress ||
          '',
        destinationPostcode:
          destination.postcode ||
          booking.destinationPostcode ||
          '',
        passengerName:
          booking.passengerName || '',
        passengerMobile:
          booking.passengerMobile || '',
        passengerCount:
          booking.passengerCount || 1,
        budgetId:
          String(booking.budgetId || ''),
        reasonCodeId:
          String(booking.reasonCodeId || ''),
        driverNotes:
          booking.driverNotes || ''
      });

      setEditForm(
        (current) => ({
          ...current,

          pickupLatitude:
            pickup.latitude ?? null,
          pickupLongitude:
            pickup.longitude ?? null,
          pickupSavedLocationId:
            pickup.savedLocationId ?? null,
          pickupLocationName:
            pickup.locationName ?? null,
          pickupPickupInstructions:
            pickup.pickupInstructions ?? null,

          destinationLatitude:
            destination.latitude ?? null,
          destinationLongitude:
            destination.longitude ?? null,
          destinationSavedLocationId:
            destination.savedLocationId ?? null,
          destinationLocationName:
            destination.locationName ?? null,
          destinationPickupInstructions:
            destination.pickupInstructions ?? null
        })
      );

      setEditVias(
        (
          Array.isArray(booking.stops)
            ? booking.stops
            : []
        )
          .filter(
            (stop) =>
              stop.stopType === 'via'
          )
          .map((stop) => ({
            address:
              stop.address || '',
            postcode:
              stop.postcode || '',
            latitude:
              stop.latitude ?? null,
            longitude:
              stop.longitude ?? null,
            savedLocationId:
              stop.savedLocationId ?? null,
            locationName:
              stop.locationName ?? null,
            pickupInstructions:
              stop.pickupInstructions ?? null
          }))
      );

      setEditingBooking(booking);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load booking'
      );
    }
  }

  function updateEditForm(field, value) {
    setEditForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function addEditVia() {
    setEditVias((current) => [
      ...current,
      {
        address: '',
        postcode: '',
        latitude: null,
        longitude: null,
        savedLocationId: null,
        locationName: null,
        pickupInstructions: null
      }
    ]);
  }

  function updateEditVia(
    index,
    field,
    value
  ) {
    setEditVias((current) =>
      current.map((via, viaIndex) =>
        viaIndex === index
          ? {
              ...via,
              [field]: value
            }
          : via
      )
    );
  }

  function removeEditVia(index) {
    setEditVias((current) =>
      current.filter(
        (_, viaIndex) => viaIndex !== index
      )
    );
  }

  function closeAmend() {
    if (savingEdit) return;

    setEditingBooking(null);
    setEditForm(null);
    setEditVias([]);
    setEditSavedLocations([]);
    setEditReview(null);
    setEditFailureMode(null);
    setError('');
  }

  function amendmentReviewValue(value) {
    const normalised =
      String(value ?? '').trim();

    return normalised || '—';
  }

  function amendmentRouteSummary(stops) {
    return (
      Array.isArray(stops)
        ? stops
            .filter(
              (stop) =>
                stop?.address
            )
            .map(
              (stop) =>
                [
                  stop.address,
                  stop.postcode
                ]
                  .filter(Boolean)
                  .join(', ')
            )
            .join(' → ')
        : ''
    );
  }

  function reviewAmendment(event) {
    event.preventDefault();

    if (!editingBooking || !editForm) {
      return;
    }

    setError('');
    setNotice('');
    setEditFailureMode(null);

    const originalPickup =
      editingBooking.stops?.find(
        (stop) =>
          stop.stopType === 'pickup'
      ) ?? {};

    const originalDestination =
      editingBooking.stops?.find(
        (stop) =>
          stop.stopType === 'destination'
      ) ?? {};

    const originalVias =
      (
        Array.isArray(
          editingBooking.stops
        )
          ? editingBooking.stops
          : []
      ).filter(
        (stop) =>
          stop.stopType === 'via'
      );

    const proposedVias =
      editVias.filter(
        (via) =>
          via.address.trim()
      );

    const originalBudget =
      editOptions.budgets.find(
        (budget) =>
          Number(budget.id) ===
          Number(editingBooking.budgetId)
      );

    const proposedBudget =
      editOptions.budgets.find(
        (budget) =>
          Number(budget.id) ===
          Number(editForm.budgetId)
      );

    const originalReason =
      editOptions.reasonCodes.find(
        (reason) =>
          Number(reason.id) ===
          Number(editingBooking.reasonCodeId)
      );

    const proposedReason =
      editOptions.reasonCodes.find(
        (reason) =>
          Number(reason.id) ===
          Number(editForm.reasonCodeId)
      );

    const rows = [
      {
        label:
          'Pickup date & time',

        before:
          String(
            editingBooking.requestedPickupAt ||
            ''
          )
            .replace('T', ' ')
            .slice(0, 16),

        after:
          `${editForm.pickupDate} ${editForm.pickupTime}`
      },

      {
        label:
          'Pickup',

        before:
          [
            originalPickup.address ||
              editingBooking.pickupAddress,
            originalPickup.postcode ||
              editingBooking.pickupPostcode
          ]
            .filter(Boolean)
            .join(', '),

        after:
          [
            editForm.pickupAddress,
            editForm.pickupPostcode
          ]
            .filter(Boolean)
            .join(', ')
      },

      {
        label:
          'Via points',

        before:
          amendmentRouteSummary(
            originalVias
          ),

        after:
          amendmentRouteSummary(
            proposedVias
          )
      },

      {
        label:
          'Destination',

        before:
          [
            originalDestination.address ||
              editingBooking.destinationAddress,
            originalDestination.postcode ||
              editingBooking.destinationPostcode
          ]
            .filter(Boolean)
            .join(', '),

        after:
          [
            editForm.destinationAddress,
            editForm.destinationPostcode
          ]
            .filter(Boolean)
            .join(', ')
      },

      {
        label:
          'Passenger name',

        before:
          editingBooking.passengerName,

        after:
          editForm.passengerName
      },

      {
        label:
          'Contact number',

        before:
          editingBooking.passengerMobile,

        after:
          editForm.passengerMobile
      },

      {
        label:
          'Passenger count',

        before:
          editingBooking.passengerCount,

        after:
          editForm.passengerCount
      },

      {
        label:
          'Budget',

        before:
          originalBudget
            ? `${originalBudget.budgetNumber} — ${originalBudget.name}`
            : editingBooking.budgetNumber,

        after:
          proposedBudget
            ? `${proposedBudget.budgetNumber} — ${proposedBudget.name}`
            : editForm.budgetId
      },

      {
        label:
          'Reason code',

        before:
          originalReason
            ? `${originalReason.code} — ${originalReason.description}`
            : editingBooking.reasonCode,

        after:
          proposedReason
            ? `${proposedReason.code} — ${proposedReason.description}`
            : editForm.reasonCodeId
      },

      {
        label:
          'Driver notes',

        before:
          editingBooking.driverNotes,

        after:
          editForm.driverNotes
      }
    ];

    const changes =
      rows
        .map((row) => ({
          ...row,

          before:
            amendmentReviewValue(
              row.before
            ),

          after:
            amendmentReviewValue(
              row.after
            )
        }))
        .filter(
          (row) =>
            row.before !== row.after
        );

    if (changes.length === 0) {
      setError(
        'No changes have been made to this booking.'
      );
      return;
    }

    setEditReview({
      changes,

      isLive:
        editingBooking.operationalStatus ===
          'booked' ||
        editingBooking.operationalStatus ===
          'confirmed'
    });
  }

  async function submitAmendment() {
    if (!editingBooking || !editForm) return;

    setSavingEdit(true);
    setError('');
    setNotice('');

    try {
      const response = await apiFetch(
        `${API_BASE}/api/bookings/${editingBooking.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: bookingUserId,

            requestedPickupAt:
              `${editForm.pickupDate}T${editForm.pickupTime}:00`,

            passengerName:
              editForm.passengerName,

            passengerMobile:
              editForm.passengerMobile,

            passengerCount:
              Number(editForm.passengerCount),

            pickup: {
              address:
                editForm.pickupAddress,
              postcode:
                editForm.pickupPostcode,
              latitude:
                editForm.pickupLatitude,
              longitude:
                editForm.pickupLongitude,
              savedLocationId:
                editForm.pickupSavedLocationId,
              locationName:
                editForm.pickupLocationName,
              pickupInstructions:
                editForm.pickupPickupInstructions
            },

            vias: editVias
              .filter(
                (via) => via.address.trim()
              )
              .map((via) => ({
                address:
                  via.address,
                postcode:
                  via.postcode,
                latitude:
                  via.latitude,
                longitude:
                  via.longitude,
                savedLocationId:
                  via.savedLocationId,
                locationName:
                  via.locationName,
                pickupInstructions:
                  via.pickupInstructions
              })),

            destination: {
              address:
                editForm.destinationAddress,
              postcode:
                editForm.destinationPostcode,
              latitude:
                editForm.destinationLatitude,
              longitude:
                editForm.destinationLongitude,
              savedLocationId:
                editForm.destinationSavedLocationId,
              locationName:
                editForm.destinationLocationName,
              pickupInstructions:
                editForm.destinationPickupInstructions
            },

            driverNotes:
              editForm.driverNotes,

            budgetId:
              Number(editForm.budgetId),

            reasonCodeId:
              Number(editForm.reasonCodeId)
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Unable to amend booking'
        );
      }

      closeAmend();
      await loadBookings();

      setNotice(
        `${bookingNoticeReference(data.booking)} has been amended successfully.`
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to amend booking';

      const requiresManualReview =
        message.includes(
          'result is uncertain'
        ) ||
        message.includes(
          'requires manual review'
        ) ||
        message.includes(
          'could not be verified'
        ) ||
        message.includes(
          'Manual reconciliation is required'
        );

      if (requiresManualReview) {
        await loadBookings();
      }

      setError(message);

      setEditFailureMode(
        requiresManualReview
          ? 'manual_review'
          : 'rejected'
      );
    } finally {
      setSavingEdit(false);
    }
  }

  function openCancel(booking) {
    setError('');
    setNotice('');
    setCancelReason('');
    setCancelBooking(booking);
  }

  function closeCancel() {
    if (cancelling) return;

    setCancelBooking(null);
    setCancelReason('');
  }

  async function confirmCancel(event) {
    event.preventDefault();

    if (!cancelBooking) return;

    setCancelling(true);
    setError('');
    setNotice('');

    try {
      const response = await apiFetch(
        `${API_BASE}/api/bookings/${cancelBooking.id}/cancel`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: bookingUserId,
            reason: cancelReason
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Unable to cancel booking'
        );
      }

      closeCancel();
      await loadBookings();

      setNotice(
        `${bookingNoticeReference(data.booking)} has been cancelled.`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to cancel booking'
      );
    } finally {
      setCancelling(false);
    }
  }

  async function approveFinancialBooking(
    booking
  ) {
    setFinancialActionId(booking.id);
    setFinancialActionError('');
    setError('');
    setNotice('');

    try {
      const response = await apiFetch(
        `${API_BASE}/api/bookings/${booking.id}/approve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Unable to approve booking'
        );
      }

      await loadBookings();

      setNotice(
        `${bookingNoticeReference(booking)} has been approved for invoice.`
      );

      setSelectedBooking(null);
    } catch (err) {
      setFinancialActionError(
        err instanceof Error
          ? err.message
          : 'Unable to approve booking'
      );
    } finally {
      setFinancialActionId(null);
    }
  }

  function openDisputeFinancialBooking(
    booking
  ) {
    setDisputeBooking(booking);
    setDisputeReason('');
    setFinancialActionError('');
    setError('');
    setNotice('');
  }

  function closeDisputeFinancialBooking() {
    if (financialActionId) return;

    setDisputeBooking(null);
    setDisputeReason('');
  }

  async function submitFinancialDispute(
    event
  ) {
    event.preventDefault();

    if (!disputeBooking) return;

    setFinancialActionId(
      disputeBooking.id
    );

    setFinancialActionError('');
    setError('');
    setNotice('');

    try {
      const response = await apiFetch(
        `${API_BASE}/api/bookings/${disputeBooking.id}/dispute`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            reason: disputeReason
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Unable to dispute booking'
        );
      }

      const reference =
        bookingNoticeReference(disputeBooking);

      setDisputeBooking(null);
      setDisputeReason('');

      await loadBookings();

      setNotice(
        `${reference} has been marked as disputed.`
      );
    } catch (err) {
      setFinancialActionError(
        err instanceof Error
          ? err.message
          : 'Unable to dispute booking'
      );
    } finally {
      setFinancialActionId(null);
    }
  }

  if (loading) {
    return (
      <div className="card state-panel">
        Loading bookings...
      </div>
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            {allScope
              ? 'All UHP Bookings'
              : budgetScope
                ? 'Budget Bookings'
                : 'My Bookings'}
          </h1>

          <p>
            {allScope
              ? 'View all UHP account transport bookings across the hospital.'
              : budgetScope
                ? 'View UHP transport requests charged to budgets you are authorised to oversee.'
                : 'View and manage UHP transport requests you have created.'}
          </p>
        </div>
      </div>

      {error && (
        <div className="notice error">
          {error}
        </div>
      )}

      {notice && (
        <div className="notice success">
          {notice}
        </div>
      )}

      {financialActionError && (
        <div className="notice error">
          {financialActionError}
        </div>
      )}

      <div className="booking-status-cards">
        {[
          ['all', 'All', stats.total],
          ['live', 'Live', stats.live],
          ['booked', 'Booked', stats.booked],
          ['completed', 'Completed', stats.completed],
          ['no_fare', 'No Fare', stats.noFare],
          ['cancelled', 'Cancelled', stats.cancelled]
        ].map(
          ([key, label, value]) => (
            <button
              key={key}
              type="button"
              className={
                `booking-status-card ${
                  statusFilter === key
                    ? 'active'
                    : ''
                }`
              }
              onClick={() =>
                setStatusFilter(key)
              }
            >
              <small>{label}</small>
              <strong>{value}</strong>
            </button>
          )
        )}
      </div>

      <div className="card">
        <div className="uhp-booking-filter-panel">
          <div className="uhp-booking-filter-toolbar">
            <div className="search compact uhp-booking-filter-search">
              <Search size={17}/>

              <input
                value={query}
                onChange={(e) =>
                  setQuery(e.target.value)
                }
                placeholder="Search booking, passenger, phone, journey or booker..."
              />
            </div>

            {allScope && (
              <select
                className="uhp-filter-control"
                value={datePreset}
                onChange={(e) =>
                  applyBookingDatePreset(
                    e.target.value
                  )
                }
              >
                <option value="all">
                  All dates
                </option>

                <option
                  value="custom"
                  disabled
                >
                  Custom dates
                </option>

                <option value="today">
                  Today
                </option>

                <option value="tomorrow">
                  Tomorrow
                </option>

                <option value="next7">
                  Next 7 days
                </option>

                <option value="month">
                  This month
                </option>

                <option value="christmas-2026">
                  Christmas 2026
                </option>
              </select>
            )}

            <select
              className="uhp-filter-control"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value
                )
              }
            >
              <option value="all">
                All statuses
              </option>

              <option value="live">
                Live
              </option>

              <option value="booked">
                Booked
              </option>

              <option value="completed">
                Completed
              </option>

              <option value="no_fare">
                No Fare
              </option>

              <option value="cancelled">
                Cancelled
              </option>
            </select>

            {allScope ? (
              <>
                <button
                  type="button"
                  className={
                    `secondary uhp-filter-toggle ${
                      showAdvancedFilters
                        ? 'active'
                        : ''
                    }`
                  }
                  onClick={() =>
                    setShowAdvancedFilters(
                      (current) => !current
                    )
                  }
                >
                  {showAdvancedFilters
                    ? 'Hide filters'
                    : 'More filters'}

                  {[
                    budgetFilter !== 'all',
                    budgetHolderFilter !== 'all',
                    reasonFilter !== 'all',
                    bookerFilter !== 'all',
                    sourceFilter !== 'all',
                    datePreset === 'custom'
                  ].filter(Boolean).length > 0 && (
                    <span className="uhp-filter-count">
                      {
                        [
                          budgetFilter !== 'all',
                          budgetHolderFilter !== 'all',
                          reasonFilter !== 'all',
                          bookerFilter !== 'all',
                          sourceFilter !== 'all',
                          datePreset === 'custom'
                        ].filter(Boolean).length
                      }
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  className="uhp-filter-reset"
                  onClick={() => {
                    clearBookingFilters();
                    setShowAdvancedFilters(false);
                  }}
                >
                  Reset
                </button>
              </>
            ) : (
              <>
                <label className="uhp-inline-date">
                  <span>From</span>

                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) =>
                      setFromDate(
                        e.target.value
                      )
                    }
                  />
                </label>

                <label className="uhp-inline-date">
                  <span>To</span>

                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) =>
                      setToDate(
                        e.target.value
                      )
                    }
                  />
                </label>
              </>
            )}
          </div>

          {allScope &&
            showAdvancedFilters && (
            <div className="uhp-booking-filter-drawer">
              <div className="uhp-filter-field">
                <span>Budget</span>

                <select
                  value={budgetFilter}
                  onChange={(e) =>
                    setBudgetFilter(
                      e.target.value
                    )
                  }
                >
                  <option value="all">
                    All budgets
                  </option>

                  {bookingFilterOptions
                    .budgets
                    .map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                </select>
              </div>

              <div className="uhp-filter-field">
                <span>Budget holder</span>

                <select
                  value={budgetHolderFilter}
                  onChange={(e) =>
                    setBudgetHolderFilter(
                      e.target.value
                    )
                  }
                >
                  <option value="all">
                    All budget holders
                  </option>

                  {bookingFilterOptions
                    .budgetHolders
                    .map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                </select>
              </div>

              <div className="uhp-filter-field">
                <span>Reason code</span>

                <select
                  value={reasonFilter}
                  onChange={(e) =>
                    setReasonFilter(
                      e.target.value
                    )
                  }
                >
                  <option value="all">
                    All reason codes
                  </option>

                  {bookingFilterOptions
                    .reasons
                    .map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                </select>
              </div>

              <div className="uhp-filter-field">
                <span>Booked by</span>

                <select
                  value={bookerFilter}
                  onChange={(e) =>
                    setBookerFilter(
                      e.target.value
                    )
                  }
                >
                  <option value="all">
                    All bookers
                  </option>

                  {bookingFilterOptions
                    .bookers
                    .map((booker) => (
                      <option
                        key={booker}
                        value={booker}
                      >
                        {booker}
                      </option>
                    ))}
                </select>
              </div>

              <div className="uhp-filter-field">
                <span>Source</span>

                <select
                  value={sourceFilter}
                  onChange={(e) =>
                    setSourceFilter(
                      e.target.value
                    )
                  }
                >
                  <option value="all">
                    All sources
                  </option>

                  <option value="portal">
                    UHP Portal
                  </option>

                  <option value="external">
                    Autocab / External
                  </option>
                </select>
              </div>

              <div className="uhp-filter-field">
                <span>From</span>

                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(
                      e.target.value
                    );
                    setDatePreset(
                      'custom'
                    );
                  }}
                />
              </div>

              <div className="uhp-filter-field">
                <span>To</span>

                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(
                      e.target.value
                    );
                    setDatePreset(
                      'custom'
                    );
                  }}
                />
              </div>
            </div>
          )}

          <div className="uhp-booking-filter-footer">
            <div className="uhp-booking-filter-summary">
              <strong>
                {filteredBookings.length}
              </strong>

              <span>
                {filteredBookings.length === 1
                  ? 'booking'
                  : 'bookings'}
              </span>

              <span className="uhp-filter-summary-muted">
                shown
              </span>
            </div>

            {allScope &&
              datePreset ===
                'christmas-2026' && (
              <div className="uhp-filter-context">
                Christmas 2026
                <span>21 Dec – 4 Jan</span>
              </div>
            )}
          </div>
        </div>

        {filteredBookings.length === 0 ? (
          <div className="empty-bookings">
            <CalendarDays size={30}/>

            <strong>No bookings found</strong>

            <span>
              {allScope
                ? 'UHP account bookings will appear here.'
                : budgetScope
                  ? 'Bookings charged to your authorised budgets will appear here.'
                  : 'New UHP transport requests will appear here.'}
            </span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="bookings-table booking-list-compact">
              <thead>
                <tr>
                  <th>Date / Time</th>
                  <th>Booking</th>
                  <th>Passenger</th>
                  <th>Journey</th>
                  <th>Budget</th>
                  <th>Reason</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {filteredBookings.map(
                  (booking) => {
                    return (
                      <React.Fragment
                        key={booking.id}
                      >
                        <tr
                          className="booking-row-clickable"
                          role="button"
                          tabIndex="0"
                          onClick={() =>
                            setSelectedBooking(booking)
                          }
                          onKeyDown={(event) => {
                            if (
                              event.key === 'Enter' ||
                              event.key === ' '
                            ) {
                              event.preventDefault();
                              setSelectedBooking(booking);
                            }
                          }}
                        >
                          <td>
                            <strong>
                              {formatPickup(
                                booking.requestedPickupAt
                              )}
                            </strong>

                            <small>
                              Booked{' '}
                              {formatBookingDateTime(
                                bookingDisplayBookedAt(
                                  booking
                                )
                              )}
                            </small>
                          </td>

                          <td>
                            <strong>
                              {autocabBookingPrimary(booking)}
                            </strong>

                            {bookingHasVisiblePortalReference(
                              booking
                            ) && (
                              <small>
                                {portalBookingReference(
                                  booking
                                )}
                              </small>
                            )}

                            {broaderScope && (
                              <small>
                                Booked by{' '}
                                {bookingDisplayBooker(booking)}
                              </small>
                            )}
                          </td>

                          <td>
                            <strong>
                              {booking.passengerName}
                            </strong>

                            <small>
                              {booking.passengerMobile}
                            </small>
                          </td>

                          <td className="journey-cell">
                            <strong>
                              {booking.pickupAddress}
                            </strong>

                            <small>
                              to {booking.destinationAddress}
                            </small>
                          </td>

                          <td>
                            <strong>
                              {booking.budgetNumber}
                            </strong>

                            <small>
                              {booking.budgetName}
                            </small>
                          </td>

                          <td>
                            <strong>
                              {booking.reasonCode}
                            </strong>

                            <small>
                              {booking.reasonDescription}
                            </small>
                          </td>

                          <td>
                            <span
                              className={
                                `badge ${booking.operationalStatus}`
                              }
                            >
                              {friendlyBookingStatus(
                                booking.operationalStatus
                              )}
                            </span>

                            {(
                              booking.hasBeenAmended ||
                              booking.events?.some(
                                (event) =>
                                  event.eventType ===
                                    'booking_amended'
                              )
                            ) && (
                              <span className="amended-chip">
                                Amended
                              </span>
                            )}

                            {bookingIsStale(
                              booking
                            ) && (
                              <span className="stale-chip">
                                Stale
                              </span>
                            )}

                            {bookingIsOverdue(
                              booking
                            ) && (
                              <span className="overdue-chip">
                                Overdue
                              </span>
                            )}
                          </td>

                        </tr>

                      </React.Fragment>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          context="uhp"
          onClose={() =>
            setSelectedBooking(null)
          }
          actions={
            selectedBookingManageable
              ? (
                <>
                  {[
                    'draft',
                    'booked',
                    'confirmed'
                  ].includes(
                    selectedBooking.operationalStatus
                  ) && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        const id =
                          selectedBooking.id;

                        setSelectedBooking(null);
                        openAmend(id);
                      }}
                    >
                      Amend Booking
                    </button>
                  )}

                  {CANCELLABLE_OPERATIONAL_STATUSES.has(
                    selectedBooking.operationalStatus
                  ) && (
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => {
                        const booking =
                          selectedBooking;

                        setSelectedBooking(null);
                        openCancel(booking);
                      }}
                    >
                      Cancel Booking
                    </button>
                  )}
                </>
              )
              : null
          }
        >
          {budgetScope &&
            selectedBooking.operationalStatus ===
              'completed' &&
            selectedBooking.financialStatus ===
              'pending_review' && (
              <div className="financial-review-actions">
                <div className="financial-review-copy">
                  <strong>
                    Financial review required
                  </strong>

                  <span>
                    Confirm this completed journey is
                    correct before it proceeds to
                    invoicing, or dispute it for review.
                  </span>
                </div>

                <div className="financial-review-buttons">
                  <button
                    type="button"
                    className="secondary"
                    disabled={
                      financialActionId ===
                      selectedBooking.id
                    }
                    onClick={() => {
                      setSelectedBooking(null);
                      openDisputeFinancialBooking(
                        selectedBooking
                      );
                    }}
                  >
                    Dispute
                  </button>

                  <button
                    type="button"
                    className="financial-approve-button"
                    disabled={
                      financialActionId ===
                      selectedBooking.id
                    }
                    onClick={() =>
                      approveFinancialBooking(
                        selectedBooking
                      )
                    }
                  >
                    {financialActionId ===
                    selectedBooking.id
                      ? 'Processing...'
                      : 'Approve for Invoice'}
                  </button>
                </div>
              </div>
            )}

          {selectedBooking.operationalStatus ===
            'cancelled' && (
            <div className="managed-booking-note">
              This booking has been cancelled and can
              no longer be amended.
            </div>
          )}
        </BookingDetailModal>
      )}

      {disputeBooking && (
        <div className="modal-backdrop">
          <div className="modal-card modal-card-small">
            <div className="modal-header">
              <div>
                <h2>Dispute Booking</h2>

                <p>
                  {autocabBookingPrimary(disputeBooking)}
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={
                  closeDisputeFinancialBooking
                }
                disabled={
                  financialActionId ===
                  disputeBooking.id
                }
              >
                ×
              </button>
            </div>

            <form
              onSubmit={
                submitFinancialDispute
              }
            >
              <div className="cancel-warning">
                This booking will be held from invoicing until the dispute has been reviewed.
              </div>

              <label>
                Dispute reason

                <textarea
                  rows="5"
                  value={disputeReason}
                  onChange={(event) =>
                    setDisputeReason(
                      event.target.value
                    )
                  }
                  placeholder="Explain what needs to be reviewed..."
                  required
                />
              </label>

              {financialActionError && (
                <div className="notice error">
                  {financialActionError}
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={
                    closeDisputeFinancialBooking
                  }
                  disabled={
                    financialActionId ===
                    disputeBooking.id
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="danger-button"
                  disabled={
                    financialActionId ===
                      disputeBooking.id ||
                    !disputeReason.trim()
                  }
                >
                  {financialActionId ===
                  disputeBooking.id
                    ? 'Submitting...'
                    : 'Submit Dispute'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingBooking &&
        editForm &&
        !editReview && (
        <div className="modal-backdrop">
          <div className="modal-card booking-edit-modal">
            <div className="modal-header">
              <div>
                <h2>Amend Booking</h2>

                <p>
                  {autocabBookingPrimary(editingBooking)}
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={closeAmend}
                disabled={savingEdit}
              >
                ×
              </button>
            </div>

            <form onSubmit={reviewAmendment}>
              <div className="form-grid two">
                <label>
                  Pickup Date
                  <input
                    type="date"
                    required
                    value={editForm.pickupDate}
                    onChange={(e) =>
                      updateEditForm(
                        'pickupDate',
                        e.target.value
                      )
                    }
                  />
                </label>

                <label>
                  Pickup Time
                  <input
                    type="time"
                    required
                    value={editForm.pickupTime}
                    onChange={(e) =>
                      updateEditForm(
                        'pickupTime',
                        e.target.value
                      )
                    }
                  />
                </label>
              </div>

              <div className="form-grid two">
                <label>
                  Pickup

                  <BookingAddressAutocomplete
                    savedLocations={
                      editSavedLocations
                    }
                    required
                    searchEnabled={
                      editForm.pickupLatitude === null ||
                      editForm.pickupLongitude === null
                    }
                    placeholder="Start typing pickup address"
                    value={
                      editForm.pickupAddress
                    }
                    onChange={(value) =>
                      setEditForm(
                        (current) => ({
                          ...current,
                          pickupAddress:
                            value,
                          pickupPostcode:
                            current.pickupLatitude !== null &&
                            current.pickupLongitude !== null
                              ? ''
                              : current.pickupPostcode,
                          pickupLatitude:
                            null,
                          pickupLongitude:
                            null,
                          pickupSavedLocationId:
                            null,
                          pickupLocationName:
                            null,
                          pickupPickupInstructions:
                            null
                        })
                      )
                    }
                    onSelect={(result) =>
                      setEditForm(
                        (current) => ({
                          ...current,
                          pickupAddress:
                            result.address,
                          pickupPostcode:
                            result.postcode ||
                            current.pickupPostcode,
                          pickupLatitude:
                            result.latitude,
                          pickupLongitude:
                            result.longitude,
                          pickupSavedLocationId:
                            result.savedLocationId ||
                            null,
                          pickupLocationName:
                            result.locationName ||
                            null,
                          pickupPickupInstructions:
                            result.pickupInstructions ||
                            null
                        })
                      )
                    }
                  />
                </label>

                <label>
                  Pickup Postcode
                  <input
                    value={editForm.pickupPostcode}
                    onChange={(e) =>
                      setEditForm(
                        (current) => ({
                          ...current,
                          pickupPostcode:
                            e.target.value.toUpperCase(),
                          pickupLatitude:
                            null,
                          pickupLongitude:
                            null,
                          pickupSavedLocationId:
                            null,
                          pickupLocationName:
                            null,
                          pickupPickupInstructions:
                            null
                        })
                      )
                    }
                  />
                </label>
              </div>

              <div className="edit-vias">
                {editVias.map((via, index) => (
                  <div
                    className="edit-via-row"
                    key={index}
                  >
                    <label>
                      Via {index + 1}

                      <BookingAddressAutocomplete
                        savedLocations={
                          editSavedLocations
                        }
                        searchEnabled={
                          via.latitude === null ||
                          via.longitude === null
                        }
                        placeholder="Start typing via address"
                        value={
                          via.address
                        }
                        onChange={(value) =>
                          setEditVias(
                            (current) =>
                              current.map(
                                (
                                  currentVia,
                                  viaIndex
                                ) =>
                                  viaIndex === index
                                    ? {
                                        ...currentVia,
                                        address:
                                          value,
                                        postcode:
                                          currentVia.latitude !== null &&
                                          currentVia.longitude !== null
                                            ? ''
                                            : currentVia.postcode,
                                        latitude:
                                          null,
                                        longitude:
                                          null,
                                        savedLocationId:
                                          null,
                                        locationName:
                                          null,
                                        pickupInstructions:
                                          null
                                      }
                                    : currentVia
                              )
                          )
                        }
                        onSelect={(result) =>
                          setEditVias(
                            (current) =>
                              current.map(
                                (
                                  currentVia,
                                  viaIndex
                                ) =>
                                  viaIndex === index
                                    ? {
                                        ...currentVia,
                                        address:
                                          result.address,
                                        postcode:
                                          result.postcode ||
                                          currentVia.postcode,
                                        latitude:
                                          result.latitude,
                                        longitude:
                                          result.longitude,
                                        savedLocationId:
                                          result.savedLocationId ||
                                          null,
                                        locationName:
                                          result.locationName ||
                                          null,
                                        pickupInstructions:
                                          result.pickupInstructions ||
                                          null
                                      }
                                    : currentVia
                              )
                          )
                        }
                      />
                    </label>

                    <label>
                      Postcode
                      <input
                        value={via.postcode}
                        onChange={(e) =>
                          setEditVias(
                            (current) =>
                              current.map(
                                (
                                  currentVia,
                                  viaIndex
                                ) =>
                                  viaIndex === index
                                    ? {
                                        ...currentVia,
                                        postcode:
                                          e.target.value.toUpperCase(),
                                        latitude:
                                          null,
                                        longitude:
                                          null,
                                        savedLocationId:
                                          null,
                                        locationName:
                                          null,
                                        pickupInstructions:
                                          null
                                      }
                                    : currentVia
                              )
                          )
                        }
                      />
                    </label>

                    <button
                      type="button"
                      className="remove-stop"
                      onClick={() =>
                        removeEditVia(index)
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  className="add-via edit-add-via"
                  onClick={addEditVia}
                >
                  <Plus size={16}/>
                  Add Via
                </button>
              </div>

              <div className="form-grid two">
                <label>
                  Destination

                  <BookingAddressAutocomplete
                    savedLocations={
                      editSavedLocations
                    }
                    required
                    searchEnabled={
                      editForm.destinationLatitude === null ||
                      editForm.destinationLongitude === null
                    }
                    placeholder="Start typing destination address"
                    value={
                      editForm.destinationAddress
                    }
                    onChange={(value) =>
                      setEditForm(
                        (current) => ({
                          ...current,
                          destinationAddress:
                            value,
                          destinationPostcode:
                            current.destinationLatitude !== null &&
                            current.destinationLongitude !== null
                              ? ''
                              : current.destinationPostcode,
                          destinationLatitude:
                            null,
                          destinationLongitude:
                            null,
                          destinationSavedLocationId:
                            null,
                          destinationLocationName:
                            null,
                          destinationPickupInstructions:
                            null
                        })
                      )
                    }
                    onSelect={(result) =>
                      setEditForm(
                        (current) => ({
                          ...current,
                          destinationAddress:
                            result.address,
                          destinationPostcode:
                            result.postcode ||
                            current.destinationPostcode,
                          destinationLatitude:
                            result.latitude,
                          destinationLongitude:
                            result.longitude,
                          destinationSavedLocationId:
                            result.savedLocationId ||
                            null,
                          destinationLocationName:
                            result.locationName ||
                            null,
                          destinationPickupInstructions:
                            result.pickupInstructions ||
                            null
                        })
                      )
                    }
                  />
                </label>

                <label>
                  Destination Postcode
                  <input
                    value={
                      editForm.destinationPostcode
                    }
                    onChange={(e) =>
                      setEditForm(
                        (current) => ({
                          ...current,
                          destinationPostcode:
                            e.target.value.toUpperCase(),
                          destinationLatitude:
                            null,
                          destinationLongitude:
                            null,
                          destinationSavedLocationId:
                            null,
                          destinationLocationName:
                            null,
                          destinationPickupInstructions:
                            null
                        })
                      )
                    }
                  />
                </label>
              </div>

              <div className="form-grid two">
                <label>
                  Passenger Name
                  <input
                    required
                    value={editForm.passengerName}
                    onChange={(e) =>
                      updateEditForm(
                        'passengerName',
                        e.target.value
                      )
                    }
                  />
                </label>

                <label>
                  Contact Number
                  <input
                    type="tel"
                    required
                    value={editForm.passengerMobile}
                    onChange={(e) =>
                      updateEditForm(
                        'passengerMobile',
                        e.target.value
                      )
                    }
                  />
                </label>
              </div>

              <div className="form-grid two">
                <label>
                  Passenger Count
                  <input
                    type="number"
                    min="1"
                    required
                    value={editForm.passengerCount}
                    onChange={(e) =>
                      updateEditForm(
                        'passengerCount',
                        e.target.value
                      )
                    }
                  />
                </label>

                <label>
                  Reason Code
                  <select
                    required
                    value={editForm.reasonCodeId}
                    onChange={(e) =>
                      updateEditForm(
                        'reasonCodeId',
                        e.target.value
                      )
                    }
                  >
                    <option value="">
                      Select reason...
                    </option>

                    {editOptions.reasonCodes.map(
                      (reason) => (
                        <option
                          key={reason.id}
                          value={reason.id}
                        >
                          {reason.code} — {reason.description}
                        </option>
                      )
                    )}
                  </select>
                </label>
              </div>

              <label>
                Budget
                <select
                  required
                  value={editForm.budgetId}
                  onChange={(e) =>
                    updateEditForm(
                      'budgetId',
                      e.target.value
                    )
                  }
                >
                  <option value="">
                    Select budget...
                  </option>

                  {editOptions.budgets.map(
                    (budget) => (
                      <option
                        key={budget.id}
                        value={budget.id}
                      >
                        {budget.budgetNumber} — {budget.name}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                Driver Notes
                <textarea
                  rows="3"
                  value={editForm.driverNotes}
                  onChange={(e) =>
                    updateEditForm(
                      'driverNotes',
                      e.target.value
                    )
                  }
                />
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={closeAmend}
                  disabled={savingEdit}
                >
                  Keep Existing
                </button>

                <button
                  type="submit"
                  className="primary"
                  disabled={savingEdit}
                >
                  Review Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingBooking &&
        editForm &&
        editReview && (
        <div className="modal-backdrop">
          <div className="modal-card booking-edit-modal">
            <div className="modal-header">
              <div>
                <h2>Review Changes</h2>

                <p>
                  {autocabBookingPrimary(
                    editingBooking
                  )}
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={() =>
                  setEditReview(null)
                }
                disabled={savingEdit}
              >
                ×
              </button>
            </div>

            {editReview.isLive && (
              <div className="managed-booking-note">
                This is a live booking. Confirming these
                changes will update the booking in
                Autocab dispatch.
              </div>
            )}

            <div className="amendment-review-list">
              {editReview.changes.map(
                (change) => (
                  <div
                    className="amendment-review-item"
                    key={change.label}
                  >
                    <div className="amendment-review-label">
                      {change.label}
                    </div>

                    <div className="amendment-review-comparison">
                      <div className="amendment-review-value">
                        <small>
                          Existing
                        </small>

                        <span>
                          {change.before}
                        </span>
                      </div>

                      <div
                        className="amendment-review-arrow"
                        aria-hidden="true"
                      >
                        →
                      </div>

                      <div className="amendment-review-value amendment-review-new">
                        <small>
                          New
                        </small>

                        <span>
                          {change.after}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>

            {error && (
              <div
                className={
                  editFailureMode ===
                  'manual_review'
                    ? 'amendment-review-warning'
                    : 'amendment-review-error'
                }
              >
                <strong>
                  {editFailureMode ===
                  'manual_review'
                    ? 'Booking requires review'
                    : 'Amendment not applied'}
                </strong>

                <span>
                  {error}
                </span>

                {editFailureMode ===
                  'manual_review' && (
                  <span>
                    Do not retry this amendment until
                    the booking has been checked in
                    Autocab.
                  </span>
                )}
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (
                    editFailureMode ===
                    'manual_review'
                  ) {
                    closeAmend();
                    return;
                  }

                  setError('');
                  setEditFailureMode(null);
                  setEditReview(null);
                }}
                disabled={savingEdit}
              >
                {editFailureMode ===
                'manual_review'
                  ? 'Close'
                  : 'Back to Edit'}
              </button>

              <button
                type="button"
                className="primary"
                onClick={submitAmendment}
                disabled={
                  savingEdit ||
                  editFailureMode ===
                    'manual_review'
                }
              >
                {savingEdit
                  ? 'Updating Booking...'
                  : editFailureMode ===
                      'manual_review'
                    ? 'Review Required'
                    : editReview.isLive
                      ? 'Confirm & Update Booking'
                      : 'Confirm Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelBooking && (
        <div className="modal-backdrop">
          <div className="modal-card modal-card-small">
            <div className="modal-header">
              <div>
                <h2>Cancel Booking</h2>

                <p>
                  {autocabBookingPrimary(cancelBooking)}
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={closeCancel}
                disabled={cancelling}
              >
                ×
              </button>
            </div>

            <form onSubmit={confirmCancel}>
              <div className="cancel-warning">
                {cancelBooking.operationalStatus ===
                'draft'
                  ? (
                    <>
                      This will cancel the UHP transport
                      request. It has not yet been sent to
                      dispatch.
                    </>
                  )
                  : (
                    <>
                      This will send a cancellation request
                      to Autocab. The booking will remain in
                      the audit history.
                    </>
                  )}
              </div>

              <label>
                Cancellation Reason
                <textarea
                  required
                  rows="4"
                  placeholder="Enter the reason for cancellation..."
                  value={cancelReason}
                  onChange={(e) =>
                    setCancelReason(e.target.value)
                  }
                />
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={closeCancel}
                  disabled={cancelling}
                >
                  Keep Booking
                </button>

                <button
                  type="submit"
                  className="danger-button"
                  disabled={
                    cancelling ||
                    !cancelReason.trim()
                  }
                >
                  {cancelling
                    ? 'Cancelling...'
                    : 'Cancel Booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function createInitialBookingForm() {
  const now =
    new Date();

  const pad = (value) =>
    String(value).padStart(2, '0');

  return {
    pickupDate:
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,

    pickupTime:
      `${pad(now.getHours())}:${pad(now.getMinutes())}`,

    pickupAddress: '',
    pickupPostcode: '',
    pickupLatitude: null,
    pickupLongitude: null,
    pickupSavedLocationId: null,
    pickupLocationName: null,
    pickupPickupInstructions: null,

    destinationAddress: '',
    destinationPostcode: '',
    destinationLatitude: null,
    destinationLongitude: null,
    destinationSavedLocationId: null,
    destinationLocationName: null,
    destinationPickupInstructions: null,

    passengerName: '',
    passengerMobile: '',
    passengerCount: 1,
    budgetId: '',
    reasonCodeId: '',
    driverNotes: ''
  };
}


function sharedLocationSearchResult(
  location
) {
  return {
    id:
      `uhp-${location.id}`,
    source: 'uhp',
    savedLocationId:
      location.id,
    label:
      location.name,
    locationName:
      location.name,
    parentSite:
      location.parentSite || null,
    address:
      location.address,
    postcode:
      location.postcode || '',
    latitude:
      location.latitude,
    longitude:
      location.longitude,
    pickupInstructions:
      location.pickupInstructions || null
  };
}



function parseAddressHouseNumberQuery(
  rawQuery
) {
  const query =
    String(rawQuery || '')
      .trim();

  const match =
    query.match(
      /^(\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)\s+(.+)$/
    );

  if (!match) {
    return {
      houseNumber: '',
      streetQuery: ''
    };
  }

  return {
    houseNumber:
      match[1].trim(),

    streetQuery:
      match[2].trim()
  };
}


function normaliseAddressComparison(
  value
) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      ' '
    );
}


function isLocalAddressResult(
  result
) {
  const value =
    [
      result?.label,
      result?.address,
      result?.postcode
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

  return (
    value.includes('plymouth') ||
    /\bpl\d/i.test(
      String(
        result?.postcode || ''
      )
    )
  );
}


function preserveAddressHouseNumber(
  result,
  houseNumber,
  streetQuery
) {
  if (
    !houseNumber ||
    !streetQuery
  ) {
    return result;
  }

  const address =
    String(
      result?.address || ''
    ).trim();

  const label =
    String(
      result?.label ||
      address
    ).trim();

  const normalAddress =
    normaliseAddressComparison(
      address
    );

  const normalLabel =
    normaliseAddressComparison(
      label
    );

  const normalStreet =
    normaliseAddressComparison(
      streetQuery
    );

  const alreadyNumbered =
    new RegExp(
      `^${houseNumber.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      )}\\b`,
      'i'
    );

  if (
    alreadyNumbered.test(
      address
    ) ||
    alreadyNumbered.test(
      label
    )
  ) {
    return result;
  }

  /*
   * Only apply the typed house number when
   * MapTiler returned the actual searched
   * street. Never prepend it to an unrelated
   * POI or similarly named address.
   */
  /*
   * A user may type extra locality or postcode
   * information after the street name, e.g.
   * "11 Thackeray Gardens Plymouth PL5".
   *
   * Compare the returned street portion with
   * the beginning of the typed street query
   * rather than requiring the entire query to
   * match the formatted provider address.
   */
  const returnedStreet =
    normaliseAddressComparison(
      (
        address ||
        label
      )
        .split(',')[0]
        .replace(
          /[^\p{L}\p{N}\s'-]/gu,
          ' '
        )
    );

  const typedStreet =
    normaliseAddressComparison(
      streetQuery
        .replace(
          /[^\p{L}\p{N}\s'-]/gu,
          ' '
        )
    );

  const streetMatches =
    Boolean(
      returnedStreet &&
      typedStreet
    ) &&
    (
      typedStreet ===
        returnedStreet ||
      typedStreet.startsWith(
        `${returnedStreet} `
      )
    );

  if (!streetMatches) {
    return result;
  }

  return {
    ...result,

    label:
      `${houseNumber} ${label}`,

    address:
      `${houseNumber} ${address}`
  };
}


function sortExternalAddressResults(
  results
) {
  return [...results]
    .sort(
      (a, b) => {
        const aLocal =
          isLocalAddressResult(a)
            ? 0
            : 1;

        const bLocal =
          isLocalAddressResult(b)
            ? 0
            : 1;

        return aLocal - bLocal;
      }
    );
}


function preserveSelectedAddressHouseNumber(
  typedValue,
  result
) {
  const selected =
    String(
      result?.address ||
      result?.label ||
      ''
    ).trim();

  const typed =
    String(
      typedValue ||
      ''
    ).trim();

  if (
    !selected ||
    !typed
  ) {
    return selected;
  }

  const typedNumber =
    typed.match(
      /^(\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)\b/
    )?.[1];

  if (!typedNumber) {
    return selected;
  }

  const selectedNumber =
    selected.match(
      /^(\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)\b/
    )?.[1];

  if (selectedNumber) {
    return selected;
  }

  return (
    `${typedNumber} ${selected}`
  );
}


function BookingAddressAutocomplete({
  value,
  placeholder,
  required = false,
  searchEnabled = true,
  savedLocations = [],
  onChange,
  onSelect
}) {
  const [
    results,
    setResults
  ] = useState([]);

  const [
    searchState,
    setSearchState
  ] = useState('idle');

  const [
    open,
    setOpen
  ] = useState(false);

  const suppressNextSearch =
    useRef(false);

  const searchRequestSequence =
    useRef(0);

  useEffect(() => {
    const query =
      String(value || '')
        .trim();

    const requestSequence =
      ++searchRequestSequence.current;

    if (!searchEnabled) {
      suppressNextSearch.current =
        false;

      setResults([]);
      setSearchState('idle');
      setOpen(false);

      return;
    }

    if (suppressNextSearch.current) {
      suppressNextSearch.current =
        false;

      return;
    }

    if (query.length < 3) {
      setResults([]);
      setSearchState('idle');
      setOpen(false);

      return;
    }

    const normalisedQuery =
      query.toLowerCase();

    const sharedMatches =
      (
        Array.isArray(savedLocations)
          ? savedLocations
          : []
      )
        .filter((location) => {
          const searchable =
            [
              location.name,
              location.parentSite,
              location.address,
              location.postcode,
              location.category
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();

          return searchable.includes(
            normalisedQuery
          );
        })
        .slice(0, 8)
        .map(
          sharedLocationSearchResult
        );

    /*
      Shared UHP locations are available
      immediately and always rank above
      external address results.
    */
    setResults(sharedMatches);

    setSearchState(
      sharedMatches.length
        ? 'ready'
        : 'loading'
    );

    setOpen(
      sharedMatches.length > 0
    );

    const controller =
      new AbortController();

    const timer =
      window.setTimeout(
        async () => {
          if (!sharedMatches.length) {
            setSearchState(
              'loading'
            );
          }

          try {
            async function fetchExternalAddresses(
              searchQuery
            ) {
              const response =
                await apiFetch(
                  `${API_BASE}/api/geocoding/search?` +
                    new URLSearchParams({
                      q: searchQuery
                    }).toString(),
                  {
                    signal:
                      controller.signal
                  }
                );

              const data =
                await response.json();

              if (
                requestSequence !==
                  searchRequestSequence.current
              ) {
                return;
              }

              if (!response.ok) {
                throw new Error(
                  data.error ||
                    'Unable to search addresses'
                );
              }

              return (
                Array.isArray(
                  data.results
                )
                  ? data.results
                  : []
              );
            }

            const {
              houseNumber,
              streetQuery
            } =
              parseAddressHouseNumberQuery(
                query
              );

            const fullResults =
              await fetchExternalAddresses(
                query
              );

            /*
             * Avoid a second geocoding request
             * when MapTiler already resolved the
             * entered house number satisfactorily.
             */
            const normalisedFullQuery =
              normaliseAddressComparison(
                query
              );

            const hasGoodFullMatch =
              fullResults.some(
                (result) => {
                  const candidate =
                    normaliseAddressComparison(
                      result.address ||
                        result.label
                    );

                  return (
                    candidate.startsWith(
                      normalisedFullQuery
                    ) ||
                    (
                      houseNumber &&
                      new RegExp(
                        `^${houseNumber.replace(
                          /[.*+?^${}()|[\]\\]/g,
                          '\\$&'
                        )}\\b`,
                        'i'
                      ).test(candidate)
                    )
                  );
                }
              );

            let fallbackResults = [];

            if (
              houseNumber &&
              streetQuery.length >= 3 &&
              !hasGoodFullMatch
            ) {
              fallbackResults =
                await fetchExternalAddresses(
                  streetQuery
                );
            }

            const sharedAddresses =
              new Set(
                sharedMatches
                  .map(
                    (result) =>
                      normaliseAddressComparison(
                        result.address
                      )
                  )
                  .filter(Boolean)
              );

            const seenExternal =
              new Set();

            const externalResults =
              sortExternalAddressResults(
                [
                  ...fullResults,
                  ...fallbackResults
                ]
                  .map(
                    (result) => ({
                      ...preserveAddressHouseNumber(
                        result,
                        houseNumber,
                        streetQuery
                      ),

                      source:
                        'maptiler',

                      savedLocationId:
                        null,

                      locationName:
                        null,

                      pickupInstructions:
                        null,

                      parentSite:
                        null
                    })
                  )
                  .filter(
                    (result) => {
                      const key =
                        normaliseAddressComparison(
                          result.address ||
                            result.label
                        );

                      if (
                        !key ||
                        sharedAddresses.has(
                          key
                        ) ||
                        seenExternal.has(
                          key
                        )
                      ) {
                        return false;
                      }

                      seenExternal.add(
                        key
                      );

                      return true;
                    }
                  )
              );

            const nextResults = [
              ...sharedMatches,
              ...externalResults
            ];

            setResults(
              nextResults
            );

            setSearchState(
              'ready'
            );

            setOpen(
              nextResults.length > 0
            );
          } catch (error) {
            if (
              error?.name ===
              'AbortError'
            ) {
              return;
            }

            /*
              External lookup failure must
              not hide valid UHP locations.
            */
            if (sharedMatches.length) {
              setResults(
                sharedMatches
              );

              setSearchState(
                'ready'
              );

              setOpen(true);

              return;
            }

            setResults([]);
            setSearchState('error');
            setOpen(false);
          }
        },
        300
      );

    return () => {
      window.clearTimeout(
        timer
      );

      controller.abort();
    };
  }, [
    value,
    searchEnabled,
    savedLocations
  ]);

  function chooseResult(
    result
  ) {
    suppressNextSearch.current =
      true;

    searchRequestSequence.current +=
      1;

    setResults([]);
    setOpen(false);
    setSearchState('idle');

    onSelect({
      ...result,
      address:
        preserveSelectedAddressHouseNumber(
          value,
          result
        )
    });
  }

  return (
    <div className="booking-address-search">
      <input
        required={required}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          const nextValue =
            event.target.value;

          onChange(
            nextValue
          );

          if (
            nextValue
              .trim()
              .length >= 3
          ) {
            setOpen(true);
          }
        }}
        onFocus={() => {
          if (results.length) {
            setOpen(true);
          }
        }}
        onBlur={() => {
          window.setTimeout(
            () =>
              setOpen(false),
            140
          );
        }}
      />

      {searchState === 'loading' && (
        <span className="booking-address-search-state">
          Searching…
        </span>
      )}

      {open && results.length > 0 && (
        <div
          className="booking-address-results"
          role="listbox"
        >
          {results.map(
            (result) => (
              <button
                key={result.id}
                type="button"
                className={
                  `booking-address-result${
                    result.source === 'uhp'
                      ? ' uhp'
                      : ''
                  }`
                }
                onMouseDown={(event) =>
                  event.preventDefault()
                }
                onClick={() =>
                  chooseResult(
                    result
                  )
                }
              >
                <div className="booking-address-result-heading">
                  <strong>
                    {result.label}
                  </strong>

                  {result.source === 'uhp' && (
                    <span className="booking-address-result-badge">
                      UHP location
                    </span>
                  )}
                </div>

                {result.source === 'uhp' && (
                  <span className="booking-address-result-context">
                    {
                      [
                        result.parentSite,
                        result.address
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    }
                  </span>
                )}

                {result.postcode && (
                  <span className="booking-address-result-postcode">
                    {result.postcode}
                  </span>
                )}
              </button>
            )
          )}
        </div>
      )}

      {searchState === 'error' && (
        <span className="booking-address-search-state error">
          Address search temporarily unavailable
        </span>
      )}
    </div>
  );
}


function SavedLocationChips({
  locations,
  onSelect
}) {
  if (
    !Array.isArray(locations) ||
    locations.length === 0
  ) {
    return null;
  }

  return (
    <div className="booking-saved-locations">
      <span className="booking-saved-locations-label">
        Shared UHP locations
      </span>

      <div className="booking-saved-location-list">
        {locations.map(
          (location) => (
            <button
              key={location.id}
              type="button"
              className="booking-saved-location"
              onClick={() =>
                onSelect(location)
              }
              title={location.address}
            >
              {location.name}
            </button>
          )
        )}
      </div>
    </div>
  );
}


function BookingPlanningMap({
  pickup,
  vias,
  destination
}) {
  const [
    clearVehicles,
    setClearVehicles
  ] = useState([]);

  const [
    fleetState,
    setFleetState
  ] = useState('loading');

  const [
    fleetUpdatedAt,
    setFleetUpdatedAt
  ] = useState(null);

  const [
    roadRouteCoordinates,
    setRoadRouteCoordinates
  ] = useState([]);

  const [
    roadRouteState,
    setRoadRouteState
  ] = useState('idle');

  useEffect(() => {
    let cancelled = false;
    let intervalId = null;

    async function loadClearVehicles() {
      try {
        const response =
          await apiFetch(
            `${API_BASE}/api/booking-map/clear-vehicles`
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
            'Unable to load clear vehicles'
          );
        }

        if (cancelled) {
          return;
        }

        setClearVehicles(
          Array.isArray(
            data.vehicles
          )
            ? data.vehicles
            : []
        );

        setFleetUpdatedAt(
          data.generatedAt ||
          new Date().toISOString()
        );

        setFleetState(
          'ready'
        );
      } catch {
        if (cancelled) {
          return;
        }

        setFleetState(
          'error'
        );
      }
    }

    loadClearVehicles();

    intervalId =
      window.setInterval(
        loadClearVehicles,
        10000
      );

    return () => {
      cancelled = true;

      if (intervalId) {
        window.clearInterval(
          intervalId
        );
      }
    };
  }, []);

  function normalisePlanningStop(
    stop
  ) {
    if (
      stop?.latitude === null ||
      stop?.latitude === undefined ||
      stop?.longitude === null ||
      stop?.longitude === undefined
    ) {
      return null;
    }

    const latitude =
      Number(
        stop.latitude
      );

    const longitude =
      Number(
        stop.longitude
      );

    if (
      !Number.isFinite(
        latitude
      ) ||
      !Number.isFinite(
        longitude
      ) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return null;
    }

    return {
      ...stop,
      latitude,
      longitude
    };
  }

  const selectedPickup =
    normalisePlanningStop({
      stopType: 'pickup',
      label: 'P',
      address:
        pickup?.address,
      latitude:
        pickup?.latitude,
      longitude:
        pickup?.longitude
    });

  const selectedDestination =
    normalisePlanningStop({
      stopType:
        'destination',
      label: 'D',
      address:
        destination?.address,
      latitude:
        destination?.latitude,
      longitude:
        destination?.longitude
    });

  const journeyViaSelections =
    (
      Array.isArray(vias)
        ? vias
        : []
    )
      .map(
        (via, index) => ({
          via,
          index
        })
      )
      .filter(
        ({ via }) =>
          String(
            via?.address || ''
          )
            .trim()
            .length > 0
      )
      .map(
        ({ via, index }) =>
          normalisePlanningStop({
            stopType: 'via',
            label:
              String(
                index + 1
              ),
            address:
              via.address,
            latitude:
              via.latitude,
            longitude:
              via.longitude
          })
      );

  const allJourneyViasSelected =
    journeyViaSelections.every(
      Boolean
    );

  const selectedVias =
    journeyViaSelections
      .filter(Boolean);

  function distanceBetweenKm(
    latitude1,
    longitude1,
    latitude2,
    longitude2
  ) {
    const toRadians =
      (degrees) =>
        degrees *
        Math.PI /
        180;

    const earthRadiusKm =
      6371;

    const deltaLatitude =
      toRadians(
        latitude2 -
        latitude1
      );

    const deltaLongitude =
      toRadians(
        longitude2 -
        longitude1
      );

    const firstLatitude =
      toRadians(
        latitude1
      );

    const secondLatitude =
      toRadians(
        latitude2
      );

    const a =
      Math.sin(
        deltaLatitude / 2
      ) ** 2 +
      Math.cos(
        firstLatitude
      ) *
      Math.cos(
        secondLatitude
      ) *
      Math.sin(
        deltaLongitude / 2
      ) ** 2;

    return (
      earthRadiusKm *
      2 *
      Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
      )
    );
  }

  const nearbyClearVehicles =
    selectedPickup
      ? clearVehicles
          .map(
            (vehicle) => ({
              ...vehicle,

              distanceKm:
                distanceBetweenKm(
                  selectedPickup.latitude,
                  selectedPickup.longitude,
                  Number(
                    vehicle.latitude
                  ),
                  Number(
                    vehicle.longitude
                  )
                )
            })
          )
          .filter(
            (vehicle) =>
              Number.isFinite(
                vehicle.distanceKm
              ) &&
              vehicle.distanceKm <= 15
          )
          .sort(
            (a, b) =>
              a.distanceKm -
              b.distanceKm
          )
          .slice(
            0,
            5
          )
      : [];

  const visibleStops =
    [
      selectedPickup,
      ...selectedVias,
      selectedDestination
    ]
      .filter(Boolean);

  const canRoute =
    Boolean(
      selectedPickup &&
      selectedDestination &&
      allJourneyViasSelected
    );

  const routedStops =
    canRoute
      ? [
          selectedPickup,
          ...selectedVias,
          selectedDestination
        ]
      : [];

  const routeCoordinates =
    routedStops.map(
      (stop) => [
        stop.latitude,
        stop.longitude
      ]
    );

  const routeRequestCoordinates =
    canRoute
      ? routedStops
          .map(
            (stop) =>
              `${stop.longitude},${stop.latitude}`
          )
          .join(';')
      : '';

  useEffect(() => {
    if (
      !canRoute ||
      routedStops.length < 2 ||
      !routeRequestCoordinates
    ) {
      setRoadRouteCoordinates(
        []
      );

      setRoadRouteState(
        'idle'
      );

      return;
    }

    const controller =
      new AbortController();

    setRoadRouteCoordinates(
      []
    );

    setRoadRouteState(
      'loading'
    );

    const url =
      `${API_BASE}/api/routing/route?` +
      new URLSearchParams({
        coordinates:
          routeRequestCoordinates
      }).toString();

    apiFetch(
      url,
      {
        signal:
          controller.signal
      }
    )
      .then(
        async (response) => {
          const data =
            await response.json();

          if (!response.ok) {
            throw new Error(
              data.error ||
              'Unable to calculate route'
            );
          }

          return data;
        }
      )
      .then((data) => {
        const coordinates =
          data?.route
            ?.geometry
            ?.coordinates;

        if (
          data?.code !== 'Ok' ||
          !Array.isArray(
            coordinates
          )
        ) {
          throw new Error(
            'Routing service returned no usable route'
          );
        }

        const roadCoordinates =
          coordinates
            .map(
              (coordinate) => [
                Number(
                  coordinate?.[1]
                ),
                Number(
                  coordinate?.[0]
                )
              ]
            )
            .filter(
              ([latitude, longitude]) =>
                Number.isFinite(
                  latitude
                ) &&
                Number.isFinite(
                  longitude
                )
            );

        if (
          roadCoordinates.length < 2
        ) {
          throw new Error(
            'Routing service returned an empty route'
          );
        }

        setRoadRouteCoordinates(
          roadCoordinates
        );

        setRoadRouteState(
          'ready'
        );
      })
      .catch((error) => {
        if (
          error?.name ===
          'AbortError'
        ) {
          return;
        }

        setRoadRouteCoordinates(
          []
        );

        setRoadRouteState(
          'fallback'
        );
      });

    return () => {
      controller.abort();
    };
  }, [
    canRoute,
    routeRequestCoordinates
  ]);

  const displayedRouteCoordinates =
    roadRouteCoordinates.length > 1
      ? roadRouteCoordinates
      : routeCoordinates;

  const pickupFleetCoordinates =
    selectedPickup
      ? [
          [
            selectedPickup.latitude,
            selectedPickup.longitude
          ],

          ...nearbyClearVehicles.map(
            (vehicle) => [
              Number(
                vehicle.latitude
              ),
              Number(
                vehicle.longitude
              )
            ]
          )
        ]
      : [];

  const mapBoundsCoordinates =
    canRoute
      ? displayedRouteCoordinates
      : pickupFleetCoordinates.length
        ? pickupFleetCoordinates
        : visibleStops.map(
            (stop) => [
              stop.latitude,
              stop.longitude
            ]
          );

  const defaultCentre =
    mapBoundsCoordinates[0] ||
    [50.4169, -4.1138];

  const createStopPinIcon = (
    markerClass,
    label
  ) =>
    L.divIcon({
      className:
        'booking-map-div-icon booking-map-pin-wrapper',

      html: `
        <span class="booking-map-pin ${markerClass}">
          <span class="booking-map-pin-label">
            ${label}
          </span>
        </span>
      `,

      iconSize: [32, 44],
      iconAnchor: [16, 44],
      popupAnchor: [0, -39]
    });

  const pickupIcon =
    createStopPinIcon(
      'pickup',
      'P'
    );

  const destinationIcon =
    createStopPinIcon(
      'destination',
      'D'
    );

  const viaIcon = (
    label
  ) =>
    createStopPinIcon(
      'via',
      label
    );

  const clearVehicleIcon =
    (vehicle) => {
      const heading =
        Number.isFinite(
          Number(
            vehicle.headingDegrees
          )
        )
          ? Number(
              vehicle.headingDegrees
            )
          : 0;

      const callsign =
        String(
          vehicle.callsign || '?'
        )
          .replace(
            /[<>&"']/g,
            ''
          );

      return L.divIcon({
        className:
          'booking-map-div-icon booking-clear-vehicle-icon',

        html: `
          <span class="booking-clear-vehicle-marker">
            <span class="booking-clear-vehicle-badge">
              <svg
                class="booking-clear-vehicle-svg"
                viewBox="0 0 32 32"
                aria-hidden="true"
                focusable="false"
                style="transform:rotate(${heading}deg)"
              >
                <rect
                  x="10"
                  y="5"
                  width="12"
                  height="22"
                  rx="4"
                />
                <rect
                  x="12"
                  y="8"
                  width="8"
                  height="5"
                  rx="1.5"
                  class="booking-clear-vehicle-glass"
                />
                <rect
                  x="12"
                  y="15"
                  width="8"
                  height="5"
                  rx="1.5"
                  class="booking-clear-vehicle-glass"
                />
                <rect
                  x="8"
                  y="9"
                  width="3"
                  height="5"
                  rx="1"
                />
                <rect
                  x="21"
                  y="9"
                  width="3"
                  height="5"
                  rx="1"
                />
                <rect
                  x="8"
                  y="18"
                  width="3"
                  height="5"
                  rx="1"
                />
                <rect
                  x="21"
                  y="18"
                  width="3"
                  height="5"
                  rx="1"
                />
                <path
                  d="M13 5 L16 2 L19 5 Z"
                />
              </svg>

              <span
                class="booking-clear-vehicle-status"
                aria-hidden="true"
              ></span>
            </span>

            <span class="booking-clear-vehicle-callsign">
              ${callsign}
            </span>
          </span>
        `,

        iconSize: [54, 48],
        iconAnchor: [20, 20],
        popupAnchor: [0, -17]
      });
    };

  return (
    <div className="booking-planning-map-card">
      <div className="booking-planning-map-heading">
        <div>
          <span className="booking-planning-eyebrow">
            Live Fleet
          </span>

          <h3>
            Journey Map
          </h3>

          <p>
            The five nearest clear vehicles appear after a pickup is selected.
          </p>
        </div>

        <div
          className={`booking-clear-count ${fleetState}`}
        >
          <strong>
            {selectedPickup &&
            fleetState === 'ready'
              ? nearbyClearVehicles.length
              : '—'}
          </strong>

          <span>
            Nearby
          </span>
        </div>
      </div>

      <div className="booking-route-map-shell booking-planning-map-shell">
        <MapContainer
          className="booking-route-map booking-planning-map"
          center={defaultCentre}
          zoom={12}
          scrollWheelZoom={false}
        >
          {MAP_TILE_URL && (
            <TileLayer
              attribution={
                MAP_TILE_ATTRIBUTION
              }
              url={
                MAP_TILE_URL
              }
            />
          )}

          {mapBoundsCoordinates.length > 0 && (
            <BookingMapBounds
              coordinates={
                mapBoundsCoordinates
              }
            />
          )}

          {displayedRouteCoordinates.length > 1 && (
            <Polyline
              positions={
                displayedRouteCoordinates
              }
              pathOptions={{
                weight: 4,
                opacity: 0.78
              }}
            />
          )}

          {visibleStops.map(
            (stop, index) => {
              const icon =
                stop.stopType ===
                  'pickup'
                  ? pickupIcon
                  : stop.stopType ===
                      'destination'
                    ? destinationIcon
                    : viaIcon(
                        stop.label
                      );

              return (
                <Marker
                  key={
                    `planning-${stop.stopType}-${index}`
                  }
                  position={[
                    stop.latitude,
                    stop.longitude
                  ]}
                  icon={icon}
                  zIndexOffset={500}
                >
                  <Popup>
                    <strong>
                      {stop.stopType ===
                      'pickup'
                        ? 'Pickup'
                        : stop.stopType ===
                            'destination'
                          ? 'Destination'
                          : `Via ${stop.label}`}
                    </strong>

                    {stop.address && (
                      <div>
                        {stop.address}
                      </div>
                    )}
                  </Popup>
                </Marker>
              );
            }
          )}

          {nearbyClearVehicles.map(
            (vehicle) => (
              <Marker
                key={
                  `clear-${vehicle.vehicleId}`
                }
                position={[
                  vehicle.latitude,
                  vehicle.longitude
                ]}
                icon={
                  clearVehicleIcon(
                    vehicle
                  )
                }
              >
                <Popup>
                  <strong>
                    Clear car {vehicle.callsign || '—'}
                  </strong>

                  <div>
                    Available
                    {Number.isFinite(
                      vehicle.distanceKm
                    )
                      ? ` · ${vehicle.distanceKm.toFixed(1)} km from pickup`
                      : ''}
                  </div>
                </Popup>
              </Marker>
            )
          )}
        </MapContainer>

        <div className="booking-planning-map-footer">
          <span className="booking-clear-legend">
            <i
              className="booking-map-live-car-symbol"
              aria-hidden="true"
            />

            Nearest clear vehicles
          </span>

          <span>
            {roadRouteState === 'loading'
              ? 'Calculating road route…'
              : roadRouteState === 'ready'
                ? 'Road route ready'
                : roadRouteState === 'fallback'
                  ? 'Showing stop-to-stop route'
                  : fleetState === 'loading'
                    ? 'Loading live fleet…'
                    : fleetState === 'error'
                      ? 'Live fleet temporarily unavailable'
                      : fleetUpdatedAt
                        ? 'Live fleet connected'
                        : ''}
          </span>
        </div>
      </div>

      <div className="booking-planning-route-hint">
        {canRoute
          ? 'Route updates automatically when journey locations change.'
          : 'Select every entered journey location to show the road route.'}
      </div>
    </div>
  );
}



function SpecialTransportJourneyMap({
  pickupAddress,
  pickupLatitude,
  pickupLongitude,
  destinationAddress,
  destinationLatitude,
  destinationLongitude
}) {
  const pickupLat =
    Number(pickupLatitude);

  const pickupLng =
    Number(pickupLongitude);

  const destinationLat =
    Number(destinationLatitude);

  const destinationLng =
    Number(destinationLongitude);

  const hasCoordinate =
    (value) =>
      value !== null &&
      value !== undefined &&
      value !== '' &&
      Number.isFinite(
        Number(value)
      );

  const canRoute =
    hasCoordinate(
      pickupLatitude
    ) &&
    hasCoordinate(
      pickupLongitude
    ) &&
    hasCoordinate(
      destinationLatitude
    ) &&
    hasCoordinate(
      destinationLongitude
    ) &&
    Number.isFinite(pickupLat) &&
    Number.isFinite(pickupLng) &&
    Number.isFinite(destinationLat) &&
    Number.isFinite(destinationLng);

  const [
    roadRouteCoordinates,
    setRoadRouteCoordinates
  ] = useState([]);

  const [
    routeState,
    setRouteState
  ] = useState('idle');

  const routeRequestCoordinates =
    canRoute
      ? [
          `${pickupLng},${pickupLat}`,
          `${destinationLng},${destinationLat}`
        ].join(';')
      : '';

  useEffect(
    () => {
      if (
        !canRoute ||
        !routeRequestCoordinates
      ) {
        setRoadRouteCoordinates([]);
        setRouteState('idle');

        return;
      }

      const controller =
        new AbortController();

      setRoadRouteCoordinates([]);
      setRouteState('loading');

      const url =
        `${API_BASE}/api/routing/route?` +
        new URLSearchParams({
          coordinates:
            routeRequestCoordinates
        }).toString();

      apiFetch(
        url,
        {
          signal:
            controller.signal
        }
      )
        .then(
          (response) => {
            if (!response.ok) {
              throw new Error(
                `Routing service returned ${response.status}`
              );
            }

            return response.json();
          }
        )
        .then(
          (data) => {
            const coordinates =
              data?.route
                ?.geometry
                ?.coordinates;

            if (
              data?.code !== 'Ok' ||
              !Array.isArray(
                coordinates
              )
            ) {
              throw new Error(
                'Routing service returned no usable route'
              );
            }

            const nextCoordinates =
              coordinates
                .map(
                  (coordinate) => {
                    const longitude =
                      Number(
                        coordinate?.[0]
                      );

                    const latitude =
                      Number(
                        coordinate?.[1]
                      );

                    return [
                      latitude,
                      longitude
                    ];
                  }
                )
                .filter(
                  ([latitude, longitude]) =>
                    Number.isFinite(
                      latitude
                    ) &&
                    Number.isFinite(
                      longitude
                    )
                );

            if (
              nextCoordinates.length < 2
            ) {
              throw new Error(
                'Routing service returned an empty route'
              );
            }

            setRoadRouteCoordinates(
              nextCoordinates
            );

            setRouteState(
              'ready'
            );
          }
        )
        .catch(
          (error) => {
            if (
              error?.name ===
                'AbortError'
            ) {
              return;
            }

            setRoadRouteCoordinates(
              []
            );

            setRouteState(
              'fallback'
            );
          }
        );

      return () => {
        controller.abort();
      };
    },
    [
      canRoute,
      routeRequestCoordinates
    ]
  );

  if (!canRoute) {
    return null;
  }

  const directCoordinates = [
    [
      pickupLat,
      pickupLng
    ],
    [
      destinationLat,
      destinationLng
    ]
  ];

  const displayedCoordinates =
    roadRouteCoordinates.length > 1
      ? roadRouteCoordinates
      : directCoordinates;

  const pickupIcon =
    L.divIcon({
      className:
        'booking-map-div-icon booking-map-pin-wrapper',

      html:
        '<span class="booking-map-pin pickup">' +
        '<span class="booking-map-pin-label">P</span>' +
        '</span>',

      iconSize: [32, 44],
      iconAnchor: [16, 44],
      popupAnchor: [0, -39]
    });

  const destinationIcon =
    L.divIcon({
      className:
        'booking-map-div-icon booking-map-pin-wrapper',

      html:
        '<span class="booking-map-pin destination">' +
        '<span class="booking-map-pin-label">D</span>' +
        '</span>',

      iconSize: [32, 44],
      iconAnchor: [16, 44],
      popupAnchor: [0, -39]
    });

  return (
    <div className="special-transport-journey-map-card">
      <div className="special-transport-journey-map-heading">
        <div>
          <strong>
            Journey check
          </strong>

          <span>
            Check the requested pickup and destination are correct.
          </span>
        </div>

        <small>
          {routeState === 'loading'
            ? 'Calculating route…'
            : routeState === 'ready'
              ? 'Road route'
              : routeState === 'fallback'
                ? 'Approximate route'
                : ''}
        </small>
      </div>

      <div className="special-transport-journey-map-shell">
        <MapContainer
          className="special-transport-journey-map"
          center={[
            pickupLat,
            pickupLng
          ]}
          zoom={12}
          scrollWheelZoom={false}
        >
          {MAP_TILE_URL && (
            <TileLayer
              attribution={
                MAP_TILE_ATTRIBUTION
              }
              url={
                MAP_TILE_URL
              }
            />
          )}

          <BookingMapBounds
            coordinates={
              directCoordinates
            }
          />

          {displayedCoordinates.length > 1 && (
            <Polyline
              positions={
                displayedCoordinates
              }
              pathOptions={{
                weight: 4,
                opacity: 0.78
              }}
            />
          )}

          <Marker
            position={[
              pickupLat,
              pickupLng
            ]}
            icon={pickupIcon}
            zIndexOffset={500}
          >
            <Popup>
              <strong>
                Pickup
              </strong>

              {pickupAddress && (
                <div>
                  {pickupAddress}
                </div>
              )}
            </Popup>
          </Marker>

          <Marker
            position={[
              destinationLat,
              destinationLng
            ]}
            icon={
              destinationIcon
            }
            zIndexOffset={500}
          >
            <Popup>
              <strong>
                Destination
              </strong>

              {destinationAddress && (
                <div>
                  {destinationAddress}
                </div>
              )}
            </Popup>
          </Marker>
        </MapContainer>
      </div>

      <div className="special-transport-journey-map-note">
        This shows the requested journey only.
        Shared-route planning and the final taxi
        pickup time will be confirmed later.
      </div>
    </div>
  );
}


function specialTransportLocalDateTime(
  value
) {
  if (!value) return '';

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(value)
      .slice(0, 16);
  }

  const pad =
    (number) =>
      String(number)
        .padStart(2, '0');

  return (
    `${date.getFullYear()}-` +
    `${pad(date.getMonth() + 1)}-` +
    `${pad(date.getDate())}T` +
    `${pad(date.getHours())}:` +
    `${pad(date.getMinutes())}`
  );
}


function specialTransportWindowButtonLabel(
  option
) {
  const name =
    String(
      option?.windowName || ''
    )
      .replace(
        /\s+service$/i,
        ''
      )
      .trim();

  if (name) {
    return name;
  }

  const date =
    new Date(
      option?.startsAt || ''
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return 'Service';
  }

  return new Intl.DateTimeFormat(
    'en-GB',
    {
      day: 'numeric',
      month: 'short'
    }
  ).format(date);
}


function SpecialTransportAddressSearch({
  value,
  savedLocations,
  placeholder,
  onChange,
  onSelect
}) {
  return (
    <BookingAddressAutocomplete
      value={value}
      placeholder={placeholder}
      required
      searchEnabled
      savedLocations={savedLocations}
      onChange={onChange}
      onSelect={onSelect}
    />
  );
}


function formatStaffTransportDateTimeLocal(
  value
) {
  if (!value) return '';

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '';
  }

  const pad = (number) =>
    String(number).padStart(
      2,
      '0'
    );

  return [
    date.getFullYear(),
    '-',
    pad(
      date.getMonth() + 1
    ),
    '-',
    pad(
      date.getDate()
    ),
    'T',
    pad(
      date.getHours()
    ),
    ':',
    pad(
      date.getMinutes()
    )
  ].join('');
}


function staffTransportQuickDates(
  option
) {
  if (
    !option?.startsAt ||
    !option?.endsAt
  ) {
    return [];
  }

  const start =
    new Date(
      option.startsAt
    );

  const end =
    new Date(
      option.endsAt
    );

  if (
    Number.isNaN(
      start.getTime()
    ) ||
    Number.isNaN(
      end.getTime()
    )
  ) {
    return [];
  }

  const dates = [];
  const cursor =
    new Date(start);

  cursor.setHours(
    12,
    0,
    0,
    0
  );

  while (
    cursor < end &&
    dates.length < 8
  ) {
    dates.push(
      new Date(cursor)
    );

    cursor.setDate(
      cursor.getDate() + 1
    );
  }

  return dates;
}


function formatStaffTransportQuickDate(
  value
) {
  return new Intl.DateTimeFormat(
    'en-GB',
    {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    }
  ).format(value);
}


function applyStaffTransportQuickDate(
  currentValue,
  date
) {
  const current =
    currentValue
      ? new Date(
          currentValue
        )
      : null;

  const next =
    new Date(date);

  if (
    current &&
    !Number.isNaN(
      current.getTime()
    )
  ) {
    next.setHours(
      current.getHours(),
      current.getMinutes(),
      0,
      0
    );
  } else {
    next.setHours(
      8,
      0,
      0,
      0
    );
  }

  return formatStaffTransportDateTimeLocal(
    next
  );
}


function staffTransportStatusTone(
  status
) {
  if (
    [
      'confirmed',
      'locked',
      'booked'
    ].includes(status)
  ) {
    return 'green';
  }

  if (
    [
      'needs_information',
      'change_requested',
      'not_accommodated',
      'cancelled'
    ].includes(status)
  ) {
    return 'red';
  }

  return 'amber';
}


function preserveStaffTransportHouseNumber(
  typedValue,
  result
) {
  const selected =
    String(
      result?.address ||
      result?.label ||
      ''
    ).trim();

  const typed =
    String(
      typedValue ||
      ''
    ).trim();

  if (
    !selected ||
    !typed
  ) {
    return selected;
  }

  const typedNumber =
    typed.match(
      /^(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?)\b/
    )?.[1];

  if (!typedNumber) {
    return selected;
  }

  const selectedNumber =
    selected.match(
      /^(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?)\b/
    )?.[1];

  if (selectedNumber) {
    return selected;
  }

  return `${typedNumber} ${selected}`;
}


function staffTransportStatusMessage(
  status
) {
  const messages = {
    submitted:
      'Your request has been received and is waiting to be checked.',

    needs_information:
      'We need some more information before planning can continue.',

    ready_for_planning:
      'Your details have been checked and your request is ready for route planning.',

    planned:
      'Your journey is currently being grouped and route planned.',

    awaiting_confirmation:
      'Your proposed travel arrangements are ready for confirmation.',

    confirmed:
      'Your transport request has been confirmed.',

    locked:
      'Your travel arrangements are now locked for operation.',

    booked:
      'Your transport has been booked.',

    change_requested:
      'A change has been requested and is waiting to be reviewed.',

    not_accommodated:
      'Unfortunately this request could not be accommodated.',

    cancelled:
      'This transport request has been cancelled.'
  };

  return (
    messages[status] ||
    'Your transport request is being processed.'
  );
}


function createInitialStaffTransportForm() {
  return {
    programmeWindowId: '',
    direction: 'to_work',
    shiftTime: '',
    shiftDate: '2026-12-25',
    shiftClock: '',

    pickupAddress: '',
    pickupPostcode: '',
    pickupLatitude: null,
    pickupLongitude: null,

    destinationAddress: '',
    destinationPostcode: '',
    destinationLatitude: null,
    destinationLongitude: null,

    budgetId: '',
    reasonCodeId: '',

    passengerNotes: ''
  };
}


function StaffTransportAddressShortcuts({
  title,
  locations,
  onSelect
}) {
  if (
    !Array.isArray(
      locations
    ) ||
    locations.length === 0
  ) {
    return null;
  }

  return (
    <div className="staff-transport-address-shortcuts">
      <span>
        {title}
      </span>

      <div>
        {locations.map(
          (location) => (
            <button
              key={
                `${location.id || location.address}`
              }
              type="button"
              onClick={() =>
                onSelect(
                  location
                )
              }
            >
              {location.name ||
                location.label ||
                location.address}
            </button>
          )
        )}
      </div>
    </div>
  );
}


function StaffTransportAddressSearch({
  value,
  savedLocations,
  placeholder,
  onChange,
  onSelect
}) {
  const [
    results,
    setResults
  ] = useState([]);

  const [
    searchState,
    setSearchState
  ] = useState('idle');

  const [
    open,
    setOpen
  ] = useState(false);

  const suppressNextSearch =
    useRef(false);

  const searchRequestSequence =
    useRef(0);

  const userTypedSearch =
    useRef(false);

  useEffect(
    () => {
      const query =
        String(
          value || ''
        ).trim();

      const requestSequence =
        ++searchRequestSequence.current;

      if (
        suppressNextSearch.current
      ) {
        suppressNextSearch.current =
          false;
        userTypedSearch.current =
          false;

        setResults([]);
        setSearchState('idle');
        setOpen(false);

        return;
      }

      if (!userTypedSearch.current) {
        setResults([]);
        setSearchState('idle');
        setOpen(false);

        return;
      }

      userTypedSearch.current =
        false;

      if (query.length < 3) {
        setResults([]);
        setSearchState('idle');
        setOpen(false);

        return;
      }

      const normalisedQuery =
        query.toLowerCase();

      const sharedMatches =
        (
          Array.isArray(
            savedLocations
          )
            ? savedLocations
            : []
        )
          .filter(
            (location) => {
              const searchable =
                [
                  location.name,
                  location.address,
                  location.postcode,
                  location.category
                ]
                  .filter(Boolean)
                  .join(' ')
                  .toLowerCase();

              return searchable.includes(
                normalisedQuery
              );
            }
          )
          .slice(0, 8)
          .map(
            sharedLocationSearchResult
          );

      setResults(
        sharedMatches
      );

      setSearchState(
        sharedMatches.length
          ? 'ready'
          : 'loading'
      );

      setOpen(
        sharedMatches.length > 0
      );

      const controller =
        new AbortController();

      const timer =
        window.setTimeout(
          async () => {
            try {
              const response =
                await apiFetch(
                  `${API_BASE}/api/staff-transport/geocoding/search?` +
                  new URLSearchParams({
                    q: query
                  }).toString(),
                  {
                    signal:
                      controller.signal
                  }
                );

              const data =
                await response.json();

              if (
                requestSequence !==
                  searchRequestSequence.current
              ) {
                return;
              }

              if (!response.ok) {
                throw new Error(
                  data.error ||
                    'Unable to search addresses'
                );
              }

              const sharedAddresses =
                new Set(
                  sharedMatches
                    .map(
                      (result) =>
                        String(
                          result.address ||
                            ''
                        )
                          .trim()
                          .toLowerCase()
                    )
                    .filter(Boolean)
                );

              const externalResults =
                (
                  Array.isArray(
                    data.results
                  )
                    ? data.results
                    : []
                )
                  .map(
                    (result) => ({
                      ...result,
                      source:
                        'maptiler'
                    })
                  )
                  .filter(
                    (result) =>
                      !sharedAddresses.has(
                        String(
                          result.address ||
                            ''
                        )
                          .trim()
                          .toLowerCase()
                      )
                  );

              const nextResults = [
                ...sharedMatches,
                ...externalResults
              ];

              setResults(
                nextResults
              );

              setSearchState(
                'ready'
              );

              setOpen(
                nextResults.length > 0
              );
            } catch (error) {
              if (
                error?.name ===
                  'AbortError'
              ) {
                return;
              }

              if (
                sharedMatches.length
              ) {
                setResults(
                  sharedMatches
                );

                setSearchState(
                  'ready'
                );

                setOpen(true);
                return;
              }

              setResults([]);
              setSearchState(
                'error'
              );
              setOpen(false);
            }
          },
          300
        );

      return () => {
        window.clearTimeout(
          timer
        );

        controller.abort();
      };
    },
    [
      value,
      savedLocations
    ]
  );

  function chooseResult(
    result
  ) {
    suppressNextSearch.current =
      true;

    searchRequestSequence.current +=
      1;

    setResults([]);
    setOpen(false);
    setSearchState('idle');

    onSelect({
      ...result,
      address:
        preserveSelectedAddressHouseNumber(
          value,
          result
        )
    });
  }

  return (
    <div className="booking-address-search staff-transport-address-search">
      <input
        required
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          const nextValue =
            event.target.value;

          userTypedSearch.current =
            true;

          onChange(
            nextValue
          );

          if (
            nextValue.trim().length >= 3
          ) {
            setOpen(true);
          }
        }}
        onFocus={() => {
          if (results.length) {
            setOpen(true);
          }
        }}
        onBlur={() => {
          window.setTimeout(
            () =>
              setOpen(false),
            140
          );
        }}
      />

      {searchState ===
        'loading' && (
        <span className="booking-address-search-state">
          Searching…
        </span>
      )}

      {open &&
        results.length > 0 && (
        <div
          className="booking-address-results"
          role="listbox"
        >
          {results.map(
            (result) => (
              <button
                key={result.id}
                type="button"
                className={
                  `booking-address-result${
                    result.source === 'uhp'
                      ? ' uhp'
                      : ''
                  }`
                }
                onMouseDown={(event) =>
                  event.preventDefault()
                }
                onClick={() =>
                  chooseResult(
                    result
                  )
                }
              >
                <div className="booking-address-result-heading">
                  <strong>
                    {result.label}
                  </strong>

                  {result.source ===
                    'uhp' && (
                    <span className="booking-address-result-badge">
                      UHP location
                    </span>
                  )}
                </div>

                {result.source ===
                  'uhp' && (
                  <span className="booking-address-result-context">
                    {result.address}
                  </span>
                )}

                {result.postcode && (
                  <span className="booking-address-result-postcode">
                    {result.postcode}
                  </span>
                )}
              </button>
            )
          )}
        </div>
      )}

      {searchState ===
        'error' && (
        <span className="booking-address-search-state error">
          Address search temporarily unavailable
        </span>
      )}
    </div>
  );
}


function StaffTransportAuth({
  initialStaff,
  onAuthenticated
}) {
  const initialStage = () => {
    if (!initialStaff) {
      return 'email';
    }

    if (
      !initialStaff.firstName ||
      !initialStaff.lastName ||
      !initialStaff.mobile
    ) {
      return 'profile';
    }

    if (
      !initialStaff.mobileVerifiedAt
    ) {
      return 'sms_request';
    }

    return 'complete';
  };

  const [
    step,
    setStep
  ] = useState(
    initialStage()
  );

  const [
    staff,
    setStaff
  ] = useState(
    initialStaff || null
  );

  const [
    email,
    setEmail
  ] = useState(
    initialStaff?.email || ''
  );

  const [
    accessCode,
    setAccessCode
  ] = useState('');

  const [
    firstName,
    setFirstName
  ] = useState(
    initialStaff?.firstName || ''
  );

  const [
    lastName,
    setLastName
  ] = useState(
    initialStaff?.lastName || ''
  );

  const [
    mobile,
    setMobile
  ] = useState(
    initialStaff?.mobile || ''
  );

  const [
    challengeId,
    setChallengeId
  ] = useState('');

  const [
    code,
    setCode
  ] = useState('');

  const [
    sending,
    setSending
  ] = useState(false);

  const [
    error,
    setError
  ] = useState('');

  useEffect(
    () => {
      if (
        step === 'complete' &&
        staff?.status === 'active'
      ) {
        onAuthenticated(
          staff
        );
      }
    },
    [
      step,
      staff,
      onAuthenticated
    ]
  );

  async function requestEmailCode(
    event
  ) {
    event.preventDefault();

    setSending(true);
    setError('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/staff-transport/auth/request-email-code`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body:
              JSON.stringify({
                email,
                accessCode
              })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to send verification code'
        );
      }

      setEmail(
        data.email
      );

      setChallengeId(
        data.challengeId
      );

      setCode('');
      setStep(
        'email_code'
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to continue'
      );
    } finally {
      setSending(false);
    }
  }

  async function verifyEmailCode(
    event
  ) {
    event.preventDefault();

    setSending(true);
    setError('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/staff-transport/auth/verify-email-code`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body:
              JSON.stringify({
                challengeId,
                code
              })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to verify code'
        );
      }

      setStaff(
        data.staff
      );

      setFirstName(
        data.staff?.firstName ||
          ''
      );

      setLastName(
        data.staff?.lastName ||
          ''
      );

      setMobile(
        data.staff?.mobile ||
          ''
      );

      setCode('');

      if (
        data.staff?.status ===
          'active' &&
        data.staff?.mobileVerifiedAt
      ) {
        setStep(
          'complete'
        );
      } else if (
        data.staff?.firstName &&
        data.staff?.lastName &&
        data.staff?.mobile
      ) {
        setStep(
          'sms_request'
        );
      } else {
        setStep(
          'profile'
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to verify code'
      );
    } finally {
      setSending(false);
    }
  }

  async function saveProfile(
    event
  ) {
    event.preventDefault();

    setSending(true);
    setError('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/staff-transport/auth/profile`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type':
                'application/json'
            },
            body:
              JSON.stringify({
                firstName,
                lastName,
                mobile
              })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to save your details'
        );
      }

      setStaff(
        data.staff
      );

      setMobile(
        data.staff?.mobile ||
          mobile
      );

      await requestSmsCode();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save your details'
      );
    } finally {
      setSending(false);
    }
  }

  async function requestSmsCode() {
    setSending(true);
    setError('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/staff-transport/auth/request-sms-code`,
          {
            method: 'POST'
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to send text message'
        );
      }

      setChallengeId(
        data.challengeId
      );

      setCode('');
      setStep(
        'sms_code'
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to send text message'
      );
    } finally {
      setSending(false);
    }
  }

  async function verifySmsCode(
    event
  ) {
    event.preventDefault();

    setSending(true);
    setError('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/staff-transport/auth/verify-sms-code`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body:
              JSON.stringify({
                challengeId,
                code
              })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to verify mobile'
        );
      }

      setStaff(
        data.staff
      );

      setStep(
        'complete'
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to verify mobile'
      );
    } finally {
      setSending(false);
    }
  }

  const heading =
    step === 'email'
      ? 'Christmas & New Year Staff Transport'
      : step === 'email_code'
        ? 'Check your email'
        : step === 'profile'
          ? 'Your contact details'
          : step === 'sms_request' ||
              step === 'sms_code'
            ? 'Verify your mobile'
            : 'Signing you in…';

  return (
    <div className="staff-transport-auth-shell">
      <div className="staff-transport-auth-panel">
        <div className="staff-transport-brand">
          <strong>UHP</strong>

          <span>
            Staff Transport
          </span>
        </div>

        <div className="staff-transport-auth-card">
          <span className="auth-kicker">
            Secure staff access
          </span>

          <h1>
            {heading}
          </h1>

          <p className="staff-transport-auth-intro">
            Request special staff transport for
            yourself using your verified email
            address and mobile number.
          </p>

          {error && (
            <div className="notice error">
              {error}
            </div>
          )}

          {step === 'email' && (
            <form
              className="staff-transport-auth-form"
              onSubmit={
                requestEmailCode
              }
            >
              <label>
                Email address

                <input
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) =>
                    setEmail(
                      event.target.value
                    )
                  }
                  required
                  autoFocus
                />
              </label>

              <label>
                UHP Staff Transport access code

                <input
                  type="text"
                  autoComplete="off"
                  placeholder="Enter access code"
                  value={accessCode}
                  onChange={(event) =>
                    setAccessCode(
                      event.target.value
                    )
                  }
                />

                <small>
                  First time using Staff Transport?
                  Enter the access code provided by UHP.
                  Returning users can leave this blank.
                </small>
              </label>

              <button
                type="submit"
                className="primary-button staff-transport-primary"
                disabled={sending}
              >
                {sending
                  ? 'Sending…'
                  : 'Send email code'}
              </button>
            </form>
          )}

          {step ===
            'email_code' && (
            <form
              className="staff-transport-auth-form"
              onSubmit={
                verifyEmailCode
              }
            >
              <p className="staff-transport-code-destination">
                Code sent to{' '}
                <strong>
                  {email}
                </strong>
              </p>

              <label>
                6-digit email code

                <input
                  className="auth-code-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength="6"
                  pattern="[0-9]{6}"
                  value={code}
                  onChange={(event) =>
                    setCode(
                      event.target.value
                        .replace(
                          /\D/g,
                          ''
                        )
                        .slice(
                          0,
                          6
                        )
                    )
                  }
                  placeholder="000000"
                  required
                  autoFocus
                />
              </label>

              <button
                type="submit"
                className="primary-button staff-transport-primary"
                disabled={sending}
              >
                {sending
                  ? 'Checking…'
                  : 'Continue'}
              </button>

              <button
                type="button"
                className="auth-back-button"
                disabled={sending}
                onClick={() => {
                  setCode('');
                  setChallengeId('');
                  setStep(
                    'email'
                  );
                }}
              >
                Use another email
              </button>
            </form>
          )}

          {step === 'profile' && (
            <form
              className="staff-transport-auth-form"
              onSubmit={
                saveProfile
              }
            >
              <div className="staff-transport-name-grid">
                <label>
                  First name

                  <input
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(event) =>
                      setFirstName(
                        event.target.value
                      )
                    }
                    required
                  />
                </label>

                <label>
                  Last name

                  <input
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(event) =>
                      setLastName(
                        event.target.value
                      )
                    }
                    required
                  />
                </label>
              </div>

              <label>
                Mobile number

                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="07..."
                  value={mobile}
                  onChange={(event) =>
                    setMobile(
                      event.target.value
                    )
                  }
                  required
                />
              </label>

              <p className="staff-transport-form-help">
                We will verify this number before
                transport can be requested.
              </p>

              <button
                type="submit"
                className="primary-button staff-transport-primary"
                disabled={sending}
              >
                {sending
                  ? 'Saving…'
                  : 'Save and verify mobile'}
              </button>
            </form>
          )}

          {step ===
            'sms_request' && (
            <div className="staff-transport-auth-form">
              <p className="staff-transport-code-destination">
                We need to verify{' '}
                <strong>
                  {staff?.mobile ||
                    mobile}
                </strong>
              </p>

              <button
                type="button"
                className="primary-button staff-transport-primary"
                disabled={sending}
                onClick={
                  requestSmsCode
                }
              >
                {sending
                  ? 'Sending…'
                  : 'Send text code'}
              </button>

              <button
                type="button"
                className="auth-back-button"
                disabled={sending}
                onClick={() =>
                  setStep(
                    'profile'
                  )
                }
              >
                Change mobile number
              </button>
            </div>
          )}

          {step === 'sms_code' && (
            <form
              className="staff-transport-auth-form"
              onSubmit={
                verifySmsCode
              }
            >
              <p className="staff-transport-code-destination">
                Code sent to{' '}
                <strong>
                  {staff?.mobile ||
                    mobile}
                </strong>
              </p>

              <label>
                6-digit text code

                <input
                  className="auth-code-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength="6"
                  pattern="[0-9]{6}"
                  value={code}
                  onChange={(event) =>
                    setCode(
                      event.target.value
                        .replace(
                          /\D/g,
                          ''
                        )
                        .slice(
                          0,
                          6
                        )
                    )
                  }
                  placeholder="000000"
                  required
                  autoFocus
                />
              </label>

              <button
                type="submit"
                className="primary-button staff-transport-primary"
                disabled={sending}
              >
                {sending
                  ? 'Checking…'
                  : 'Verify and continue'}
              </button>

              <button
                type="button"
                className="auth-back-button"
                disabled={sending}
                onClick={
                  requestSmsCode
                }
              >
                Send another code
              </button>
            </form>
          )}

          <div className="auth-security-note">
            This portal is only for your own
            Christmas & New Year staff transport
            requests.
          </div>
        </div>
      </div>
    </div>
  );
}


function staffTransportEventLabel(
  event,
  fallbackStatus
) {
  const eventType =
    String(
      event?.eventType ||
      ''
    );

  const labels = {
    submitted:
      'Request submitted',

    amended:
      'Request amended',

    cancelled:
      'Request cancelled',

    needs_information:
      'More information needed',

    ready_for_planning:
      'Details checked',

    planned:
      'Route planning started',

    awaiting_confirmation:
      'Itinerary ready',

    confirmed:
      'Transport confirmed',

    locked:
      'Transport locked',

    booked:
      'Transport booked',

    change_requested:
      'Change requested',

    not_accommodated:
      'Unable to accommodate'
  };

  return (
    labels[eventType] ||
    specialTransportStatusLabel(
      event?.newStatus ||
      fallbackStatus
    )
  );
}


function StaffTransportRequestDetail({
  request,
  onBack,
  onAmend,
  onCancel,
  actionBusy
}) {
  if (!request) {
    return null;
  }

  return (
    <section className="staff-transport-card">
      <button
        type="button"
        className="staff-transport-text-button"
        onClick={onBack}
      >
        ← Back to my requests
      </button>

      <div className="staff-transport-detail-heading">
        <div>
          <span className="staff-transport-eyebrow">
            Transport request
          </span>

          <h2>
            {request.programmeWindowName ||
              request.programmeName}
          </h2>
        </div>

        <span
          className={
            `staff-transport-status-indicator ${staffTransportStatusTone(
              request.status
            )}`
          }
        >
          <span
            className="staff-transport-status-dot"
            aria-hidden="true"
          />

          {specialTransportStatusLabel(
            request.status
          )}
        </span>
      </div>

      <div
        className={
          `staff-transport-status-panel ${staffTransportStatusTone(
            request.status
          )}`
        }
      >
        <div className="staff-transport-status-panel-title">
          <span
            className="staff-transport-status-dot"
            aria-hidden="true"
          />

          <strong>
            {specialTransportStatusLabel(
              request.status
            )}
          </strong>
        </div>

        <p>
          {staffTransportStatusMessage(
            request.status
          )}
        </p>
      </div>

      {(
        [
          'submitted',
          'needs_information',
          'ready_for_planning',
          'planned',
          'awaiting_confirmation',
          'confirmed'
        ].includes(
          request.status
        )
      ) && (
        <div className="staff-transport-detail-actions">
          {[
            'submitted',
            'needs_information',
            'ready_for_planning'
          ].includes(
            request.status
          ) && (
            <button
              type="button"
              className="primary-button"
              disabled={actionBusy}
              onClick={() =>
                onAmend(
                  request
                )
              }
            >
              Amend request
            </button>
          )}

          {[
            'submitted',
            'needs_information',
            'ready_for_planning',
            'planned',
            'awaiting_confirmation',
            'confirmed'
          ].includes(
            request.status
          ) && (
            <button
              type="button"
              className="staff-transport-cancel-button"
              disabled={actionBusy}
              onClick={() =>
                onCancel(
                  request
                )
              }
            >
              {actionBusy
                ? 'Please wait…'
                : 'Cancel request'}
            </button>
          )}
        </div>
      )}

      <div className="staff-transport-detail-grid">
        <div>
          <span>Journey</span>
          <strong>
            {request.direction ===
            'to_work'
              ? 'To work'
              : 'From work'}
          </strong>
        </div>

        <div>
          <span>
            {request.direction ===
            'to_work'
              ? 'Shift starts'
              : 'Shift finishes'}
          </span>

          <strong>
            {formatSpecialTransportWindow(
              request.shiftTime
            )}
          </strong>
        </div>

        <div>
          <span>Pickup</span>
          <strong>
            {request.pickupAddress}
          </strong>

          {request.pickupPostcode && (
            <small>
              {request.pickupPostcode}
            </small>
          )}
        </div>

        <div>
          <span>Destination</span>
          <strong>
            {request.destinationAddress}
          </strong>

          {request.destinationPostcode && (
            <small>
              {request.destinationPostcode}
            </small>
          )}
        </div>

        <div>
          <span>Budget Number</span>
          <strong>
            {request.budgetNumber ||
              '—'}
          </strong>
        </div>

        <div>
          <span>Reason</span>
          <strong>
            {request.reasonCode ||
              '—'}
          </strong>

          {request.reasonDescription && (
            <small>
              {request.reasonDescription}
            </small>
          )}
        </div>
      </div>

      {request.passengerNotes && (
        <div className="staff-transport-detail-notes">
          <span>
            Important information
          </span>

          <p>
            {request.passengerNotes}
          </p>
        </div>
      )}

      <div className="staff-transport-detail-journey-map">
        <SpecialTransportJourneyMap
          pickupAddress={
            request.pickupAddress
          }
          pickupLatitude={
            request.pickupLatitude
          }
          pickupLongitude={
            request.pickupLongitude
          }
          destinationAddress={
            request.destinationAddress
          }
          destinationLatitude={
            request.destinationLatitude
          }
          destinationLongitude={
            request.destinationLongitude
          }
        />
      </div>

      <div className="staff-transport-history">
        <h3>
          Request history
        </h3>

        {(request.events || []).map(
          (event) => (
            <div
              className="staff-transport-history-row"
              key={event.id}
            >
              <div>
                <strong>
                  {staffTransportEventLabel(
                    event,
                    request.status
                  )}
                </strong>

                {event.notes && (
                  <span>
                    {event.notes}
                  </span>
                )}

                {event.actorName && (
                  <span className="staff-transport-history-actor">
                    By {event.actorName}
                  </span>
                )}
              </div>

              <small>
                {formatSpecialTransportWindow(
                  event.createdAt
                )}
              </small>
            </div>
          )
        )}
      </div>
    </section>
  );
}


function StaffTransportPortal({
  staff,
  onLogout,
  demoMode = false,
  onReturnToPortal = null
}) {
  const [
    view,
    setView
  ] = useState(
    'requests'
  );

  const [
    options,
    setOptions
  ] = useState([]);

  const [
    budgets,
    setBudgets
  ] = useState([]);

  const [
    reasonCodes,
    setReasonCodes
  ] = useState([]);

  const [
    savedLocations,
    setSavedLocations
  ] = useState([]);

  const [
    requests,
    setRequests
  ] = useState([]);

  const [
    form,
    setForm
  ] = useState(
    createInitialStaffTransportForm()
  );

  const [
    selectedRequest,
    setSelectedRequest
  ] = useState(null);

  const [
    editingRequestId,
    setEditingRequestId
  ] = useState(null);

  const [
    requestActionBusy,
    setRequestActionBusy
  ] = useState(false);

  const [
    loading,
    setLoading
  ] = useState(true);

  const [
    saving,
    setSaving
  ] = useState(false);

  const [
    error,
    setError
  ] = useState('');

  const [
    success,
    setSuccess
  ] = useState('');

  const [
    validationIssues,
    setValidationIssues
  ] = useState([]);

  async function loadPortal() {
    setLoading(true);
    setError('');

    try {
      const [
        optionsResponse,
        requestsResponse
      ] =
        await Promise.all([
          apiFetch(
            `${API_BASE}/api/staff-transport/request-options`
          ),
          apiFetch(
            `${API_BASE}/api/staff-transport/requests`
          )
        ]);

      const optionsData =
        await optionsResponse.json();

      const requestsData =
        await requestsResponse.json();

      if (!optionsResponse.ok) {
        throw new Error(
          optionsData.error ||
            'Unable to load transport options'
        );
      }

      if (!requestsResponse.ok) {
        throw new Error(
          requestsData.error ||
            'Unable to load your requests'
        );
      }

      const nextOptions =
        Array.isArray(
          optionsData.options
        )
          ? optionsData.options
          : [];

      setOptions(
        nextOptions
      );

      setBudgets(
        Array.isArray(
          optionsData.budgets
        )
          ? optionsData.budgets
          : []
      );

      setReasonCodes(
        Array.isArray(
          optionsData.reasonCodes
        )
          ? optionsData.reasonCodes
          : []
      );

      setSavedLocations(
        Array.isArray(
          optionsData.savedLocations
        )
          ? optionsData.savedLocations
          : []
      );

      setRequests(
        Array.isArray(
          requestsData.requests
        )
          ? requestsData.requests
          : []
      );

      setForm(
        (current) => {
          const valid =
            nextOptions.some(
              (option) =>
                String(
                  option.windowId
                ) ===
                String(
                  current.programmeWindowId
                )
            );

          if (
            valid ||
            !nextOptions.length
          ) {
            return current;
          }

          return {
            ...current,
            programmeWindowId:
              String(
                nextOptions[0].windowId
              ),
            shiftTime:
              current.shiftTime
          };
        }
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load staff transport'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(
    () => {
      loadPortal();
    },
    []
  );

  function updateField(
    field,
    value
  ) {
    setValidationIssues([]);

    setForm(
      (current) => ({
        ...current,
        [field]: value
      })
    );
  }

  function updateAddress(
    prefix,
    value
  ) {
    setValidationIssues([]);

    setForm(
      (current) => ({
        ...current,

        [`${prefix}Address`]:
          value,

        [`${prefix}Postcode`]:
          '',

        [`${prefix}Latitude`]:
          null,

        [`${prefix}Longitude`]:
          null
      })
    );
  }

  function selectAddress(
    prefix,
    result
  ) {
    setValidationIssues([]);

    setForm(
      (current) => ({
        ...current,

        [`${prefix}Address`]:
          preserveStaffTransportHouseNumber(
            current[
              `${prefix}Address`
            ],
            result
          ),

        [`${prefix}Postcode`]:
          result.postcode ||
          '',

        [`${prefix}Latitude`]:
          result.latitude ??
          null,

        [`${prefix}Longitude`]:
          result.longitude ??
          null
      })
    );
  }

  function startAmendRequest(
    request
  ) {
    if (!request) return;

    setEditingRequestId(
      request.id
    );

    setSelectedRequest(
      request
    );

    setError('');
    setSuccess('');

    setForm({
      programmeWindowId:
        String(
          request.programmeWindowId ||
          ''
        ),

      direction:
        request.direction ||
        'to_work',

      shiftTime:
        formatStaffTransportDateTimeLocal(
          request.shiftTime
        ),

      shiftDate:
        formatStaffTransportDateTimeLocal(
          request.shiftTime
        ).slice(
          0,
          10
        ),

      shiftClock:
        formatStaffTransportDateTimeLocal(
          request.shiftTime
        ).slice(
          11,
          16
        ),

      pickupAddress:
        request.pickupAddress ||
        '',

      pickupPostcode:
        request.pickupPostcode ||
        '',

      pickupLatitude:
        request.pickupLatitude ??
        null,

      pickupLongitude:
        request.pickupLongitude ??
        null,

      destinationAddress:
        request.destinationAddress ||
        '',

      destinationPostcode:
        request.destinationPostcode ||
        '',

      destinationLatitude:
        request.destinationLatitude ??
        null,

      destinationLongitude:
        request.destinationLongitude ??
        null,

      budgetId:
        String(
          request.budgetId ||
          ''
        ),

      reasonCodeId:
        String(
          request.reasonCodeId ||
          ''
        ),

      passengerNotes:
        request.passengerNotes ||
        ''
    });

    setView(
      'request'
    );

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }


  function stopAmendingRequest() {
    setEditingRequestId(
      null
    );

    setForm(
      createInitialStaffTransportForm()
    );

    setError('');
    setSuccess('');

    setView(
      'requests'
    );
  }


  async function cancelStaffRequest(
    request
  ) {
    if (!request) return;

    const confirmed =
      window.confirm(
        'Cancel this transport request?\n\nThis will remove this journey from Christmas transport planning. This action cannot be undone online.'
      );

    if (!confirmed) {
      return;
    }

    setRequestActionBusy(true);
    setError('');
    setSuccess('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/staff-transport/requests/${request.id}/cancel`,
          {
            method: 'POST'
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Unable to cancel transport request'
        );
      }

      setSelectedRequest(
        data.request
      );

      setSuccess(
        'Your transport request has been cancelled.'
      );

      await loadPortal();

      setView(
        'requests'
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to cancel transport request'
      );
    } finally {
      setRequestActionBusy(false);
    }
  }


  useEffect(
    () => {
      if (
        view !== 'request' ||
        editingRequestId ||
        form.programmeWindowId ||
        !options.length
      ) {
        return;
      }

      const firstOption =
        options[0];

      setForm(
        (current) => ({
          ...current,

          programmeWindowId:
            String(
              firstOption.windowId
            ),

          shiftTime:
            firstOption.startsAt
              ? formatStaffTransportDateTimeLocal(
                  firstOption.startsAt
                )
              : current.shiftTime
        })
      );
    },
    [
      view,
      editingRequestId,
      form.programmeWindowId,
      options
    ]
  );


  const selectedOption =
    options.find(
      (option) =>
        String(
          option.windowId
        ) ===
        String(
          form.programmeWindowId
        )
    ) || null;

  const recentAddressShortcuts =
    (() => {
      const seen =
        new Set();

      const locations = [];

      const addLocation =
        (
          address,
          postcode,
          latitude,
          longitude
        ) => {
          const cleanAddress =
            String(
              address || ''
            ).trim();

          const key =
            cleanAddress.toLowerCase();

          if (
            !cleanAddress ||
            seen.has(
              key
            )
          ) {
            return;
          }

          const lat =
            Number(
              latitude
            );

          const lng =
            Number(
              longitude
            );

          if (
            !Number.isFinite(
              lat
            ) ||
            !Number.isFinite(
              lng
            )
          ) {
            return;
          }

          seen.add(
            key
          );

          locations.push({
            id:
              `recent-${locations.length}-${key}`,
            name:
              cleanAddress
                .split(',')
                [0],
            label:
              cleanAddress,
            address:
              cleanAddress,
            postcode:
              postcode ||
              '',
            latitude:
              lat,
            longitude:
              lng,
            source:
              'recent'
          });
        };

      for (
        const request
        of requests
      ) {
        addLocation(
          request.pickupAddress,
          request.pickupPostcode,
          request.pickupLatitude,
          request.pickupLongitude
        );

        addLocation(
          request.destinationAddress,
          request.destinationPostcode,
          request.destinationLatitude,
          request.destinationLongitude
        );

        if (
          locations.length >= 5
        ) {
          break;
        }
      }

      return locations.slice(
        0,
        5
      );
    })();


  const quickUhpLocations =
    (
      Array.isArray(
        savedLocations
      )
        ? savedLocations
        : []
    ).slice(
      0,
      3
    );


  const enteredShiftTime =
    form.shiftDate &&
    form.shiftClock
      ? new Date(
          `${form.shiftDate}T${form.shiftClock}`
        )
      : null;

  const matchingServiceWindow =
    enteredShiftTime &&
    !Number.isNaN(
      enteredShiftTime.getTime()
    )
      ? options.find(
          (option) => {
            const starts =
              new Date(
                option.startsAt
              );

            const ends =
              new Date(
                option.endsAt
              );

            return (
              enteredShiftTime >= starts &&
              enteredShiftTime <= ends
            );
          }
        ) || null
      : null;

  const shiftOutsideService =
    Boolean(
      enteredShiftTime &&
      !Number.isNaN(
        enteredShiftTime.getTime()
      ) &&
      !matchingServiceWindow
    );


  async function submitRequest(
    event
  ) {
    event.preventDefault();

    setError('');
    setSuccess('');
    setValidationIssues([]);

    const missing = [];

    const combinedShiftTime =
      form.shiftDate &&
      form.shiftClock
        ? `${form.shiftDate}T${form.shiftClock}`
        : '';

    if (!form.programmeWindowId) {
      setError(
        'The staff transport programme is not currently available. Please refresh and try again.'
      );
      return;
    }

    if (!combinedShiftTime) {
      missing.push(
        form.direction ===
        'to_work'
          ? 'Shift start time'
          : 'Shift finish time'
      );
    }

    if (
      !String(
        form.pickupAddress ||
        ''
      ).trim()
    ) {
      missing.push(
        form.direction ===
        'to_work'
          ? 'Home / pickup address'
          : 'Work pickup'
      );
    }

    if (
      !String(
        form.destinationAddress ||
        ''
      ).trim()
    ) {
      missing.push(
        form.direction ===
        'to_work'
          ? 'Work destination'
          : 'Home / destination'
      );
    }

    if (!form.budgetId) {
      missing.push(
        'Budget Number'
      );
    }

    if (!form.reasonCodeId) {
      missing.push(
        'Reason Code'
      );
    }

    if (missing.length) {
      setValidationIssues(
        missing
      );

      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });

      return;
    }

    if (shiftOutsideService) {
      setError(
        'Special Transport is not running at this time. Please choose a shift time within one of the Christmas or New Year operating periods shown above.'
      );

      return;
    }

    setSaving(true);

    try {
      const response =
        await apiFetch(
          editingRequestId
            ? `${API_BASE}/api/staff-transport/requests/${editingRequestId}`
            : `${API_BASE}/api/staff-transport/requests`,
          {
            method:
              editingRequestId
                ? 'PATCH'
                : 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body:
              JSON.stringify({
                ...form,
                shiftTime:
                  combinedShiftTime
              })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to submit transport request'
        );
      }

      setSelectedRequest(
        data.request
      );

      const wasEditing =
        Boolean(
          editingRequestId
        );

      setEditingRequestId(
        null
      );

      setForm(
        createInitialStaffTransportForm()
      );

      setSuccess(
        wasEditing
          ? 'Your transport request has been updated.'
          : 'Your transport request has been received.'
      );

      await loadPortal();

      setView(
        'requests'
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to submit transport request'
      );
    } finally {
      setSaving(false);
    }
  }

  async function openRequest(
    requestId
  ) {
    setError('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/staff-transport/requests/${requestId}`
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to open transport request'
        );
      }

      setSelectedRequest(
        data.request
      );

      setView(
        'detail'
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to open transport request'
      );
    }
  }

  const staffName =
    [
      staff?.firstName,
      staff?.lastName
    ]
      .filter(Boolean)
      .join(' ');

  return (
    <div className="staff-transport-shell">
      <header className="staff-transport-header">
        <div>
          <span className="staff-transport-header-kicker">
            UHP
          </span>

          <strong>
            Christmas & New Year Staff Transport
          </strong>
        </div>

        <div className="staff-transport-header-actions">
          {demoMode && (
            <button
              type="button"
              className="staff-transport-demo-return"
              onClick={onReturnToPortal}
            >
              Return to Portal Demo
            </button>
          )}

          <button
            type="button"
            className="staff-transport-signout"
            onClick={onLogout}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="staff-transport-main">
        <div className="staff-transport-welcome">
          <div>
            <span>
              Signed in as
            </span>

            <strong>
              {staffName}
            </strong>
          </div>

          <small>
            {staff?.email}
          </small>
        </div>

        <div className="staff-transport-tabs">
          <button
            type="button"
            className={
              view === 'request'
                ? 'active'
                : ''
            }
            onClick={() => {
              setError('');
              setSuccess('');
              setView(
                'request'
              );
            }}
          >
            Request transport
          </button>

          <button
            type="button"
            className={
              view === 'requests' ||
              view === 'detail'
                ? 'active'
                : ''
            }
            onClick={() => {
              setError('');
              setView(
                'requests'
              );
            }}
          >
            My requests
          </button>
        </div>

        {error && (
          <div className="notice error">
            {error}
          </div>
        )}

        {success && (
          <div className="notice success">
            {success}
          </div>
        )}

        {loading ? (
          <section className="staff-transport-card staff-transport-loading">
            Loading staff transport…
          </section>
        ) : view ===
          'detail' ? (
          <StaffTransportRequestDetail
            request={
              selectedRequest
            }
            actionBusy={
              requestActionBusy
            }
            onAmend={
              startAmendRequest
            }
            onCancel={
              cancelStaffRequest
            }
            onBack={() =>
              setView(
                'requests'
              )
            }
          />
        ) : view ===
          'request' ? (
          <section className="staff-transport-card">
            <div className="staff-transport-card-heading">
              <span className="staff-transport-eyebrow">
                {editingRequestId
                  ? 'Amend request'
                  : 'New request'}
              </span>

              <h1>
                {editingRequestId
                  ? 'Amend staff transport'
                  : 'Request staff transport'}
              </h1>

              <p>
                Tell us when your shift starts or
                finishes. Your final pickup time will
                be confirmed later after route
                planning.
              </p>
            </div>

            {editingRequestId && (
              <div className="staff-transport-amend-notice">
                <strong>
                  You are amending an existing request
                </strong>

                <span>
                  Update the details below and choose
                  Save changes. Your request will keep
                  its current planning status.
                </span>
              </div>
            )}

            <div className="staff-transport-shared-notice">
              <div className="staff-transport-shared-notice-icon">
                <UsersRound
                  size={20}
                  aria-hidden="true"
                />
              </div>

              <div>
                <strong>
                  Shared staff transport
                </strong>

                <p>
                  Christmas &amp; New Year Staff
                  Transport is a shared travel scheme
                  for UHP staff. Journeys may be
                  grouped with colleagues travelling
                  at similar times and may be provided
                  by shared taxi, minibus or coach.
                </p>

                <p>
                  Sharing journeys helps us provide
                  transport for as many colleagues as
                  possible. Your final pickup time and
                  travel arrangements will be
                  confirmed after route planning.
                </p>
              </div>
            </div>

            {options.length === 0 ? (
              <div className="staff-transport-empty">
                <strong>
                  Requests are not open yet
                </strong>

                <span>
                  There are currently no staff transport
                  services accepting requests.
                </span>
              </div>
            ) : (
              <form
                className="staff-transport-request-form"
                onSubmit={
                  submitRequest
                }
                noValidate
              >
                {validationIssues.length > 0 && (
                  <div
                    className="staff-transport-validation-summary"
                    role="alert"
                  >
                    <strong>
                      Please complete the missing information
                    </strong>

                    <span>
                      Check the following before submitting:
                    </span>

                    <ul>
                      {validationIssues.map(
                        (issue) => (
                          <li
                            key={
                              issue
                            }
                          >
                            {issue}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}

                <div className="staff-transport-service-box">
                  <strong>
                    When Special Transport is running
                  </strong>

                  {options.map(
                    (option) => (
                      <div
                        key={option.windowId}
                        className="staff-transport-service-period"
                      >
                        <span>
                          {option.windowName}
                        </span>

                        <small>
                          {formatSpecialTransportWindow(
                            option.startsAt
                          )}
                          {' – '}
                          {formatSpecialTransportWindow(
                            option.endsAt
                          )}
                        </small>
                      </div>
                    )
                  )}

                  <p>
                    Enter your shift start or finish time
                    below. We will automatically place your
                    request into the correct service period.
                  </p>
                </div>

                <fieldset className="staff-transport-direction">
                  <legend>
                    Journey
                  </legend>

                  <div>
                    <button
                      type="button"
                      className={
                        form.direction ===
                        'to_work'
                          ? 'active'
                          : ''
                      }
                      onClick={() =>
                        updateField(
                          'direction',
                          'to_work'
                        )
                      }
                    >
                      To work
                    </button>

                    <button
                      type="button"
                      className={
                        form.direction ===
                        'from_work'
                          ? 'active'
                          : ''
                      }
                      onClick={() =>
                        updateField(
                          'direction',
                          'from_work'
                        )
                      }
                    >
                      From work
                    </button>
                  </div>
                </fieldset>

                <div className="staff-transport-shift-field">
                  <label>
                    <strong className="staff-transport-shift-label">
                      {form.direction ===
                      'to_work'
                        ? 'Your shift start time'
                        : 'Your shift finish time'}
                    </strong>

                    <span className="staff-transport-shift-help">
                      This is your shift time, not the
                      time you want the taxi. We will
                      calculate and confirm your taxi
                      pickup time later.
                    </span>

                    <div className="staff-transport-shift-date-time">
                      <label>
                        <span>Date</span>

                        <input
                          type="date"
                          value={
                            form.shiftDate
                          }
                          min="2026-12-24"
                          max="2027-01-02"
                          onChange={(event) =>
                            updateField(
                              'shiftDate',
                              event.target.value
                            )
                          }
                          required
                        />
                      </label>

                      <label>
                        <span>
                          {form.direction ===
                          'to_work'
                            ? 'Shift start time'
                            : 'Shift finish time'}
                        </span>

                        <input
                          type="time"
                          value={
                            form.shiftClock
                          }
                          onChange={(event) =>
                            updateField(
                              'shiftClock',
                              event.target.value
                            )
                          }
                          required
                        />
                      </label>
                    </div>

                    {shiftOutsideService && (
                      <div className="staff-transport-service-warning">
                        <strong>
                          Special Transport is not running at this time
                        </strong>

                        <span>
                          Please choose a shift time within one of the
                          Christmas or New Year operating periods shown above.
                        </span>
                      </div>
                    )}

                    {matchingServiceWindow && (
                      <div className="staff-transport-service-valid">
                        This shift falls within{' '}
                        <strong>
                          {matchingServiceWindow.windowName}
                        </strong>
                        .
                      </div>
                    )}
                  </label>
                </div>

                <label>
                  {form.direction ===
                  'to_work'
                    ? 'Home / pickup address'
                    : 'Work pickup'}

                  {form.direction ===
                  'from_work' && (
                    <StaffTransportAddressShortcuts
                      title="Quick UHP locations"
                      locations={
                        quickUhpLocations
                      }
                      onSelect={(location) =>
                        selectAddress(
                          'pickup',
                          location
                        )
                      }
                    />
                  )}

                  <StaffTransportAddressShortcuts
                    title="Recent addresses"
                    locations={
                      recentAddressShortcuts
                    }
                    onSelect={(location) =>
                      selectAddress(
                        'pickup',
                        location
                      )
                    }
                  />

                  <StaffTransportAddressSearch
                    value={
                      form.pickupAddress
                    }
                    savedLocations={
                      savedLocations
                    }
                    placeholder="Start typing an address or UHP location…"
                    onChange={(value) =>
                      updateAddress(
                        'pickup',
                        value
                      )
                    }
                    onSelect={(result) =>
                      selectAddress(
                        'pickup',
                        result
                      )
                    }
                  />

                  {form.pickupPostcode && (
                    <small className="staff-transport-address-meta">
                      {form.pickupPostcode}
                    </small>
                  )}
                </label>

                <label>
                  {form.direction ===
                  'to_work'
                    ? 'Work destination'
                    : 'Home / destination'}

                  {form.direction ===
                  'to_work' && (
                    <StaffTransportAddressShortcuts
                      title="Quick UHP locations"
                      locations={
                        quickUhpLocations
                      }
                      onSelect={(location) =>
                        selectAddress(
                          'destination',
                          location
                        )
                      }
                    />
                  )}

                  <StaffTransportAddressShortcuts
                    title="Recent addresses"
                    locations={
                      recentAddressShortcuts
                    }
                    onSelect={(location) =>
                      selectAddress(
                        'destination',
                        location
                      )
                    }
                  />

                  <StaffTransportAddressSearch
                    value={
                      form.destinationAddress
                    }
                    savedLocations={
                      savedLocations
                    }
                    placeholder="Start typing an address or UHP location…"
                    onChange={(value) =>
                      updateAddress(
                        'destination',
                        value
                      )
                    }
                    onSelect={(result) =>
                      selectAddress(
                        'destination',
                        result
                      )
                    }
                  />

                  {form.destinationPostcode && (
                    <small className="staff-transport-address-meta">
                      {form.destinationPostcode}
                    </small>
                  )}
                </label>

                <div className="staff-transport-journey-check">
                  <SpecialTransportJourneyMap
                    pickupAddress={
                      form.pickupAddress
                    }
                    pickupLatitude={
                      form.pickupLatitude
                    }
                    pickupLongitude={
                      form.pickupLongitude
                    }
                    destinationAddress={
                      form.destinationAddress
                    }
                    destinationLatitude={
                      form.destinationLatitude
                    }
                    destinationLongitude={
                      form.destinationLongitude
                    }
                  />
                </div>

                <label>
                  Budget Number

                  <select
                    value={
                      form.budgetId
                    }
                    onChange={(event) =>
                      updateField(
                        'budgetId',
                        event.target.value
                      )
                    }
                    required
                  >
                    <option value="">
                      Select budget…
                    </option>

                    {budgets.map(
                      (budget) => (
                        <option
                          key={
                            budget.id
                          }
                          value={
                            budget.id
                          }
                        >
                          {budget.budgetNumber}
                          {' — '}
                          {budget.name}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label>
                  Reason Code

                  <select
                    value={
                      form.reasonCodeId
                    }
                    onChange={(event) =>
                      updateField(
                        'reasonCodeId',
                        event.target.value
                      )
                    }
                    required
                  >
                    <option value="">
                      Select reason…
                    </option>

                    {reasonCodes.map(
                      (reason) => (
                        <option
                          key={
                            reason.id
                          }
                          value={
                            reason.id
                          }
                        >
                          {reason.code}
                          {' — '}
                          {reason.description}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label>
                  Important information
                  <span className="staff-transport-optional">
                    Optional
                  </span>

                  <textarea
                    rows="3"
                    value={
                      form.passengerNotes
                    }
                    onChange={(event) =>
                      updateField(
                        'passengerNotes',
                        event.target.value
                      )
                    }
                    placeholder="Include any important mobility, access or collection information we should be aware of."
                  />
                </label>

                <div className="staff-transport-shared-reminder">
                  <strong>
                    Please note:
                  </strong>
                  {' '}
                  this is a shared transport request,
                  not a private taxi booking.
                </div>

                <div className="staff-transport-self-only">
                  <CheckCircle2
                    size={18}
                  />

                  <span>
                    This request will be submitted for
                    <strong>
                      {' '}
                      {staffName}
                    </strong>
                    . Passenger details come from your
                    verified account.
                  </span>
                </div>

                <div className="staff-transport-form-actions">
                  {editingRequestId && (
                    <button
                      type="button"
                      className="staff-transport-secondary-button"
                      disabled={saving}
                      onClick={
                        stopAmendingRequest
                      }
                    >
                      Keep existing request
                    </button>
                  )}

                  <button
                    type="submit"
                    className="primary-button staff-transport-submit"
                    disabled={
                      saving ||
                      shiftOutsideService
                    }
                  >
                    {saving
                      ? (
                          editingRequestId
                            ? 'Saving changes…'
                            : 'Submitting…'
                        )
                      : (
                          editingRequestId
                            ? 'Save changes'
                            : 'Submit transport request'
                        )}
                  </button>
                </div>
              </form>
            )}
          </section>
        ) : (
          <section className="staff-transport-card">
            <div className="staff-transport-card-heading staff-transport-list-heading">
              <div>
                <span className="staff-transport-eyebrow">
                  Your transport
                </span>

                <h1>
                  My requests
                </h1>
              </div>

              <button
                type="button"
                className="primary-button staff-transport-new-button"
                onClick={() => {
                  setEditingRequestId(
                    null
                  );

                  setForm(
                    createInitialStaffTransportForm()
                  );

                  setError('');
                  setSuccess('');
                  setValidationIssues([]);

                  setView(
                    'request'
                  );
                }}
              >
                New request
              </button>
            </div>

            {requests.length === 0 ? (
              <div className="staff-transport-empty">
                <strong>
                  No transport requests yet
                </strong>

                <span>
                  Your submitted staff transport
                  requests will appear here.
                </span>

                <button
                  type="button"
                  className="primary-button"
                  onClick={() =>
                    setView(
                      'request'
                    )
                  }
                >
                  Request transport
                </button>
              </div>
            ) : (
              <>
                <div className="staff-transport-list-notice">
                  <UsersRound
                    size={17}
                    aria-hidden="true"
                  />

                  <span>
                    <strong>
                      Shared staff transport:
                    </strong>
                    {' '}
                    your journey may be grouped with
                    colleagues travelling at similar times
                    and provided by taxi, minibus or coach.
                    Final pickup arrangements will be
                    confirmed after route planning.
                  </span>
                </div>

                <div className="staff-transport-request-list">
                  {requests.map(
                    (request) => (
                      <button
                        key={
                          request.id
                        }
                        type="button"
                        className={
                          `staff-transport-request-item status-${staffTransportStatusTone(
                            request.status
                          )}`
                        }
                        onClick={() =>
                          openRequest(
                            request.id
                          )
                        }
                      >
                        <div className="staff-transport-request-item-top">
                          <strong>
                            {request.programmeWindowName ||
                              request.programmeName}
                          </strong>

                          <span
                            className={
                              `staff-transport-status-indicator ${staffTransportStatusTone(
                                request.status
                              )}`
                            }
                          >
                            <span
                              className="staff-transport-status-dot"
                              aria-hidden="true"
                            />

                            {specialTransportStatusLabel(
                              request.status
                            )}
                          </span>
                        </div>

                        <span>
                          {request.direction ===
                          'to_work'
                            ? 'To work'
                            : 'From work'}
                          {' · '}
                          {formatSpecialTransportWindow(
                            request.shiftTime
                          )}
                        </span>

                        <small>
                          {request.pickupAddress}
                          {' → '}
                          {request.destinationAddress}
                        </small>

                        <span className="staff-transport-request-status-copy">
                          {staffTransportStatusMessage(
                            request.status
                          )}
                        </span>
                      </button>
                    )
                  )}
                </div>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}


function StaffTransportApp() {
  const staffDemoMode =
    new URLSearchParams(
      window.location.search
    ).get('demo') === '1';

  const [
    checkingSession,
    setCheckingSession
  ] = useState(true);

  const [
    staff,
    setStaff
  ] = useState(null);

  useEffect(
    () => {
      let cancelled = false;

      async function restoreSession() {
        try {
          const response =
            await apiFetch(
              `${API_BASE}/api/staff-transport/auth/me`
            );

          if (!response.ok) {
            if (!cancelled) {
              setStaff(null);
            }

            return;
          }

          const data =
            await response.json();

          if (!cancelled) {
            setStaff(
              data.staff || null
            );
          }
        } catch {
          if (!cancelled) {
            setStaff(null);
          }
        } finally {
          if (!cancelled) {
            setCheckingSession(false);
          }
        }
      }

      restoreSession();

      return () => {
        cancelled = true;
      };
    },
    []
  );

  async function logout() {
    try {
      await apiFetch(
        `${API_BASE}/api/staff-transport/auth/logout`,
        {
          method: 'POST'
        }
      );
    } finally {
      setStaff(null);
    }
  }

  async function returnToPortalDemo() {
    try {
      await apiFetch(
        `${API_BASE}/api/staff-transport/auth/logout`,
        {
          method: 'POST'
        }
      );
    } finally {
      window.location.assign('/');
    }
  }

  if (checkingSession) {
    return (
      <div className="staff-transport-auth-shell">
        <div className="auth-loading">
          Checking secure staff session…
        </div>
      </div>
    );
  }

  const fullyVerified =
    staff?.status ===
      'active' &&
    staff?.emailVerifiedAt &&
    staff?.mobileVerifiedAt;

  if (!fullyVerified) {
    return (
      <StaffTransportAuth
        initialStaff={
          staff
        }
        onAuthenticated={
          setStaff
        }
      />
    );
  }

  return (
    <StaffTransportPortal
      staff={staff}
      onLogout={logout}
      demoMode={staffDemoMode}
      onReturnToPortal={
        returnToPortalDemo
      }
    />
  );
}


function createInitialSpecialTransportForm(
  currentUser
) {
  return {
    programmeWindowId: '',
    passengerName:
      [
        currentUser?.firstName,
        currentUser?.lastName
      ]
        .filter(Boolean)
        .join(' '),
    passengerMobile: '',
    passengerEmail:
      currentUser?.email || '',
    direction: 'to_work',
    shiftTime: '',

    pickupAddress: '',
    pickupPostcode: '',
    pickupLatitude: null,
    pickupLongitude: null,

    destinationAddress: '',
    destinationPostcode: '',
    destinationLatitude: null,
    destinationLongitude: null,

    passengerCount: 1,

    budgetId: '',
    reasonCodeId: '',

    passengerNotes: ''
  };
}


function formatSpecialTransportWindow(
  value
) {
  if (!value) return '';

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(value);
  }

  return new Intl.DateTimeFormat(
    'en-GB',
    {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }
  ).format(date);
}


function specialTransportStatusLabel(
  status
) {
  const labels = {
    submitted: 'Request received',
    needs_information: 'More information needed',
    ready_for_planning: 'Details checked',
    planned: 'Route planning',
    awaiting_confirmation: 'Itinerary ready',
    confirmed: 'Confirmed',
    locked: 'Transport locked',
    booked: 'Transport booked',
    change_requested: 'Change requested',
    not_accommodated: 'Unable to accommodate',
    cancelled: 'Cancelled'
  };

  return (
    labels[status] ||
    String(status || '')
      .replaceAll('_', ' ')
  );
}


function SpecialTransportPage({
  currentUser
}) {
  const [
    options,
    setOptions
  ] = useState([]);

  const [
    requests,
    setRequests
  ] = useState([]);

  const [
    budgets,
    setBudgets
  ] = useState([]);

  const [
    reasonCodes,
    setReasonCodes
  ] = useState([]);

  const [
    savedLocations,
    setSavedLocations
  ] = useState([]);

  const [
    form,
    setForm
  ] = useState(
    () =>
      createInitialSpecialTransportForm(
        currentUser
      )
  );

  const [
    loading,
    setLoading
  ] = useState(true);

  const [
    saving,
    setSaving
  ] = useState(false);

  const [
    error,
    setError
  ] = useState('');

  const [
    success,
    setSuccess
  ] = useState('');

  const [
    reviewRequest,
    setReviewRequest
  ] = useState(null);

  const [
    reviewNotes,
    setReviewNotes
  ] = useState('');

  const [
    reviewLoading,
    setReviewLoading
  ] = useState(false);

  const [
    reviewSaving,
    setReviewSaving
  ] = useState(false);

  const [
    reviewError,
    setReviewError
  ] = useState('');

  const [
    requestEditMode,
    setRequestEditMode
  ] = useState(false);

  const [
    requestEditForm,
    setRequestEditForm
  ] = useState(null);

  const [
    csvFile,
    setCsvFile
  ] = useState(null);

  const [
    csvBatch,
    setCsvBatch
  ] = useState(null);

  const [
    csvChecking,
    setCsvChecking
  ] = useState(false);

  const [
    csvImporting,
    setCsvImporting
  ] = useState(false);

  const [
    csvError,
    setCsvError
  ] = useState('');

  const [
    csvWarningsConfirmed,
    setCsvWarningsConfirmed
  ] = useState(false);

  const [
    transportRequestSearch,
    setTransportRequestSearch
  ] = useState('');

  const [
    transportRequestStatusFilter,
    setTransportRequestStatusFilter
  ] = useState('');

  const [
    transportRequestServiceFilter,
    setTransportRequestServiceFilter
  ] = useState('');

  const userRoles =
    currentUser?.roles || [];

  const isUhpAdmin =
    userRoles.some(
      (role) =>
        role.code ===
          'uhp_admin'
    );

  const canImportTransportCsv =
    userRoles.some(
      (role) =>
        [
          'booker',
          'budget_holder',
          'department_manager',
          'uhp_admin'
        ].includes(
          role.code
        )
    );

  const transportRequestStatusOptions =
    Array.from(
      new Set(
        requests
          .map(
            (request) =>
              request.status
          )
          .filter(Boolean)
      )
    ).sort();

  const transportRequestServiceOptions =
    Array.from(
      new Set(
        requests
          .map(
            (request) =>
              request.programmeWindowName
          )
          .filter(Boolean)
      )
    ).sort();

  const filteredTransportRequests =
    isUhpAdmin
      ? requests.filter(
          (request) => {
            if (
              transportRequestStatusFilter &&
              request.status !==
                transportRequestStatusFilter
            ) {
              return false;
            }

            if (
              transportRequestServiceFilter &&
              request.programmeWindowName !==
                transportRequestServiceFilter
            ) {
              return false;
            }

            const search =
              transportRequestSearch
                .trim()
                .toLowerCase();

            if (!search) {
              return true;
            }

            const searchable =
              [
                request.passengerName,
                request.passengerMobile,
                request.passengerEmail,
                request.requestedByName,
                request.enteredByName,
                request.pickupAddress,
                request.pickupPostcode,
                request.destinationAddress,
                request.destinationPostcode,
                request.budgetNumber,
                request.department
              ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return searchable.includes(
              search
            );
          }
        )
      : requests;


  async function loadSpecialTransport() {
    setLoading(true);
    setError('');

    try {
      const [
        optionsResponse,
        requestsResponse,
        bookingOptionsResponse
      ] =
        await Promise.all([
          apiFetch(
            `${API_BASE}/api/transport-request-options`
          ),
          apiFetch(
            `${API_BASE}/api/transport-requests`
          ),
          apiFetch(
            `${API_BASE}/api/booking-options`
          )
        ]);

      if (!optionsResponse.ok) {
        const data =
          await optionsResponse.json()
            .catch(() => ({}));

        throw new Error(
          data.error ||
            'Unable to load available transport services'
        );
      }

      if (!requestsResponse.ok) {
        const data =
          await requestsResponse.json()
            .catch(() => ({}));

        throw new Error(
          data.error ||
            'Unable to load transport requests'
        );
      }

      if (!bookingOptionsResponse.ok) {
        const data =
          await bookingOptionsResponse.json()
            .catch(() => ({}));

        throw new Error(
          data.error ||
            'Unable to load UHP funding options'
        );
      }

      const optionsData =
        await optionsResponse.json();

      const requestsData =
        await requestsResponse.json();

      const bookingOptionsData =
        await bookingOptionsResponse.json();

      const nextOptions =
        optionsData.options || [];

      setOptions(
        nextOptions
      );

      setRequests(
        requestsData.requests || []
      );

      setBudgets(
        bookingOptionsData.budgets || []
      );

      setReasonCodes(
        bookingOptionsData.reasonCodes || []
      );

      setSavedLocations(
        Array.isArray(
          bookingOptionsData.savedLocations
        )
          ? bookingOptionsData.savedLocations
          : []
      );

      setForm(
        (current) => {
          const stillValid =
            nextOptions.some(
              (option) =>
                String(
                  option.windowId
                ) ===
                  String(
                    current.programmeWindowId
                  )
            );

          if (
            stillValid ||
            nextOptions.length === 0
          ) {
            return current;
          }

          return {
            ...current,
            programmeWindowId:
              String(
                nextOptions[0].windowId
              ),
            shiftTime:
              current.shiftTime ||
              specialTransportLocalDateTime(
                nextOptions[0].startsAt
              )
          };
        }
      );
    } catch (loadError) {
      setError(
        loadError.message ||
          'Unable to load special transport'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSpecialTransport();
  }, []);

  function updateField(
    field,
    value
  ) {
    setForm(
      (current) => ({
        ...current,
        [field]: value
      })
    );
  }

  const selectedOption =
    options.find(
      (option) =>
        String(option.windowId) ===
          String(
            form.programmeWindowId
          )
    ) || null;

  const selectedBudget =
    budgets.find(
      (budget) =>
        String(budget.id) ===
          String(
            form.budgetId
          )
    ) || null;


  function selectTransportWindow(
    option
  ) {
    setForm(
      (current) => ({
        ...current,
        programmeWindowId:
          String(
            option.windowId
          ),
        shiftTime:
          specialTransportLocalDateTime(
            option.startsAt
          )
      })
    );
  }


  function updateJourneyAddress(
    prefix,
    value
  ) {
    setForm(
      (current) => ({
        ...current,
        [`${prefix}Address`]:
          value,
        [`${prefix}Postcode`]:
          '',
        [`${prefix}Latitude`]:
          null,
        [`${prefix}Longitude`]:
          null
      })
    );
  }


  function selectJourneyAddress(
    prefix,
    result
  ) {
    setForm(
      (current) => ({
        ...current,
        [`${prefix}Address`]:
          result.address ||
          result.locationName ||
          '',
        [`${prefix}Postcode`]:
          result.postcode ||
          '',
        [`${prefix}Latitude`]:
          result.latitude ??
          null,
        [`${prefix}Longitude`]:
          result.longitude ??
          null
      })
    );
  }

  function createTransportRequestEditForm(
    request
  ) {
    return {
      passengerName:
        request?.passengerName || '',

      passengerMobile:
        request?.passengerMobile || '',

      passengerEmail:
        request?.passengerEmail || '',

      direction:
        request?.direction ||
        'to_work',

      shiftTime:
        request?.shiftTime
          ? specialTransportLocalDateTime(
              request.shiftTime
            )
          : '',

      pickupAddress:
        request?.pickupAddress || '',

      pickupPostcode:
        request?.pickupPostcode || '',

      destinationAddress:
        request?.destinationAddress || '',

      destinationPostcode:
        request?.destinationPostcode || '',

      passengerNotes:
        request?.passengerNotes || ''
    };
  }


  async function openTransportRequestReview(
    requestId
  ) {
    setReviewLoading(true);
    setReviewError('');
    setReviewRequest(null);
    setRequestEditMode(false);
    setRequestEditForm(null);

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/transport-requests/${requestId}`
        );

      const data =
        await response.json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to load transport request'
        );
      }

      setReviewRequest(
        data.request
      );

      setReviewNotes(
        data.request?.internalNotes ||
          ''
      );

      setRequestEditForm(
        createTransportRequestEditForm(
          data.request
        )
      );
    } catch (loadError) {
      setReviewError(
        loadError.message ||
          'Unable to load transport request'
      );
    } finally {
      setReviewLoading(false);
    }
  }


  function closeTransportRequestReview() {
    if (reviewSaving) return;

    setReviewRequest(null);
    setReviewNotes('');
    setReviewError('');
    setRequestEditMode(false);
    setRequestEditForm(null);
  }


  function updateTransportRequestEditField(
    field,
    value
  ) {
    setRequestEditForm(
      (current) => ({
        ...current,
        [field]: value
      })
    );
  }


  function transportRequestCanBeChanged(
    request
  ) {
    return [
      'submitted',
      'needs_information',
      'ready_for_planning'
    ].includes(
      request?.status
    );
  }


  async function submitTransportRequestAmend() {
    if (
      !reviewRequest ||
      !requestEditForm
    ) {
      return;
    }

    setReviewSaving(true);
    setReviewError('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/transport-requests/${reviewRequest.id}/amend`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type':
                'application/json'
            },
            body:
              JSON.stringify(
                requestEditForm
              )
          }
        );

      const data =
        await response.json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to amend transport request'
        );
      }

      setReviewRequest(
        data.request
      );

      setRequestEditForm(
        createTransportRequestEditForm(
          data.request
        )
      );

      setRequestEditMode(false);

      await loadSpecialTransport();

      setSuccess(
        'Transport request amended.'
      );
    } catch (saveError) {
      setReviewError(
        saveError.message ||
          'Unable to amend transport request'
      );
    } finally {
      setReviewSaving(false);
    }
  }


  async function cancelTransportRequestFromPortal() {
    if (!reviewRequest) {
      return;
    }

    const confirmed =
      window.confirm(
        'Cancel this transport request? This will not cancel any normal taxi booking because Special Transport has not yet been booked in Autocab.'
      );

    if (!confirmed) {
      return;
    }

    setReviewSaving(true);
    setReviewError('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/transport-requests/${reviewRequest.id}/cancel`,
          {
            method: 'POST'
          }
        );

      const data =
        await response.json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to cancel transport request'
        );
      }

      setReviewRequest(
        data.request
      );

      setRequestEditForm(
        createTransportRequestEditForm(
          data.request
        )
      );

      setRequestEditMode(false);

      await loadSpecialTransport();

      setSuccess(
        'Transport request cancelled.'
      );
    } catch (saveError) {
      setReviewError(
        saveError.message ||
          'Unable to cancel transport request'
      );
    } finally {
      setReviewSaving(false);
    }
  }


  async function submitTransportRequestReview(
    status
  ) {
    if (
      !isUhpAdmin ||
      !reviewRequest
    ) {
      return;
    }

    setReviewSaving(true);
    setReviewError('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/transport-requests/${reviewRequest.id}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type':
                'application/json'
            },
            body:
              JSON.stringify({
                status,
                internalNotes:
                  reviewNotes
              })
          }
        );

      const data =
        await response.json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to update transport request'
        );
      }

      setReviewRequest(
        data.request
      );

      setReviewNotes(
        data.request?.internalNotes ||
          ''
      );

      await loadSpecialTransport();

      setSuccess(
        status ===
          'needs_information'
          ? 'Transport request marked as needing more information.'
          : 'Transport request details checked and ready for planning.'
      );
    } catch (saveError) {
      setReviewError(
        saveError.message ||
          'Unable to update transport request'
      );
    } finally {
      setReviewSaving(false);
    }
  }


  function downloadTransportRequestCsvTemplate() {
    const headers = [
      'First Name',
      'Last Name',
      'Mobile',
      'Email',
      'Service',
      'Direction',
      'Shift Date',
      'Shift Time',
      'Pickup Address',
      'Pickup Postcode',
      'Work Destination',
      'Work Postcode',
      'Budget Number',
      'Reason Code',
      'Important Information'
    ];

    const example = [
      'EXAMPLE ROW',
      'Example',
      '07123456789',
      'jane.example@nhs.net',
      options[0]?.windowName ||
        'No service currently open',
      'To work',
      '25/12/2026',
      '08:00',
      '11 Example Road, Plymouth',
      'PL5 3HY',
      'Derriford Hospital, Plymouth',
      'PL6 8DH',
      '410023',
      'RC01',
      'Example only - leave this row in place. Enter real requests from row 3 onwards.'
    ];

    const csvCell = (
      value
    ) => {
      const text =
        String(
          value ?? ''
        );

      return /[",\r\n]/.test(
        text
      )
        ? `"${text.replaceAll(
            '"',
            '""'
          )}"`
        : text;
    };

    const csvText = [
      headers,
      example
    ]
      .map(
        (row) =>
          row
            .map(csvCell)
            .join(',')
      )
      .join('\r\n') +
      '\r\n';

    const blob =
      new Blob(
        [
          csvText
        ],
        {
          type:
            'text/csv;charset=utf-8'
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const link =
      document.createElement(
        'a'
      );

    link.href = url;
    link.download =
      'staff-transport-request-template.csv';

    document.body.appendChild(
      link
    );

    link.click();
    link.remove();

    URL.revokeObjectURL(
      url
    );
  }


  function selectTransportCsvFile(
    event
  ) {
    const file =
      event.target.files?.[0] ||
      null;

    setCsvFile(
      file
    );

    setCsvBatch(null);
    setCsvError('');
    setCsvWarningsConfirmed(false);
  }


  async function previewTransportCsv() {
    if (
      !canImportTransportCsv
    ) {
      setCsvError(
        'You do not have permission to import transport requests.'
      );
      return;
    }

    if (!csvFile) {
      setCsvError(
        'Choose a CSV file first.'
      );
      return;
    }

    if (
      csvFile.size >
      512 * 1024
    ) {
      setCsvError(
        'The CSV file is too large. Maximum size is 512 KB.'
      );
      return;
    }

    setCsvChecking(true);
    setCsvError('');
    setCsvBatch(null);
    setCsvWarningsConfirmed(false);
    setSuccess('');

    try {
      const csvText =
        await csvFile.text();

      const response =
        await apiFetch(
          `${API_BASE}/api/transport-request-imports/preview`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body:
              JSON.stringify({
                filename:
                  csvFile.name,
                csvText
              })
          }
        );

      const data =
        await response.json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to check CSV file'
        );
      }

      setCsvBatch(
        data.batch ||
        null
      );
    } catch (previewError) {
      setCsvError(
        previewError.message ||
          'Unable to check CSV file'
      );
    } finally {
      setCsvChecking(false);
    }
  }


  function transportCsvIssueText(
    issue
  ) {
    if (
      typeof issue ===
      'string'
    ) {
      return issue;
    }

    if (
      issue &&
      typeof issue ===
        'object'
    ) {
      return (
        issue.message ||
        issue.error ||
        issue.reason ||
        JSON.stringify(issue)
      );
    }

    return String(
      issue || ''
    );
  }


  async function confirmTransportCsvImport() {
    if (
      !canImportTransportCsv
    ) {
      setCsvError(
        'You do not have permission to import transport requests.'
      );
      return;
    }

    if (!csvBatch) {
      return;
    }

    if (
      Number(
        csvBatch.errorCount
      ) > 0
    ) {
      setCsvError(
        'Fix the CSV errors and check the file again before importing.'
      );
      return;
    }

    if (
      Number(
        csvBatch.warningCount
      ) > 0 &&
      !csvWarningsConfirmed
    ) {
      setCsvError(
        'Please confirm that you have reviewed the warnings before importing.'
      );
      return;
    }

    setCsvImporting(true);
    setCsvError('');
    setSuccess('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/transport-request-imports/${csvBatch.id}/confirm`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body:
              JSON.stringify({
                confirmWarnings:
                  csvWarningsConfirmed
              })
          }
        );

      const data =
        await response.json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to import transport requests'
        );
      }

      const importedCount =
        Number(
          data.batch?.importedCount ||
          0
        );

      setCsvBatch(
        data.batch ||
        null
      );

      setCsvFile(null);
      setCsvWarningsConfirmed(false);

      setSuccess(
        `${importedCount} transport ${
          importedCount === 1
            ? 'request'
            : 'requests'
        } imported successfully.`
      );

      await loadSpecialTransport();
    } catch (importError) {
      setCsvError(
        importError.message ||
          'Unable to import transport requests'
      );
    } finally {
      setCsvImporting(false);
    }
  }


  async function submitRequest(
    event
  ) {
    event.preventDefault();

    setError('');
    setSuccess('');

    if (!form.programmeWindowId) {
      setError(
        'Please select a transport service.'
      );
      return;
    }

    if (
      !form.budgetId ||
      !form.reasonCodeId
    ) {
      setError(
        'Please select a budget and reason code.'
      );
      return;
    }

    setSaving(true);

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/transport-requests`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body:
              JSON.stringify({
                programmeWindowId:
                  Number(
                    form.programmeWindowId
                  ),
                passengerName:
                  form.passengerName,
                passengerMobile:
                  form.passengerMobile,
                passengerEmail:
                  form.passengerEmail,
                direction:
                  form.direction,
                shiftTime:
                  form.shiftTime,
                pickupAddress:
                  form.pickupAddress,
                pickupPostcode:
                  form.pickupPostcode,
                pickupLatitude:
                  form.pickupLatitude,
                pickupLongitude:
                  form.pickupLongitude,

                destinationAddress:
                  form.destinationAddress,
                destinationPostcode:
                  form.destinationPostcode,
                destinationLatitude:
                  form.destinationLatitude,
                destinationLongitude:
                  form.destinationLongitude,

                passengerCount:
                  Number(
                    form.passengerCount
                  ),

                budgetId:
                  Number(
                    form.budgetId
                  ),
                reasonCodeId:
                  Number(
                    form.reasonCodeId
                  ),

                passengerNotes:
                  form.passengerNotes
              })
          }
        );

      const data =
        await response.json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to submit transport request'
        );
      }

      setSuccess(
        'Request received — this is not yet a confirmed taxi booking. We will review the details and update you as planning progresses.'
      );

      setForm(
        (current) => ({
          ...createInitialSpecialTransportForm(
            currentUser
          ),
          programmeWindowId:
            current.programmeWindowId,
          shiftTime:
            selectedOption
              ? specialTransportLocalDateTime(
                  selectedOption.startsAt
                )
              : '',
          passengerMobile:
            current.passengerMobile
        })
      );

      await loadSpecialTransport();
    } catch (submitError) {
      setError(
        submitError.message ||
          'Unable to submit transport request'
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card state-panel">
        Loading special transport…
      </div>
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Special Transport</h1>

          <p>
            Request staff transport for special
            services and exceptional operating
            periods.
          </p>
        </div>
      </div>

      {success && (
        <div className="notice success">
          {success}
        </div>
      )}

      {error && (
        <div className="notice error">
          {error}
        </div>
      )}

      {options.length === 0 ? (
        <section className="card special-transport-unavailable">
          <CalendarDays size={30}/>

          <strong>
            No special transport services are
            currently open for requests
          </strong>

          <span>
            Available services will appear here
            when requests open.
          </span>
        </section>
      ) : (
        <form
          className="special-transport-layout"
          onSubmit={submitRequest}
        >
          <section className="card special-transport-form-card">
            <div className="special-transport-section-heading">
              <div>
                <h2>Request transport</h2>

                <p>
                  Tell us your shift details and
                  journey requirements. Your final
                  taxi pickup time will be arranged
                  during route planning.
                </p>
              </div>
            </div>

            <div className="notice special-transport-info">
              Submitting this form creates a
              transport request only. It does not
              create or guarantee a taxi booking.
            </div>

            <div className="special-transport-service-picker">
              <span className="special-transport-field-label">
                Select service day
              </span>

              <div className="special-transport-window-buttons">
                {options.map(
                  (option) => {
                    const selected =
                      String(
                        option.windowId
                      ) ===
                        String(
                          form.programmeWindowId
                        );

                    return (
                      <button
                        key={option.windowId}
                        type="button"
                        className={
                          selected
                            ? 'active'
                            : ''
                        }
                        onClick={() =>
                          selectTransportWindow(
                            option
                          )
                        }
                      >
                        {specialTransportWindowButtonLabel(
                          option
                        )}
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            <div className="form-grid two special-transport-compact-row">
              <label>
                Journey

                <select
                  value={form.direction}
                  onChange={(event) =>
                    updateField(
                      'direction',
                      event.target.value
                    )
                  }
                >
                  <option value="to_work">
                    Travelling to work
                  </option>

                  <option value="from_work">
                    Travelling home from work
                  </option>
                </select>
              </label>

              <label>
                {form.direction ===
                'to_work'
                  ? 'Shift start date and time'
                  : 'Shift finish date and time'}

                <input
                  type="datetime-local"
                  value={form.shiftTime}
                  onChange={(event) =>
                    updateField(
                      'shiftTime',
                      event.target.value
                    )
                  }
                  required
                />
              </label>
            </div>

            {selectedOption && (
              <div className="special-transport-service-summary">
                <strong>
                  {selectedOption.windowName}
                </strong>

                <span>
                  {formatSpecialTransportWindow(
                    selectedOption.startsAt
                  )}
                  {' – '}
                  {formatSpecialTransportWindow(
                    selectedOption.endsAt
                  )}
                </span>

                {selectedOption.programmePublicNotes && (
                  <p>
                    {
                      selectedOption.programmePublicNotes
                    }
                  </p>
                )}

                {selectedOption.windowPublicNotes && (
                  <p>
                    {
                      selectedOption.windowPublicNotes
                    }
                  </p>
                )}
              </div>
            )}


            <div className="special-transport-subheading">
              Passenger
            </div>

            <div className="form-grid two">
              <label>
                Passenger name

                <input
                  value={form.passengerName}
                  onChange={(event) =>
                    updateField(
                      'passengerName',
                      event.target.value
                    )
                  }
                  required
                />
              </label>

              <label>
                Mobile number

                <input
                  type="tel"
                  value={form.passengerMobile}
                  onChange={(event) =>
                    updateField(
                      'passengerMobile',
                      event.target.value
                    )
                  }
                  required
                />
              </label>

              <label>
                Email

                <input
                  type="email"
                  value={form.passengerEmail}
                  onChange={(event) =>
                    updateField(
                      'passengerEmail',
                      event.target.value
                    )
                  }
                />
              </label>

              <label>
                Passengers

                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.passengerCount}
                  onChange={(event) =>
                    updateField(
                      'passengerCount',
                      event.target.value
                    )
                  }
                  required
                />
              </label>
            </div>

            <div className="special-transport-subheading">
              Journey
            </div>

            <div className="form-grid two special-transport-journey-grid">
              <label>
                {form.direction ===
                'to_work'
                  ? 'Home / pickup'
                  : 'Work pickup'}

                <SpecialTransportAddressSearch
                  value={form.pickupAddress}
                  savedLocations={savedLocations}
                  placeholder="Start typing an address or UHP location…"
                  onChange={(value) =>
                    updateJourneyAddress(
                      'pickup',
                      value
                    )
                  }
                  onSelect={(result) =>
                    selectJourneyAddress(
                      'pickup',
                      result
                    )
                  }
                />

                {form.pickupPostcode && (
                  <small className="special-transport-address-meta">
                    {form.pickupPostcode}
                  </small>
                )}
              </label>

              <label>
                {form.direction ===
                'to_work'
                  ? 'Work destination'
                  : 'Home / destination'}

                <SpecialTransportAddressSearch
                  value={
                    form.destinationAddress
                  }
                  savedLocations={savedLocations}
                  placeholder="Start typing an address or UHP location…"
                  onChange={(value) =>
                    updateJourneyAddress(
                      'destination',
                      value
                    )
                  }
                  onSelect={(result) =>
                    selectJourneyAddress(
                      'destination',
                      result
                    )
                  }
                />

                {form.destinationPostcode && (
                  <small className="special-transport-address-meta">
                    {form.destinationPostcode}
                  </small>
                )}
              </label>
            </div>

            <SpecialTransportJourneyMap
              pickupAddress={
                form.pickupAddress
              }
              pickupLatitude={
                form.pickupLatitude
              }
              pickupLongitude={
                form.pickupLongitude
              }
              destinationAddress={
                form.destinationAddress
              }
              destinationLatitude={
                form.destinationLatitude
              }
              destinationLongitude={
                form.destinationLongitude
              }
            />

            <div className="special-transport-subheading">
              UHP authorisation
            </div>

            <div className="form-grid two">
              <label>
                Budget Number

                <select
                  required
                  value={form.budgetId}
                  onChange={(event) =>
                    updateField(
                      'budgetId',
                      event.target.value
                    )
                  }
                >
                  <option value="">
                    Select budget…
                  </option>

                  {budgets.map(
                    (budget) => (
                      <option
                        key={budget.id}
                        value={budget.id}
                      >
                        {budget.budgetNumber}
                        {' — '}
                        {budget.name}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                Reason Code

                <select
                  required
                  value={form.reasonCodeId}
                  onChange={(event) =>
                    updateField(
                      'reasonCodeId',
                      event.target.value
                    )
                  }
                >
                  <option value="">
                    Select reason…
                  </option>

                  {reasonCodes.map(
                    (reason) => (
                      <option
                        key={reason.id}
                        value={reason.id}
                      >
                        {reason.code}
                        {' — '}
                        {reason.description}
                      </option>
                    )
                  )}
                </select>
              </label>
            </div>

            {selectedBudget && (
              <div className="special-transport-funding-summary">
                <div>
                  <span>
                    Department / Ward
                  </span>

                  <strong>
                    {selectedBudget.department ||
                      '—'}
                  </strong>
                </div>

                <div>
                  <span>
                    Budget Holder
                  </span>

                  <strong>
                    {selectedBudget.budgetHolder ||
                      '—'}
                  </strong>
                </div>
              </div>
            )}

            <label className="special-transport-notes-field">
              Passenger notes

              <textarea
                rows="2"
                value={form.passengerNotes}
                onChange={(event) =>
                  updateField(
                    'passengerNotes',
                    event.target.value
                  )
                }
                placeholder="Optional — include any important mobility, access or collection information we should be aware of."
              />
            </label>

            <div className="special-transport-actions">
              <button
                type="submit"
                disabled={saving}
              >
                {saving
                  ? 'Sending request…'
                  : 'Send transport request'}
              </button>
            </div>
          </section>
        </form>
      )}

      {canImportTransportCsv && (
        <section className="card special-transport-csv-card">
          <div className="special-transport-section-heading">
            <div>
              <h2>
                Import staff requests from CSV
              </h2>

              <p>
                Upload multiple staff transport requests
                and check them before anything is imported.
              </p>
            </div>

            <button
              type="button"
              className="special-transport-csv-template"
              onClick={
                downloadTransportRequestCsvTemplate
              }
            >
              Download CSV template
            </button>
          </div>

          <div className="notice special-transport-info">
            CSV imports create transport requests only.
            They do not create taxi bookings or send
            anything to Autocab.
          </div>

          <div className="special-transport-csv-upload">
            <label>
              CSV file

              <input
                type="file"
                accept=".csv,text/csv"
                onChange={
                  selectTransportCsvFile
                }
                disabled={
                  csvChecking ||
                  csvImporting
                }
              />
            </label>

            <button
              type="button"
              onClick={
                previewTransportCsv
              }
              disabled={
                !csvFile ||
                csvChecking ||
                csvImporting
              }
            >
              {csvChecking
                ? 'Checking file…'
                : 'Check file'}
            </button>
          </div>

          {csvFile && !csvBatch && (
            <div className="special-transport-csv-file">
              Selected:{' '}
              <strong>
                {csvFile.name}
              </strong>
            </div>
          )}

          {csvError && (
            <div className="notice error special-transport-csv-notice">
              {csvError}
            </div>
          )}

          {csvBatch && (
            <div className="special-transport-csv-preview">
              <div className="special-transport-csv-summary">
                <div>
                  <span>Total rows</span>
                  <strong>
                    {csvBatch.rowCount}
                  </strong>
                </div>

                <div className="csv-ready">
                  <span>Ready</span>
                  <strong>
                    {csvBatch.readyCount}
                  </strong>
                </div>

                <div className="csv-warning">
                  <span>Warnings</span>
                  <strong>
                    {csvBatch.warningCount}
                  </strong>
                </div>

                <div className="csv-error">
                  <span>Errors</span>
                  <strong>
                    {csvBatch.errorCount}
                  </strong>
                </div>
              </div>

              {Number(
                csvBatch.errorCount
              ) > 0 && (
                <div className="notice error special-transport-csv-notice">
                  This file cannot be imported yet.
                  Correct the rows marked as errors,
                  then upload and check the file again.
                </div>
              )}

              {Number(
                csvBatch.warningCount
              ) > 0 && (
                <div className="notice special-transport-csv-warning-notice">
                  Warnings may indicate possible
                  duplicate requests. Review them
                  carefully before continuing.
                </div>
              )}

              <div className="table-wrap special-transport-csv-table-wrap">
                <table className="bookings-table special-transport-csv-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Passenger</th>
                      <th>Service</th>
                      <th>Shift</th>
                      <th>Check result</th>
                      <th>Details</th>
                    </tr>
                  </thead>

                  <tbody>
                    {(csvBatch.rows || [])
                      .map(
                        (row) => {
                          const raw =
                            row.raw ||
                            {};

                          const normalised =
                            row.normalised ||
                            {};

                          const issues = [
                            ...(row.errors || []),
                            ...(row.warnings || [])
                          ];

                          return (
                            <tr
                              key={row.id}
                            >
                              <td>
                                {row.rowNumber}
                              </td>

                              <td>
                                <strong>
                                  {normalised.passengerName ||
                                    [
                                      raw['First Name'],
                                      raw['Last Name']
                                    ]
                                      .filter(Boolean)
                                      .join(' ') ||
                                    '—'}
                                </strong>

                                <small>
                                  {normalised.passengerMobile ||
                                    raw.Mobile ||
                                    '—'}
                                </small>
                              </td>

                              <td>
                                {normalised.serviceName ||
                                  raw.Service ||
                                  '—'}
                              </td>

                              <td>
                                <strong>
                                  {normalised.shiftTime
                                    ? formatSpecialTransportWindow(
                                        normalised.shiftTime
                                      )
                                    : [
                                        raw['Shift Date'],
                                        raw['Shift Time']
                                      ]
                                        .filter(Boolean)
                                        .join(' ') ||
                                      '—'}
                                </strong>

                                <small>
                                  {normalised.direction ===
                                  'from_work'
                                    ? 'From work'
                                    : normalised.direction ===
                                      'to_work'
                                    ? 'To work'
                                    : raw.Direction ||
                                      '—'}
                                </small>
                              </td>

                              <td>
                                <span
                                  className={`special-transport-csv-status ${row.status}`}
                                >
                                  {row.status ===
                                  'ready'
                                    ? 'Ready'
                                    : row.status ===
                                      'warning'
                                    ? 'Warning'
                                    : row.status ===
                                      'error'
                                    ? 'Error'
                                    : row.status ===
                                      'imported'
                                    ? 'Imported'
                                    : row.status}
                                </span>
                              </td>

                              <td>
                                {issues.length ===
                                0 ? (
                                  <span className="special-transport-csv-ok">
                                    No issues
                                  </span>
                                ) : (
                                  <ul className="special-transport-csv-issues">
                                    {issues.map(
                                      (
                                        issue,
                                        index
                                      ) => (
                                        <li
                                          key={
                                            index
                                          }
                                        >
                                          {transportCsvIssueText(
                                            issue
                                          )}
                                        </li>
                                      )
                                    )}
                                  </ul>
                                )}
                              </td>
                            </tr>
                          );
                        }
                      )}
                  </tbody>
                </table>
              </div>

              {csvBatch.status !==
                'imported' && (
                <div className="special-transport-csv-confirm">
                  {Number(
                    csvBatch.warningCount
                  ) > 0 && (
                    <label className="special-transport-csv-warning-confirm">
                      <input
                        type="checkbox"
                        checked={
                          csvWarningsConfirmed
                        }
                        onChange={(
                          event
                        ) =>
                          setCsvWarningsConfirmed(
                            event.target
                              .checked
                          )
                        }
                        disabled={
                          csvImporting
                        }
                      />

                      <span>
                        I have reviewed the
                        warnings and want to
                        import these requests.
                      </span>
                    </label>
                  )}

                  <button
                    type="button"
                    onClick={
                      confirmTransportCsvImport
                    }
                    disabled={
                      csvImporting ||
                      Number(
                        csvBatch.errorCount
                      ) > 0 ||
                      (
                        Number(
                          csvBatch.warningCount
                        ) > 0 &&
                        !csvWarningsConfirmed
                      )
                    }
                  >
                    {csvImporting
                      ? 'Importing requests…'
                      : `Import ${
                          csvBatch.rowCount
                        } ${
                          Number(
                            csvBatch.rowCount
                          ) === 1
                            ? 'request'
                            : 'requests'
                        }`}
                  </button>
                </div>
              )}

              {csvBatch.status ===
                'imported' && (
                <div className="notice success special-transport-csv-notice">
                  Import complete —{' '}
                  {csvBatch.importedCount}{' '}
                  {Number(
                    csvBatch.importedCount
                  ) === 1
                    ? 'request'
                    : 'requests'}{' '}
                  added.
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <section className="card special-transport-requests-card">
        <div className="special-transport-section-heading">
          <div>
            <h2>
              {isUhpAdmin
                ? 'Transport Requests'
                : 'My Transport Requests'}
            </h2>

            <p>
              Follow each request from receipt
              through planning and confirmation.
            </p>
          </div>
        </div>

        {isUhpAdmin &&
          requests.length > 0 && (
            <div className="special-transport-admin-filters">
              <div className="form-grid two">
                <label>
                  Search requests

                  <input
                    type="search"
                    value={
                      transportRequestSearch
                    }
                    onChange={(event) =>
                      setTransportRequestSearch(
                        event.target.value
                      )
                    }
                    placeholder="Passenger, requester, address…"
                  />
                </label>

                <label>
                  Status

                  <select
                    value={
                      transportRequestStatusFilter
                    }
                    onChange={(event) =>
                      setTransportRequestStatusFilter(
                        event.target.value
                      )
                    }
                  >
                    <option value="">
                      All statuses
                    </option>

                    {transportRequestStatusOptions.map(
                      (status) => (
                        <option
                          key={status}
                          value={status}
                        >
                          {specialTransportStatusLabel(
                            status
                          )}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label>
                  Service day

                  <select
                    value={
                      transportRequestServiceFilter
                    }
                    onChange={(event) =>
                      setTransportRequestServiceFilter(
                        event.target.value
                      )
                    }
                  >
                    <option value="">
                      All services
                    </option>

                    {transportRequestServiceOptions.map(
                      (service) => (
                        <option
                          key={service}
                          value={service}
                        >
                          {service}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <div className="special-transport-filter-summary">
                  <span>
                    Showing{' '}
                    <strong>
                      {
                        filteredTransportRequests.length
                      }
                    </strong>
                    {' of '}
                    <strong>
                      {requests.length}
                    </strong>
                    {' requests'}
                  </span>

                  {(transportRequestSearch ||
                    transportRequestStatusFilter ||
                    transportRequestServiceFilter) && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setTransportRequestSearch('');
                        setTransportRequestStatusFilter('');
                        setTransportRequestServiceFilter('');
                      }}
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

        {requests.length === 0 ? (
          <div className="empty-bookings">
            <CalendarDays size={30}/>

            <strong>
              No transport requests yet
            </strong>

            <span>
              Submitted special transport requests
              will appear here.
            </span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="bookings-table booking-list-compact">
              <thead>
                <tr>
                  <th>Service</th>
                  {isUhpAdmin && (
                    <th>Requested by</th>
                  )}
                  <th>Passenger</th>
                  <th>Shift</th>
                  <th>Journey</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {filteredTransportRequests.map(
                  (request) => (
                    <tr
                      key={request.id}
                      className="special-transport-review-row"
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        openTransportRequestReview(
                          request.id
                        )
                      }
                      onKeyDown={(event) => {
                        if (
                          event.key === 'Enter' ||
                          event.key === ' '
                        ) {
                          event.preventDefault();

                          openTransportRequestReview(
                            request.id
                          );
                        }
                      }}
                    >
                      <td>
                        <strong>
                          {
                            request.programmeWindowName
                          }
                        </strong>

                        <small>
                          {
                            request.programmeName
                          }
                        </small>
                      </td>

                      {isUhpAdmin && (
                        <td>
                          {
                            request.requestedByName ||
                            request.enteredByName ||
                            '—'
                          }
                        </td>
                      )}

                      <td>
                        {
                          request.passengerName ||
                          '—'
                        }
                      </td>

                      <td>
                        <strong>
                          {formatSpecialTransportWindow(
                            request.shiftTime
                          )}
                        </strong>

                        <small>
                          {request.direction ===
                          'to_work'
                            ? 'Shift starts'
                            : 'Shift finishes'}
                        </small>
                      </td>

                      <td>
                        <strong>
                          {
                            request.pickupAddress ||
                            '—'
                          }
                        </strong>

                        <small>
                          to{' '}
                          {
                            request.destinationAddress ||
                            '—'
                          }
                        </small>
                      </td>

                      <td>
                        <span className="special-transport-status">
                          {
                            specialTransportStatusLabel(
                              request.status
                            )
                          }
                        </span>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(
        reviewLoading ||
        reviewRequest ||
        reviewError
      ) && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target ===
                event.currentTarget
            ) {
              closeTransportRequestReview();
            }
          }}
        >
          <div className="modal-card special-transport-review-modal">
            <div className="special-transport-review-header">
              <div>
                <small>
                  Special Transport
                </small>

                <h2>
                  Transport request
                </h2>
              </div>

              <button
                type="button"
                className="secondary"
                onClick={
                  closeTransportRequestReview
                }
                disabled={reviewSaving}
              >
                Close
              </button>
            </div>

            {reviewLoading ? (
              <div className="card state-panel">
                Loading request…
              </div>
            ) : reviewError &&
              !reviewRequest ? (
              <div className="notice error">
                {reviewError}
              </div>
            ) : reviewRequest ? (
              <>
                {reviewError && (
                  <div className="notice error">
                    {reviewError}
                  </div>
                )}

                <div className="special-transport-review-status">
                  <span>
                    Current status
                  </span>

                  <strong>
                    {specialTransportStatusLabel(
                      reviewRequest.status
                    )}
                  </strong>
                </div>

                <div className="special-transport-review-grid">
                  <div>
                    <span>Requested by</span>
                    <strong>
                      {reviewRequest.requestedByName ||
                        reviewRequest.enteredByName ||
                        '—'}
                    </strong>
                    <small>
                      {reviewRequest.requestedByEmail ||
                        ''}
                    </small>
                  </div>

                  <div>
                    <span>Passenger</span>
                    <strong>
                      {reviewRequest.passengerName ||
                        '—'}
                    </strong>
                    <small>
                      {reviewRequest.passengerMobile ||
                        ''}
                    </small>
                    <small>
                      {reviewRequest.passengerEmail ||
                        ''}
                    </small>
                  </div>

                  <div>
                    <span>Service</span>
                    <strong>
                      {reviewRequest.programmeWindowName ||
                        '—'}
                    </strong>
                    <small>
                      {reviewRequest.programmeName ||
                        ''}
                    </small>
                  </div>

                  <div>
                    <span>
                      {reviewRequest.direction ===
                      'to_work'
                        ? 'Shift starts'
                        : 'Shift finishes'}
                    </span>
                    <strong>
                      {formatSpecialTransportWindow(
                        reviewRequest.shiftTime
                      )}
                    </strong>
                    <small>
                      {reviewRequest.direction ===
                      'to_work'
                        ? 'Travelling to work'
                        : 'Travelling home from work'}
                    </small>
                  </div>

                  <div>
                    <span>Pickup</span>
                    <strong>
                      {reviewRequest.pickupAddress ||
                        '—'}
                    </strong>
                    <small>
                      {reviewRequest.pickupPostcode ||
                        ''}
                    </small>
                  </div>

                  <div>
                    <span>Destination</span>
                    <strong>
                      {reviewRequest.destinationAddress ||
                        '—'}
                    </strong>
                    <small>
                      {reviewRequest.destinationPostcode ||
                        ''}
                    </small>
                  </div>

                  <div>
                    <span>Passengers</span>
                    <strong>
                      {reviewRequest.passengerCount ||
                        1}
                    </strong>
                  </div>

                  <div>
                    <span>Budget Number</span>
                    <strong>
                      {reviewRequest.budgetNumber ||
                        '—'}
                    </strong>
                    <small>
                      {reviewRequest.budgetName ||
                        ''}
                    </small>
                  </div>

                  <div>
                    <span>Reason Code</span>
                    <strong>
                      {reviewRequest.reasonCode ||
                        '—'}
                    </strong>
                    <small>
                      {reviewRequest.reasonDescription ||
                        ''}
                    </small>
                  </div>

                  <div>
                    <span>
                      Department / Ward
                    </span>
                    <strong>
                      {reviewRequest.department ||
                        '—'}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Budget Holder
                    </span>
                    <strong>
                      {reviewRequest.budgetHolder ||
                        '—'}
                    </strong>
                  </div>
                </div>

                {requestEditMode &&
                  requestEditForm && (
                    <div className="special-transport-edit-panel">
                      <div className="special-transport-subheading">
                        Amend request
                      </div>

                      <div className="form-grid two">
                        <label>
                          Passenger name

                          <input
                            value={
                              requestEditForm.passengerName
                            }
                            onChange={(event) =>
                              updateTransportRequestEditField(
                                'passengerName',
                                event.target.value
                              )
                            }
                            required
                          />
                        </label>

                        <label>
                          Mobile number

                          <input
                            type="tel"
                            value={
                              requestEditForm.passengerMobile
                            }
                            onChange={(event) =>
                              updateTransportRequestEditField(
                                'passengerMobile',
                                event.target.value
                              )
                            }
                            required
                          />
                        </label>

                        <label>
                          Email

                          <input
                            type="email"
                            value={
                              requestEditForm.passengerEmail
                            }
                            onChange={(event) =>
                              updateTransportRequestEditField(
                                'passengerEmail',
                                event.target.value
                              )
                            }
                          />
                        </label>

                        <label>
                          Journey

                          <select
                            value={
                              requestEditForm.direction
                            }
                            onChange={(event) =>
                              updateTransportRequestEditField(
                                'direction',
                                event.target.value
                              )
                            }
                          >
                            <option value="to_work">
                              Travelling to work
                            </option>

                            <option value="from_work">
                              Travelling home from work
                            </option>
                          </select>
                        </label>

                        <label>
                          {requestEditForm.direction ===
                          'to_work'
                            ? 'Shift start date and time'
                            : 'Shift finish date and time'}

                          <input
                            type="datetime-local"
                            value={
                              requestEditForm.shiftTime
                            }
                            onChange={(event) =>
                              updateTransportRequestEditField(
                                'shiftTime',
                                event.target.value
                              )
                            }
                            required
                          />
                        </label>

                        <label>
                          Pickup address

                          <input
                            value={
                              requestEditForm.pickupAddress
                            }
                            onChange={(event) =>
                              updateTransportRequestEditField(
                                'pickupAddress',
                                event.target.value
                              )
                            }
                            required
                          />
                        </label>

                        <label>
                          Pickup postcode

                          <input
                            value={
                              requestEditForm.pickupPostcode
                            }
                            onChange={(event) =>
                              updateTransportRequestEditField(
                                'pickupPostcode',
                                event.target.value
                              )
                            }
                          />
                        </label>

                        <label>
                          Destination address

                          <input
                            value={
                              requestEditForm.destinationAddress
                            }
                            onChange={(event) =>
                              updateTransportRequestEditField(
                                'destinationAddress',
                                event.target.value
                              )
                            }
                            required
                          />
                        </label>

                        <label>
                          Destination postcode

                          <input
                            value={
                              requestEditForm.destinationPostcode
                            }
                            onChange={(event) =>
                              updateTransportRequestEditField(
                                'destinationPostcode',
                                event.target.value
                              )
                            }
                          />
                        </label>
                      </div>

                      <label>
                        Important information

                        <textarea
                          rows="3"
                          value={
                            requestEditForm.passengerNotes
                          }
                          onChange={(event) =>
                            updateTransportRequestEditField(
                              'passengerNotes',
                              event.target.value
                            )
                          }
                        />
                      </label>

                      <div className="special-transport-review-actions">
                        <button
                          type="button"
                          className="secondary"
                          disabled={reviewSaving}
                          onClick={() => {
                            setRequestEditMode(false);

                            setRequestEditForm(
                              createTransportRequestEditForm(
                                reviewRequest
                              )
                            );

                            setReviewError('');
                          }}
                        >
                          Cancel changes
                        </button>

                        <button
                          type="button"
                          disabled={reviewSaving}
                          onClick={
                            submitTransportRequestAmend
                          }
                        >
                          {reviewSaving
                            ? 'Saving…'
                            : 'Save changes'}
                        </button>
                      </div>
                    </div>
                  )}

                {!requestEditMode &&
                  transportRequestCanBeChanged(
                    reviewRequest
                  ) && (
                    <div className="special-transport-review-actions">
                      <button
                        type="button"
                        className="secondary"
                        disabled={reviewSaving}
                        onClick={() =>
                          setRequestEditMode(true)
                        }
                      >
                        Amend request
                      </button>

                      <button
                        type="button"
                        className="secondary"
                        disabled={reviewSaving}
                        onClick={
                          cancelTransportRequestFromPortal
                        }
                      >
                        Cancel request
                      </button>
                    </div>
                  )}

                <div className="special-transport-review-notes">
                  <div>
                    <span>
                      Passenger notes
                    </span>

                    <p>
                      {reviewRequest.passengerNotes ||
                        reviewRequest.accessibilityNotes ||
                        'None provided'}
                    </p>
                  </div>
                </div>

                {isUhpAdmin && (
                  <label className="special-transport-internal-note">
                    UHP internal note

                    <textarea
                      rows="4"
                      value={reviewNotes}
                      onChange={(event) =>
                        setReviewNotes(
                          event.target.value
                        )
                      }
                      placeholder="Optional internal note for UHP review. This is not shown to the requester."
                    />
                  </label>
                )}

                <div className="special-transport-review-history">
                  <h3>
                    Request history
                  </h3>

                  {(reviewRequest.events || [])
                    .map(
                      (event) => (
                        <div
                          className="special-transport-history-item"
                          key={event.id}
                        >
                          <div>
                            <strong>
                              {event.eventType ===
                              'amended'
                                ? 'Amended'
                                : event.eventType ===
                                  'cancelled'
                                  ? 'Cancelled'
                                  : event.eventType ===
                                    'submitted'
                                    ? 'Request received'
                                    : specialTransportStatusLabel(
                                        event.newStatus
                                      )}
                            </strong>

                            <span>
                              {event.notes}
                            </span>
                          </div>

                          <small>
                            {event.actorName
                              ? `${event.actorName} · `
                              : ''}
                            {formatSpecialTransportWindow(
                              event.createdAt
                            )}
                          </small>
                        </div>
                      )
                    )}
                </div>

                {isUhpAdmin &&
                  !requestEditMode &&
                  transportRequestCanBeChanged(
                    reviewRequest
                  ) && (
                    <div className="special-transport-review-actions">
                      <button
                        type="button"
                        className="secondary"
                        disabled={reviewSaving}
                        onClick={() =>
                          submitTransportRequestReview(
                            'needs_information'
                          )
                        }
                      >
                        {reviewSaving
                          ? 'Saving…'
                          : 'Needs more information'}
                      </button>

                      <button
                        type="button"
                        disabled={reviewSaving}
                        onClick={() =>
                          submitTransportRequestReview(
                            'ready_for_planning'
                          )
                        }
                      >
                        {reviewSaving
                          ? 'Saving…'
                          : 'Details checked'}
                      </button>
                    </div>
                  )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}


function BookTransportPage({ currentUser }) {
  const bookingUserId = currentUser.id;

  const [
    form,
    setForm
  ] = useState(
    () =>
      createInitialBookingForm()
  );
  const [vias, setVias] = useState([]);

  const [bookingUser, setBookingUser] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [reasonCodes, setReasonCodes] = useState([]);
  const [savedLocations, setSavedLocations] = useState([]);
  const [bookingFavourites, setBookingFavourites] = useState([]);
  const [recentBookings, setRecentBookings] = useState([]);
  const [quickBookLoading, setQuickBookLoading] = useState(true);
  const [savingFavourite, setSavingFavourite] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [pendingBookingId, setPendingBookingId] = useState(null);
  const [
    pendingBookingReference,
    setPendingBookingReference
  ] = useState('');

  const [journeyEta, setJourneyEta] =
    useState({
      status: 'idle',
      durationSeconds: null,
      distance: null
    });

  const [pickupEta, setPickupEta] =
    useState({
      status: 'idle',
      durationSeconds: null,
      nearbyCount: 0
    });

  useEffect(() => {
    loadBookingOptions();
  }, []);

  async function loadBookingOptions() {
    setLoading(true);
    setError('');

    try {
      const [
        response,
        favouritesResponse,
        recentResponse
      ] = await Promise.all([
        apiFetch(
          `${API_BASE}/api/booking-options?userId=${bookingUserId}`
        ),
        apiFetch(
          `${API_BASE}/api/booking-favourites`
        ),
        apiFetch(
          `${API_BASE}/api/my-bookings`
        )
      ]);

      const [
        data,
        favouritesData,
        recentData
      ] = await Promise.all([
        response.json(),
        favouritesResponse.json(),
        recentResponse.json()
      ]);

      if (!response.ok) {
        throw new Error(
          data.error || 'Unable to load booking options'
        );
      }

      if (!favouritesResponse.ok) {
        throw new Error(
          favouritesData.error ||
            'Unable to load favourite bookings'
        );
      }

      if (!recentResponse.ok) {
        throw new Error(
          recentData.error ||
            'Unable to load recent bookings'
        );
      }

      setBookingUser(data.user ?? null);
      setBudgets(data.budgets ?? []);
      setReasonCodes(data.reasonCodes ?? []);
      setSavedLocations(
        Array.isArray(data.savedLocations)
          ? data.savedLocations
          : []
      );

      setBookingFavourites(
        Array.isArray(favouritesData.favourites)
          ? favouritesData.favourites
          : []
      );

      setRecentBookings(
        Array.isArray(recentData.bookings)
          ? recentData.bookings.slice(0, 6)
          : []
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load booking options'
      );
    } finally {
      setLoading(false);
      setQuickBookLoading(false);
    }
  }

  const selectedBudget = useMemo(
    () =>
      budgets.find(
        (budget) =>
          String(budget.id) === String(form.budgetId)
      ) ?? null,
    [budgets, form.budgetId]
  );

  useEffect(
    () => {
      const hasCoordinate =
        (value) =>
          value !== null &&
          value !== undefined &&
          value !== '' &&
          Number.isFinite(
            Number(value)
          );

      const pickupReady =
        hasCoordinate(
          form.pickupLatitude
        ) &&
        hasCoordinate(
          form.pickupLongitude
        );

      if (!pickupReady) {
        setPickupEta({
          status: 'idle',
          durationSeconds: null,
          nearbyCount: 0
        });

        return undefined;
      }

      let cancelled = false;
      let intervalId = null;
      let inFlight = false;

      const controller =
        new AbortController();

      async function loadPickupEta() {
        if (
          cancelled ||
          inFlight
        ) {
          return;
        }

        inFlight = true;

        setPickupEta(
          (current) =>
            current.status ===
              'success'
              ? current
              : {
                  ...current,
                  status: 'loading'
                }
        );

        try {
          const response =
            await apiFetch(
              `${API_BASE}/api/pickup-eta`,
              {
                method: 'POST',

                headers: {
                  'Content-Type':
                    'application/json'
                },

                body:
                  JSON.stringify({
                    latitude:
                      Number(
                        form.pickupLatitude
                      ),

                    longitude:
                      Number(
                        form.pickupLongitude
                      )
                  }),

                signal:
                  controller.signal
              }
            );

          const result =
            await response.json();

          if (!response.ok) {
            throw new Error(
              result.error ||
              'Pickup estimate unavailable'
            );
          }

          if (cancelled) {
            return;
          }

          const durationSeconds =
            Number(
              result?.pickupEta
                ?.durationSeconds
            );

          const nearbyCount =
            Number(
              result?.pickupEta
                ?.nearbyCount
            );

          if (
            result?.pickupEta?.status ===
              'success' &&
            Number.isFinite(
              durationSeconds
            ) &&
            durationSeconds >= 0
          ) {
            setPickupEta({
              status: 'success',
              durationSeconds,
              nearbyCount:
                Number.isFinite(
                  nearbyCount
                )
                  ? nearbyCount
                  : 0
            });
          } else {
            setPickupEta({
              status: 'unavailable',
              durationSeconds: null,
              nearbyCount:
                Number.isFinite(
                  nearbyCount
                )
                  ? nearbyCount
                  : 0
            });
          }
        } catch (err) {
          if (
            cancelled ||
            err?.name ===
              'AbortError'
          ) {
            return;
          }

          setPickupEta({
            status: 'error',
            durationSeconds: null,
            nearbyCount: 0
          });
        } finally {
          inFlight = false;
        }
      }

      const timer =
        window.setTimeout(
          () => {
            loadPickupEta();

            intervalId =
              window.setInterval(
                loadPickupEta,
                15000
              );
          },
          350
        );

      return () => {
        cancelled = true;

        window.clearTimeout(
          timer
        );

        if (intervalId) {
          window.clearInterval(
            intervalId
          );
        }

        controller.abort();
      };
    },
    [
      form.pickupLatitude,
      form.pickupLongitude
    ]
  );


  const etaRoute = useMemo(
    () => {
      const hasCoordinate =
        (value) =>
          value !== null &&
          value !== undefined &&
          value !== '' &&
          Number.isFinite(
            Number(value)
          );

      const pickupReady =
        hasCoordinate(
          form.pickupLatitude
        ) &&
        hasCoordinate(
          form.pickupLongitude
        );

      const destinationReady =
        hasCoordinate(
          form.destinationLatitude
        ) &&
        hasCoordinate(
          form.destinationLongitude
        );

      const enteredVias =
        vias.filter(
          (via) =>
            Boolean(
              via.address?.trim()
            )
        );

      const viasReady =
        enteredVias.every(
          (via) =>
            hasCoordinate(
              via.latitude
            ) &&
            hasCoordinate(
              via.longitude
            )
        );

      if (
        !pickupReady ||
        !destinationReady ||
        !viasReady
      ) {
        return {
          ready: false,
          points: []
        };
      }

      return {
        ready: true,

        points: [
          {
            latitude:
              Number(
                form.pickupLatitude
              ),

            longitude:
              Number(
                form.pickupLongitude
              )
          },

          ...enteredVias.map(
            (via) => ({
              latitude:
                Number(
                  via.latitude
                ),

              longitude:
                Number(
                  via.longitude
                )
            })
          ),

          {
            latitude:
              Number(
                form.destinationLatitude
              ),

            longitude:
              Number(
                form.destinationLongitude
              )
          }
        ]
      };
    },
    [
      form.pickupLatitude,
      form.pickupLongitude,
      form.destinationLatitude,
      form.destinationLongitude,
      vias
    ]
  );

  useEffect(
    () => {
      if (!etaRoute.ready) {
        setJourneyEta({
          status: 'idle',
          durationSeconds: null,
          distance: null
        });

        return undefined;
      }

      const controller =
        new AbortController();

      const timer =
        window.setTimeout(
          async () => {
            setJourneyEta(
              (current) => ({
                ...current,
                status: 'loading'
              })
            );

            try {
              const response =
                await apiFetch(
                  `${API_BASE}/api/eta`,
                  {
                    method: 'POST',

                    headers: {
                      'Content-Type':
                        'application/json'
                    },

                    body:
                      JSON.stringify({
                        points:
                          etaRoute.points
                      }),

                    signal:
                      controller.signal
                  }
                );

              const result =
                await response.json();

              if (!response.ok) {
                throw new Error(
                  result.error ||
                    'Journey estimate unavailable'
                );
              }

              const durationSeconds =
                Number(
                  result?.eta
                    ?.durationSeconds
                );

              if (
                !Number.isFinite(
                  durationSeconds
                ) ||
                durationSeconds < 0
              ) {
                throw new Error(
                  'Journey estimate unavailable'
                );
              }

              setJourneyEta({
                status: 'success',
                durationSeconds,
                distance:
                  result?.eta?.distance ??
                  null
              });
            } catch (err) {
              if (
                err?.name ===
                'AbortError'
              ) {
                return;
              }

              setJourneyEta({
                status: 'error',
                durationSeconds: null,
                distance: null
              });
            }
          },
          350
        );

      return () => {
        window.clearTimeout(
          timer
        );

        controller.abort();
      };
    },
    [etaRoute]
  );

  const journeyEtaMinutes =
    journeyEta.status === 'success'
      ? Math.max(
          1,
          Math.round(
            journeyEta.durationSeconds /
              60
          )
        )
      : null;

  const journeyEtaDistance =
    journeyEta.status === 'success' &&
    Number.isFinite(
      Number(
        journeyEta.distance?.amount
      )
    )
      ? `${Number(
          journeyEta.distance.amount
        ).toFixed(1)} ${
          journeyEta.distance?.type ||
          'mi'
        }`
      : '';

  const pickupEtaMinutes =
    pickupEta.status === 'success'
      ? Math.max(
          1,
          Math.round(
            pickupEta.durationSeconds /
              60
          )
        ) + 5
      : null;

  const pickupEtaTone =
    pickupEtaMinutes === null
      ? 'eta-neutral'
      : pickupEtaMinutes < 10
        ? 'eta-green'
        : pickupEtaMinutes <= 20
          ? 'eta-amber'
          : 'eta-red';


  function applyJourneyTemplate({
    pickup,
    vias: templateVias = [],
    destination,
    passengerCount = 1,
    budgetId = '',
    reasonCodeId = '',
    driverNotes = '',
    passengerName = '',
    passengerMobile = ''
  }) {
    if (!pickup || !destination) {
      return;
    }

    setForm(
      (current) => ({
        ...current,

        pickupAddress:
          pickup.address || '',
        pickupPostcode:
          pickup.postcode || '',
        pickupLatitude:
          pickup.latitude ?? null,
        pickupLongitude:
          pickup.longitude ?? null,
        pickupSavedLocationId:
          pickup.savedLocationId ?? null,
        pickupLocationName:
          pickup.locationName ?? null,
        pickupPickupInstructions:
          pickup.pickupInstructions ?? null,

        destinationAddress:
          destination.address || '',
        destinationPostcode:
          destination.postcode || '',
        destinationLatitude:
          destination.latitude ?? null,
        destinationLongitude:
          destination.longitude ?? null,
        destinationSavedLocationId:
          destination.savedLocationId ?? null,
        destinationLocationName:
          destination.locationName ?? null,
        destinationPickupInstructions:
          destination.pickupInstructions ?? null,

        passengerName:
          passengerName || '',
        passengerMobile:
          passengerMobile || '',
        passengerCount:
          String(passengerCount || 1),

        budgetId:
          budgetId
            ? String(budgetId)
            : '',

        reasonCodeId:
          reasonCodeId
            ? String(reasonCodeId)
            : '',

        driverNotes:
          driverNotes || ''
      })
    );

    setVias(
      templateVias.map(
        (via) => ({
          address:
            via.address || '',
          postcode:
            via.postcode || '',
          latitude:
            via.latitude ?? null,
          longitude:
            via.longitude ?? null,
          savedLocationId:
            via.savedLocationId ?? null,
          locationName:
            via.locationName ?? null,
          pickupInstructions:
            via.pickupInstructions ?? null
        })
      )
    );

    setError('');
  }


  function applyFavourite(favourite) {
    const stops =
      Array.isArray(favourite.stops)
        ? favourite.stops
        : [];

    const pickup =
      stops.find(
        (stop) =>
          stop.stopType === 'pickup'
      );

    const destination =
      stops.find(
        (stop) =>
          stop.stopType === 'destination'
      );

    const favouriteVias =
      stops.filter(
        (stop) =>
          stop.stopType === 'via'
      );

    applyJourneyTemplate({
      pickup,
      vias:
        favouriteVias,
      destination,
      passengerCount:
        favourite.passengerCount,
      budgetId:
        favourite.budgetId,
      reasonCodeId:
        favourite.reasonCodeId,
      driverNotes:
        favourite.driverNotes
    });
  }


  function applyRecentBooking(booking) {
    const stops =
      Array.isArray(booking.stops)
        ? booking.stops
        : [];

    const pickup =
      stops.find(
        (stop) =>
          stop.stopType === 'pickup'
      ) || {
        address:
          booking.pickupAddress,
        postcode:
          booking.pickupPostcode
      };

    const destination =
      stops.find(
        (stop) =>
          stop.stopType === 'destination'
      ) || {
        address:
          booking.destinationAddress,
        postcode:
          booking.destinationPostcode
      };

    const bookingVias =
      stops.filter(
        (stop) =>
          stop.stopType === 'via'
      );

    applyJourneyTemplate({
      pickup,
      vias:
        bookingVias,
      destination,
      passengerCount:
        booking.passengerCount,
      budgetId:
        booking.budgetId,
      reasonCodeId:
        booking.reasonCodeId,
      driverNotes:
        booking.driverNotes,
      passengerName:
        booking.passengerName,
      passengerMobile:
        booking.passengerMobile
    });
  }


  async function saveCurrentFavourite() {
    const defaultName =
      [
        form.pickupLocationName ||
          form.pickupAddress,
        form.destinationLocationName ||
          form.destinationAddress
      ]
        .filter(Boolean)
        .join(' → ')
        .slice(0, 80);

    const name =
      window.prompt(
        'Name this favourite journey',
        defaultName
      );

    if (!name) {
      return;
    }

    setSavingFavourite(true);
    setError('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/booking-favourites`,
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json'
            },

            body:
              JSON.stringify({
                name,

                passengerCount:
                  Number(
                    form.passengerCount || 1
                  ),

                budgetId:
                  form.budgetId || null,

                reasonCodeId:
                  form.reasonCodeId || null,

                driverNotes:
                  form.driverNotes,

                pickup: {
                  address:
                    form.pickupAddress,
                  postcode:
                    form.pickupPostcode,
                  latitude:
                    form.pickupLatitude,
                  longitude:
                    form.pickupLongitude,
                  savedLocationId:
                    form.pickupSavedLocationId,
                  locationName:
                    form.pickupLocationName,
                  pickupInstructions:
                    form.pickupPickupInstructions
                },

                vias:
                  vias
                    .filter(
                      (via) =>
                        via.address.trim()
                    )
                    .map(
                      (via) => ({
                        address:
                          via.address,
                        postcode:
                          via.postcode,
                        latitude:
                          via.latitude,
                        longitude:
                          via.longitude,
                        savedLocationId:
                          via.savedLocationId,
                        locationName:
                          via.locationName,
                        pickupInstructions:
                          via.pickupInstructions
                      })
                    ),

                destination: {
                  address:
                    form.destinationAddress,
                  postcode:
                    form.destinationPostcode,
                  latitude:
                    form.destinationLatitude,
                  longitude:
                    form.destinationLongitude,
                  savedLocationId:
                    form.destinationSavedLocationId,
                  locationName:
                    form.destinationLocationName,
                  pickupInstructions:
                    form.destinationPickupInstructions
                }
              })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to save favourite'
        );
      }

      setBookingFavourites(
        (current) => [
          data.favourite,
          ...current.filter(
            (item) =>
              item.id !==
              data.favourite.id
          )
        ]
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save favourite'
      );
    } finally {
      setSavingFavourite(false);
    }
  }


  async function removeFavourite(
    favourite
  ) {
    if (
      !window.confirm(
        `Remove "${favourite.name}" from your favourites?`
      )
    ) {
      return;
    }

    setError('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/booking-favourites/${favourite.id}`,
          {
            method:
              'DELETE'
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to remove favourite'
        );
      }

      setBookingFavourites(
        (current) =>
          current.filter(
            (item) =>
              item.id !== favourite.id
          )
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to remove favourite'
      );
    }
  }


  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function addVia() {
    setVias((current) => [
      ...current,
      {
        address: '',
        postcode: '',
        latitude: null,
        longitude: null,
        savedLocationId: null,
        locationName: null,
        pickupInstructions: null
      }
    ]);
  }

  function updateVia(index, field, value) {
    setVias((current) =>
      current.map((via, viaIndex) =>
        viaIndex === index
          ? {
              ...via,
              [field]: value
            }
          : via
      )
    );
  }

  function removeVia(index) {
    setVias((current) =>
      current.filter((_, viaIndex) => viaIndex !== index)
    );
  }

  function resetBooking() {
    setForm(
      createInitialBookingForm()
    );

    setVias([]);
    setConfirmation(null);
    setPendingBookingId(null);
    setPendingBookingReference('');
    setError('');
  }

  const bookingHasEnteredData =
    Boolean(
      form.pickupAddress?.trim() ||
      form.destinationAddress?.trim() ||
      form.passengerName?.trim() ||
      form.passengerMobile?.trim() ||
      form.budgetId ||
      form.reasonCodeId ||
      form.driverNotes?.trim() ||
      vias.some(
        (via) =>
          via.address?.trim()
      )
    );


  function startAgain() {
    if (
      bookingHasEnteredData &&
      !window.confirm(
        'Clear the current transport request and start again?'
      )
    ) {
      return;
    }

    resetBooking();
    setError('');
  }


  async function submitBooking(event) {
    event.preventDefault();

    setSaving(true);
    setError('');
    setConfirmation(null);

    try {
      if (!form.pickupDate || !form.pickupTime) {
        throw new Error(
          'Pickup date and time are required'
        );
      }

      let bookingId =
        pendingBookingId;

      if (!bookingId) {
        const response = await apiFetch(
          `${API_BASE}/api/bookings`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              requestedPickupAt:
                `${form.pickupDate}T${form.pickupTime}:00`,

              passengerName: form.passengerName,
              passengerMobile: form.passengerMobile,
              passengerCount: Number(form.passengerCount),

              pickup: {
                address:
                  form.pickupAddress,
                postcode:
                  form.pickupPostcode,
                latitude:
                  form.pickupLatitude,
                longitude:
                  form.pickupLongitude,
                savedLocationId:
                  form.pickupSavedLocationId,
                locationName:
                  form.pickupLocationName,
                pickupInstructions:
                  form.pickupPickupInstructions
              },

              vias: vias
                .filter(
                  (via) =>
                    via.address.trim()
                )
                .map((via) => ({
                  address:
                    via.address,
                  postcode:
                    via.postcode,
                  latitude:
                    via.latitude,
                  longitude:
                    via.longitude,
                  savedLocationId:
                    via.savedLocationId,
                  locationName:
                    via.locationName,
                  pickupInstructions:
                    via.pickupInstructions
                })),

              destination: {
                address:
                  form.destinationAddress,
                postcode:
                  form.destinationPostcode,
                latitude:
                  form.destinationLatitude,
                longitude:
                  form.destinationLongitude,
                savedLocationId:
                  form.destinationSavedLocationId,
                locationName:
                  form.destinationLocationName,
                pickupInstructions:
                  form.destinationPickupInstructions
              },

              driverNotes: form.driverNotes,

              budgetId: Number(form.budgetId),
              reasonCodeId: Number(form.reasonCodeId),
              createdByUserId: bookingUserId
            })
          }
        );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ||
            'Unable to create booking'
          );
        }

        bookingId =
          result.booking.id;

        setPendingBookingId(
          bookingId
        );

        setPendingBookingReference(
          result.booking.publicReference ||
          `Booking ${bookingId}`
        );
      }

      const submitResponse = await apiFetch(
        `${API_BASE}/api/bookings/${bookingId}/submit`,
        {
          method: 'POST'
        }
      );

      const submitResult =
        await submitResponse.json();

      if (!submitResponse.ok) {
        throw new Error(
          submitResult.error ||
          'Unable to submit booking to dispatch'
        );
      }

      setConfirmation(
        submitResult.booking
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to create booking'
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card state-panel">
        Loading booking options...
      </div>
    );
  }

  if (confirmation) {
    return (
      <div className="booking-confirmation">
        <div className="confirmation-icon">
          <CheckCircle2 size={34}/>
        </div>

        <h1>Transport booked</h1>

        <p className="confirmation-lead">
          The UHP transport booking has been sent to dispatch successfully.
        </p>

        <div className="confirmation-reference">
          <small>Autocab Booking</small>
          <strong>
            {confirmation.autocabBookingId || 'Pending'}
          </strong>

          <small>
            {portalBookingReference(confirmation)}
          </small>
        </div>

        <div className="confirmation-grid">
          <div>
            <small>Passenger</small>
            <strong>{confirmation.passengerName}</strong>
          </div>

          <div>
            <small>Pickup</small>
            <strong>
              {confirmation.requestedPickupAt
                .replace('T', ' ')
                .slice(0, 16)}
            </strong>
          </div>

          <div>
            <small>Budget</small>
            <strong>
              {confirmation.budgetNumber}
            </strong>
          </div>

          <div>
            <small>Budget Holder</small>
            <strong>
              {confirmation.budgetHolder}
            </strong>
          </div>

          <div>
            <small>Reason</small>
            <strong>
              {confirmation.reasonCode} · {confirmation.reasonDescription}
            </strong>
          </div>

          <div>
            <small>Status</small>
            <strong>
              {formatStatus(
                confirmation.operationalStatus
              )}
            </strong>
          </div>
        </div>

        <div className="confirmation-note">
          This booking has been sent to Autocab dispatch and linked to the UHP Transport Portal.
        </div>

        <button
          className="primary"
          onClick={resetBooking}
        >
          <Plus size={18}/>
          Book Another Journey
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="page-heading booking-heading">
        <div>
          <h1>Book UHP Transport</h1>

          <p>
            For authorised UHP-funded transport only.
          </p>
        </div>

        {bookingUser && (
          <div className="booking-user-chip">
            <small>Booking as</small>
            <strong>
              {bookingUser.firstName} {bookingUser.lastName}
            </strong>
          </div>
        )}
      </div>

      {error && (
        <div className="notice error">
          {error}
        </div>
      )}

      {budgets.length === 0 && (
        <div className="notice error">
          This user does not currently have any fully configured
          budgets available for transport bookings.
        </div>
      )}

      <section className="card booking-quick-book">
        <div className="booking-quick-book-heading">
          <div>
            <span className="booking-quick-book-eyebrow">
              Quick Book
            </span>

            <h2>
              Frequent journeys
            </h2>

            <p>
              Reuse a favourite or recent journey without entering everything again.
            </p>
          </div>

          <span className="booking-quick-book-user">
            Personal to {bookingUser?.firstName || 'you'}
          </span>
        </div>

        <div className="booking-quick-book-content">
          <div className="booking-quick-book-group">
            <div className="booking-quick-book-group-heading">
              <strong>
                Favourites
              </strong>

              <button
                type="button"
                className="booking-save-favourite"
                disabled={
                  savingFavourite ||
                  !form.pickupAddress.trim() ||
                  !form.destinationAddress.trim()
                }
                onClick={
                  saveCurrentFavourite
                }
              >
                {savingFavourite
                  ? 'Saving...'
                  : '+ Save current'}
              </button>
            </div>

            <div className="booking-quick-book-list">
              {quickBookLoading ? (
                <span className="booking-quick-empty">
                  Loading...
                </span>
              ) : bookingFavourites.length === 0 ? (
                <span className="booking-quick-empty">
                  No favourites yet
                </span>
              ) : (
                bookingFavourites
                  .slice(0, 5)
                  .map(
                    (favourite) => (
                      <div
                        key={favourite.id}
                        className="booking-quick-item-wrap"
                      >
                        <button
                          type="button"
                          className="booking-quick-item"
                          onClick={() =>
                            applyFavourite(
                              favourite
                            )
                          }
                        >
                          <strong>
                            {favourite.name}
                          </strong>
                        </button>

                        <button
                          type="button"
                          className="booking-quick-remove"
                          aria-label={`Remove ${favourite.name}`}
                          onClick={() =>
                            removeFavourite(
                              favourite
                            )
                          }
                        >
                          ×
                        </button>
                      </div>
                    )
                  )
              )}
            </div>
          </div>

          <div className="booking-quick-book-group">
            <div className="booking-quick-book-group-heading">
              <strong>
                Recent
              </strong>

              <span>
                Rebook
              </span>
            </div>

            <div className="booking-quick-book-list">
              {quickBookLoading ? (
                <span className="booking-quick-empty">
                  Loading...
                </span>
              ) : recentBookings.length === 0 ? (
                <span className="booking-quick-empty">
                  No recent journeys
                </span>
              ) : (
                recentBookings
                  .slice(0, 5)
                  .map(
                    (booking) => (
                      <button
                        key={booking.id}
                        type="button"
                        className="booking-quick-item"
                        onClick={() =>
                          applyRecentBooking(
                            booking
                          )
                        }
                      >
                        <strong>
                          {booking.pickupAddress}
                        </strong>

                        <span>
                          →
                          {' '}
                          {booking.destinationAddress}
                        </span>
                      </button>
                    )
                  )
              )}
            </div>
          </div>
        </div>
      </section>

      <form
        className="booking-layout booking-layout-modern"
        onSubmit={submitBooking}
      >
        <div className="booking-main">
          <section className="card booking-section">
            <div className="section-heading">
              <span className="section-number">1</span>

              <div>
                <h2>Date &amp; Time</h2>
                <p>
                  When should the passenger be collected?
                </p>
              </div>
            </div>

            <div className="booking-time-layout">
              <div className="form-grid two">
              <label>
                Pickup Date
                <input
                  type="date"
                  required
                  value={form.pickupDate}
                  onChange={(e) =>
                    updateForm(
                      'pickupDate',
                      e.target.value
                    )
                  }
                />
              </label>

              <label>
                Pickup Time
                <input
                  type="time"
                  required
                  value={form.pickupTime}
                  onChange={(e) =>
                    updateForm(
                      'pickupTime',
                      e.target.value
                    )
                  }
                />
              </label>
              </div>

              <div
                className={`booking-eta-preview pickup-eta-preview ${pickupEtaTone}`}
              >
                <small>
                  Nearest clear car
                </small>

                <strong>
                  {pickupEta.status === 'loading'
                    ? 'Checking...'
                    : pickupEta.status === 'success'
                      ? `${pickupEtaMinutes} min`
                      : pickupEta.status === 'unavailable' ||
                          pickupEta.status === 'error'
                        ? 'Estimate unavailable'
                        : 'Select pickup'}
                </strong>

                <span>
                  {pickupEta.status === 'success'
                    ? `${pickupEta.nearbyCount} clear ${
                        pickupEta.nearbyCount === 1
                          ? 'car'
                          : 'cars'
                      } nearby`
                    : pickupEta.status === 'loading'
                      ? 'Finding the nearest clear car.'
                      : pickupEta.status === 'unavailable'
                        ? pickupEta.nearbyCount > 0
                          ? `${pickupEta.nearbyCount} clear ${
                              pickupEta.nearbyCount === 1
                                ? 'car'
                                : 'cars'
                            } nearby · ETA unavailable`
                          : 'No fresh clear cars nearby.'
                        : pickupEta.status === 'error'
                          ? 'Live pickup estimate temporarily unavailable.'
                          : 'Choose a pickup location to calculate.'}
                </span>
              </div>

              <div className="booking-eta-preview journey-eta-preview">
                <small>Journey estimate</small>

                <strong>
                  {journeyEta.status === 'loading'
                    ? 'Calculating...'
                    : journeyEta.status === 'success'
                      ? `${journeyEtaMinutes} min`
                      : journeyEta.status === 'error'
                        ? 'Estimate unavailable'
                        : 'Select route locations'}
                </strong>

                <span>
                  {journeyEta.status === 'success'
                    ? (
                        journeyEtaDistance ||
                        'Live Autocab route estimate'
                      )
                    : journeyEta.status === 'loading'
                      ? 'Checking the live route with Autocab.'
                      : journeyEta.status === 'error'
                        ? 'You can still create the transport request.'
                        : 'Choose pickup and destination to calculate.'}
                </span>
              </div>
            </div>
          </section>

          <section className="card booking-section">
            <div className="section-heading">
              <span className="section-number">2</span>

              <div>
                <h2>Journey</h2>
                <p>
                  Enter the pickup, any stops, and destination.
                </p>
              </div>
            </div>

            <div className="journey-stop pickup-stop">
              <div className="stop-marker">
                <span/>
              </div>

              <div className="stop-fields">
                <label>
                  Pickup

                  <SavedLocationChips
                    locations={
                      savedLocations
                    }
                    onSelect={(location) =>
                      setForm(
                        (current) => ({
                          ...current,
                          pickupAddress:
                            location.address,
                          pickupPostcode:
                            location.postcode ||
                            '',
                          pickupLatitude:
                            location.latitude,
                          pickupLongitude:
                            location.longitude,
                          pickupSavedLocationId:
                            location.id,
                          pickupLocationName:
                            location.name,
                          pickupPickupInstructions:
                            location.pickupInstructions ||
                            null
                        })
                      )
                    }
                  />

                  <BookingAddressAutocomplete
                    savedLocations={
                      savedLocations
                    }
                    required
                    searchEnabled={
                      form.pickupLatitude === null ||
                      form.pickupLongitude === null
                    }
                    placeholder="Start typing pickup address"
                    value={
                      form.pickupAddress
                    }
                    onChange={(value) =>
                      setForm(
                        (current) => ({
                          ...current,
                          pickupAddress:
                            value,
                          pickupPostcode:
                            current.pickupLatitude !== null &&
                            current.pickupLongitude !== null
                              ? ''
                              : current.pickupPostcode,
                          pickupLatitude:
                            null,
                          pickupLongitude:
                            null,
                          pickupSavedLocationId:
                            null,
                          pickupLocationName:
                            null,
                          pickupPickupInstructions:
                            null
                        })
                      )
                    }
                    onSelect={(result) =>
                      setForm(
                        (current) => ({
                          ...current,
                          pickupAddress:
                            result.address,
                          pickupPostcode:
                            result.postcode ||
                            current.pickupPostcode,
                          pickupLatitude:
                            result.latitude,
                          pickupLongitude:
                            result.longitude,
                          pickupSavedLocationId:
                            result.savedLocationId ||
                            null,
                          pickupLocationName:
                            result.locationName ||
                            null,
                          pickupPickupInstructions:
                            result.pickupInstructions ||
                            null
                        })
                      )
                    }
                  />
                </label>

                <label className="postcode-field">
                  Postcode

                  <input
                    placeholder="Optional"
                    value={
                      form.pickupPostcode
                    }
                    onChange={(event) =>
                      setForm(
                        (current) => ({
                          ...current,
                          pickupPostcode:
                            event.target.value
                              .toUpperCase(),
                          pickupLatitude:
                            null,
                          pickupLongitude:
                            null,
                          pickupSavedLocationId:
                            null,
                          pickupLocationName:
                            null,
                          pickupPickupInstructions:
                            null
                        })
                      )
                    }
                  />
                </label>
              </div>
            </div>

            {vias.map(
              (via, index) => (
                <div
                  className="journey-stop via-stop"
                  key={index}
                >
                  <div className="stop-marker">
                    <span/>
                  </div>

                  <div className="stop-fields">
                    <label>
                      Via {index + 1}

                      <SavedLocationChips
                        locations={
                          savedLocations
                        }
                        onSelect={(location) =>
                          setVias(
                            (current) =>
                              current.map(
                                (
                                  currentVia,
                                  viaIndex
                                ) =>
                                  viaIndex === index
                                    ? {
                                        ...currentVia,
                                        address:
                                          location.address,
                                        postcode:
                                          location.postcode ||
                                          '',
                                        latitude:
                                          location.latitude,
                                        longitude:
                                          location.longitude,
                                        savedLocationId:
                                          location.id,
                                        locationName:
                                          location.name,
                                        pickupInstructions:
                                          location.pickupInstructions ||
                                          null
                                      }
                                    : currentVia
                              )
                          )
                        }
                      />

                      <BookingAddressAutocomplete
                        savedLocations={
                          savedLocations
                        }
                        searchEnabled={
                          via.latitude === null ||
                          via.longitude === null
                        }
                        placeholder="Start typing via address"
                        value={
                          via.address
                        }
                        onChange={(value) =>
                          setVias(
                            (current) =>
                              current.map(
                                (
                                  currentVia,
                                  viaIndex
                                ) =>
                                  viaIndex === index
                                    ? {
                                        ...currentVia,
                                        address:
                                          value,
                                        postcode:
                                          currentVia.latitude !== null &&
                                          currentVia.longitude !== null
                                            ? ''
                                            : currentVia.postcode,
                                        latitude:
                                          null,
                                        longitude:
                                          null,
                                        savedLocationId:
                                          null,
                                        locationName:
                                          null,
                                        pickupInstructions:
                                          null
                                      }
                                    : currentVia
                              )
                          )
                        }
                        onSelect={(result) =>
                          setVias(
                            (current) =>
                              current.map(
                                (
                                  currentVia,
                                  viaIndex
                                ) =>
                                  viaIndex === index
                                    ? {
                                        ...currentVia,
                                        address:
                                          result.address,
                                        postcode:
                                          result.postcode ||
                                          currentVia.postcode,
                                        latitude:
                                          result.latitude,
                                        longitude:
                                          result.longitude,
                                        savedLocationId:
                                          result.savedLocationId ||
                                          null,
                                        locationName:
                                          result.locationName ||
                                          null,
                                        pickupInstructions:
                                          result.pickupInstructions ||
                                          null
                                      }
                                    : currentVia
                              )
                          )
                        }
                      />
                    </label>

                    <label className="postcode-field">
                      Postcode

                      <input
                        placeholder="Optional"
                        value={
                          via.postcode
                        }
                        onChange={(event) =>
                          setVias(
                            (current) =>
                              current.map(
                                (
                                  currentVia,
                                  viaIndex
                                ) =>
                                  viaIndex === index
                                    ? {
                                        ...currentVia,
                                        postcode:
                                          event.target.value
                                            .toUpperCase(),
                                        latitude:
                                          null,
                                        longitude:
                                          null,
                                        savedLocationId:
                                          null,
                                        locationName:
                                          null,
                                        pickupInstructions:
                                          null
                                      }
                                    : currentVia
                              )
                          )
                        }
                      />
                    </label>

                    <button
                      type="button"
                      className="remove-stop"
                      onClick={() =>
                        removeVia(
                          index
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )
            )}

            <button
              type="button"
              className="add-via"
              onClick={
                addVia
              }
            >
              <Plus size={16}/>
              Add Via
            </button>

            <div className="journey-stop destination-stop">
              <div className="stop-marker">
                <span/>
              </div>

              <div className="stop-fields">
                <label>
                  Destination

                  <SavedLocationChips
                    locations={
                      savedLocations
                    }
                    onSelect={(location) =>
                      setForm(
                        (current) => ({
                          ...current,
                          destinationAddress:
                            location.address,
                          destinationPostcode:
                            location.postcode ||
                            '',
                          destinationLatitude:
                            location.latitude,
                          destinationLongitude:
                            location.longitude,
                          destinationSavedLocationId:
                            location.id,
                          destinationLocationName:
                            location.name,
                          destinationPickupInstructions:
                            location.pickupInstructions ||
                            null
                        })
                      )
                    }
                  />

                  <BookingAddressAutocomplete
                    savedLocations={
                      savedLocations
                    }
                    required
                    searchEnabled={
                      form.destinationLatitude === null ||
                      form.destinationLongitude === null
                    }
                    placeholder="Start typing destination address"
                    value={
                      form.destinationAddress
                    }
                    onChange={(value) =>
                      setForm(
                        (current) => ({
                          ...current,
                          destinationAddress:
                            value,
                          destinationPostcode:
                            current.destinationLatitude !== null &&
                            current.destinationLongitude !== null
                              ? ''
                              : current.destinationPostcode,
                          destinationLatitude:
                            null,
                          destinationLongitude:
                            null,
                          destinationSavedLocationId:
                            null,
                          destinationLocationName:
                            null,
                          destinationPickupInstructions:
                            null
                        })
                      )
                    }
                    onSelect={(result) =>
                      setForm(
                        (current) => ({
                          ...current,
                          destinationAddress:
                            result.address,
                          destinationPostcode:
                            result.postcode ||
                            current.destinationPostcode,
                          destinationLatitude:
                            result.latitude,
                          destinationLongitude:
                            result.longitude,
                          destinationSavedLocationId:
                            result.savedLocationId ||
                            null,
                          destinationLocationName:
                            result.locationName ||
                            null,
                          destinationPickupInstructions:
                            result.pickupInstructions ||
                            null
                        })
                      )
                    }
                  />
                </label>

                <label className="postcode-field">
                  Postcode

                  <input
                    placeholder="Optional"
                    value={
                      form.destinationPostcode
                    }
                    onChange={(event) =>
                      setForm(
                        (current) => ({
                          ...current,
                          destinationPostcode:
                            event.target.value
                              .toUpperCase(),
                          destinationLatitude:
                            null,
                          destinationLongitude:
                            null,
                          destinationSavedLocationId:
                            null,
                          destinationLocationName:
                            null,
                          destinationPickupInstructions:
                            null
                        })
                      )
                    }
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="card booking-section">
            <div className="section-heading">
              <span className="section-number">3</span>

              <div>
                <h2>Passenger</h2>
                <p>
                  Who is travelling?
                </p>
              </div>
            </div>

            <div className="form-grid two">
              <label>
                Passenger Name
                <input
                  required
                  value={form.passengerName}
                  onChange={(e) =>
                    updateForm(
                      'passengerName',
                      e.target.value
                    )
                  }
                />
              </label>

              <label>
                Contact Number
                <input
                  type="tel"
                  required
                  value={form.passengerMobile}
                  onChange={(e) =>
                    updateForm(
                      'passengerMobile',
                      e.target.value
                    )
                  }
                />
              </label>
            </div>

            <label className="short-field">
              Number of Passengers
              <input
                type="number"
                min="1"
                required
                value={form.passengerCount}
                onChange={(e) =>
                  updateForm(
                    'passengerCount',
                    e.target.value
                  )
                }
              />
            </label>
          </section>

          <section className="card booking-section">
            <div className="section-heading">
              <span className="section-number">4</span>

              <div>
                <h2>UHP Authorisation</h2>
                <p>
                  Select the approved reason and budget.
                </p>
              </div>
            </div>

            <div className="form-grid two">
              <label>
                Reason Code
                <select
                  required
                  value={form.reasonCodeId}
                  onChange={(e) =>
                    updateForm(
                      'reasonCodeId',
                      e.target.value
                    )
                  }
                >
                  <option value="">
                    Select reason...
                  </option>

                  {reasonCodes.map((reason) => (
                    <option
                      key={reason.id}
                      value={reason.id}
                    >
                      {reason.code} — {reason.description}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Budget Number
                <select
                  required
                  value={form.budgetId}
                  onChange={(e) =>
                    updateForm(
                      'budgetId',
                      e.target.value
                    )
                  }
                >
                  <option value="">
                    Select budget...
                  </option>

                  {budgets.map((budget) => (
                    <option
                      key={budget.id}
                      value={budget.id}
                    >
                      {budget.budgetNumber} — {budget.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedBudget && (
              <div className="budget-holder-panel">
                <div>
                  <small>Budget Holder</small>
                  <strong>
                    {selectedBudget.budgetHolder}
                  </strong>
                </div>

                <div>
                  <small>Department</small>
                  <strong>
                    {selectedBudget.department || '—'}
                  </strong>
                </div>
              </div>
            )}
          </section>

          <section className="card booking-section">
            <div className="section-heading">
              <span className="section-number">5</span>

              <div>
                <h2>Driver Notes</h2>
                <p>
                  Optional information the driver may need.
                </p>
              </div>
            </div>

            <label>
              Notes
              <textarea
                rows="4"
                placeholder="For example: collection point, ward entrance or passenger assistance information."
                value={form.driverNotes}
                onChange={(e) =>
                  updateForm(
                    'driverNotes',
                    e.target.value
                  )
                }
              />
            </label>
          </section>
        </div>

        <aside className="booking-summary">
          <BookingPlanningMap
            pickup={{
              address:
                form.pickupAddress,
              latitude:
                form.pickupLatitude,
              longitude:
                form.pickupLongitude
            }}
            vias={
              vias
            }
            destination={{
              address:
                form.destinationAddress,
              latitude:
                form.destinationLatitude,
              longitude:
                form.destinationLongitude
            }}
          />

          <div className="card summary-card">
            <h3>UHP Account Booking</h3>

            <div className="account-only-chip">
              UHP Funded
            </div>

            <p>
              All journeys booked here require an approved UHP
              budget and reason code.
            </p>

            <div className="summary-rule"/>

            <div className="summary-item">
              <small>Budget</small>

              <strong>
                {selectedBudget
                  ? selectedBudget.budgetNumber
                  : 'Not selected'}
              </strong>
            </div>

            <div className="summary-item">
              <small>Budget Holder</small>

              <strong>
                {selectedBudget
                  ? selectedBudget.budgetHolder
                  : '—'}
              </strong>
            </div>

            <div className="summary-rule"/>

            <div className="no-fare-note">
              No fare is shown at the point of booking.
              Completed journey costs will be posted through the
              UHP account process.
            </div>

            {error && pendingBookingId && (
              <div className="notice error">
                <strong>
                  Dispatch confirmation needs review.
                </strong>

                <div>
                  This transport request has already been recorded
                  in the UHP Transport Portal
                  {pendingBookingReference
                    ? ` as ${pendingBookingReference}`
                    : ''}.
                  {' '}Do not create another request for the same journey.
                </div>

                <div>
                  {error}
                </div>
              </div>
            )}

            <div className="booking-submit-actions">
              <button
                type="button"
                className="booking-start-again"
                disabled={
                  saving ||
                  Boolean(pendingBookingId) ||
                  !bookingHasEnteredData
                }
                onClick={startAgain}
              >
                Start Again
              </button>

              <button
                type="submit"
                className="primary booking-submit"
                disabled={
                  saving ||
                  budgets.length === 0 ||
                  Boolean(pendingBookingId)
                }
              >
                {saving
                  ? 'Creating Request...'
                  : pendingBookingId
                    ? 'Dispatch Review Required'
                    : 'Create Transport Request'}
              </button>
            </div>
          </div>
        </aside>
      </form>
    </>
  );
}

function BudgetsPage() {
  const [budgets, setBudgets] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState(null);

  const emptyForm = {
    budgetNumber: '',
    name: '',
    departmentId: '',
    holderUserId: '',
    deputyUserId: ''
  };

  const [form, setForm] = useState(emptyForm);

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const [
        budgetsResponse,
        departmentsResponse,
        usersResponse
      ] = await Promise.all([
        apiFetch(`${API_BASE}/api/budgets`),
        apiFetch(`${API_BASE}/api/departments`),
        apiFetch(`${API_BASE}/api/users`)
      ]);

      if (
        !budgetsResponse.ok ||
        !departmentsResponse.ok ||
        !usersResponse.ok
      ) {
        throw new Error('Unable to load budget administration data');
      }

      const budgetData = await budgetsResponse.json();
      const departmentData = await departmentsResponse.json();
      const userData = await usersResponse.json();

      setBudgets(budgetData.budgets ?? []);
      setDepartments(departmentData.departments ?? []);
      setUsers(userData.users ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load budgets'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredBudgets = useMemo(() => {
    const term = query.trim().toLowerCase();

    if (!term) return budgets;

    return budgets.filter((budget) =>
      [
        budget.budgetNumber,
        budget.name,
        budget.department,
        budget.budgetHolder,
        budget.deputyHolder,
        budget.status
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [budgets, query]);

  const stats = useMemo(() => ({
    active: budgets.filter((b) => b.status === 'active').length,
    inactive: budgets.filter((b) => b.status === 'inactive').length,
    missingHolder: budgets.filter(
      (b) => b.status === 'active' && !b.holderUserId
    ).length
  }), [budgets]);

  const eligibleUsers = users.filter(
    (user) =>
      user.status === 'active' ||
      user.status === 'invited'
  );

  function openCreate() {
    setEditingBudget(null);
    setForm(emptyForm);
    setError('');
    setNotice('');
    setShowModal(true);
  }

  function openEdit(budget) {
    setEditingBudget(budget);

    setForm({
      budgetNumber: budget.budgetNumber,
      name: budget.name,
      departmentId: String(budget.departmentId ?? ''),
      holderUserId: String(budget.holderUserId ?? ''),
      deputyUserId: String(budget.deputyUserId ?? '')
    });

    setError('');
    setNotice('');
    setShowModal(true);
  }

  async function submitBudget(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');

    try {
      const isEditing = Boolean(editingBudget);

      const url = isEditing
        ? `${API_BASE}/api/budgets/${editingBudget.id}`
        : `${API_BASE}/api/budgets`;

      const payload = {
        budgetNumber: form.budgetNumber,
        name: form.name,
        departmentId: Number(form.departmentId),
        holderUserId: form.holderUserId
          ? Number(form.holderUserId)
          : null,
        deputyUserId: form.deputyUserId
          ? Number(form.deputyUserId)
          : null
      };

      const response = await apiFetch(url, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
          `Unable to ${isEditing ? 'update' : 'create'} budget`
        );
      }

      setShowModal(false);
      setEditingBudget(null);
      setForm(emptyForm);

      setNotice(
        isEditing
          ? 'Budget updated successfully.'
          : 'Budget created successfully.'
      );

      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save budget'
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(budget) {
    const nextStatus =
      budget.status === 'active'
        ? 'inactive'
        : 'active';

    const verb =
      nextStatus === 'inactive'
        ? 'deactivate'
        : 'reactivate';

    if (
      !window.confirm(
        `Are you sure you want to ${verb} budget ${budget.budgetNumber}?`
      )
    ) {
      return;
    }

    setError('');
    setNotice('');

    try {
      const response = await apiFetch(
        `${API_BASE}/api/budgets/${budget.id}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status: nextStatus
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
          'Unable to update budget status'
        );
      }

      setNotice(
        `Budget ${budget.budgetNumber} is now ${nextStatus}.`
      );

      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to update budget'
      );
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Budgets</h1>
          <p>
            Manage the UHP budgets authorised to fund transport bookings.
          </p>
        </div>

        <button
          className="primary"
          onClick={openCreate}
        >
          <Plus size={18}/>
          Add Budget
        </button>
      </div>

      {notice && (
        <div className="notice success">
          {notice}
        </div>
      )}

      {error && !loading && (
        <div className="notice error">
          {error}
        </div>
      )}

      <div className="stats-grid">
        <Stat
          icon={<WalletCards/>}
          label="Active Budgets"
          value={stats.active}
        />

        <Stat
          icon={<Clock3/>}
          label="Inactive"
          value={stats.inactive}
        />

        <Stat
          icon={<AlertTriangle/>}
          label="Needs Budget Holder"
          value={stats.missingHolder}
        />
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search compact">
            <Search size={17}/>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search budgets..."
            />
          </div>
        </div>

        {loading ? (
          <div className="state-panel">
            Loading budgets...
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Budget</th>
                  <th>Department</th>
                  <th>Primary Holder</th>
                  <th>Deputy</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredBudgets.map((budget) => (
                  <tr key={budget.id}>
                    <td>
                      <strong>{budget.budgetNumber}</strong>
                      <small>{budget.name}</small>
                    </td>

                    <td>{budget.department || '—'}</td>

                    <td>
                      {budget.budgetHolder || (
                        <span className="attention-text">
                          Needs holder
                        </span>
                      )}
                    </td>

                    <td>
                      {budget.deputyHolder || '—'}
                    </td>

                    <td>
                      <span className={`badge ${budget.status}`}>
                        {formatStatus(budget.status)}
                      </span>
                    </td>

                    <td>
                      <div className="row-actions">
                        <button
                          className="text-action"
                          onClick={() => openEdit(budget)}
                        >
                          Edit
                        </button>

                        <button
                          className={
                            budget.status === 'active'
                              ? 'text-action warning'
                              : 'text-action'
                          }
                          onClick={() => changeStatus(budget)}
                        >
                          {budget.status === 'active'
                            ? 'Deactivate'
                            : 'Reactivate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredBudgets.length === 0 && (
                  <tr>
                    <td colSpan="6">
                      <div className="empty-table">
                        No budgets match your search.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !saving
            ) {
              setShowModal(false);
            }
          }}
        >
          <form
            className="modal-card"
            onSubmit={submitBudget}
          >
            <div className="modal-header">
              <div>
                <h2>
                  {editingBudget
                    ? 'Edit Budget'
                    : 'Add Budget'}
                </h2>

                <p>
                  Configure the budget and the people responsible for it.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={() => setShowModal(false)}
                disabled={saving}
              >
                ×
              </button>
            </div>

            <div className="form-grid two">
              <label>
                Budget Number
                <input
                  required
                  disabled={Boolean(editingBudget)}
                  value={form.budgetNumber}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      budgetNumber: e.target.value
                    })
                  }
                />
              </label>

              <label>
                Department
                <select
                  required
                  value={form.departmentId}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      departmentId: e.target.value
                    })
                  }
                >
                  <option value="">
                    Select department...
                  </option>

                  {departments
                    .filter(
                      (department) =>
                        department.status === 'active'
                    )
                    .map((department) => (
                      <option
                        key={department.id}
                        value={department.id}
                      >
                        {department.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <label>
              Budget Name
              <input
                required
                value={form.name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    name: e.target.value
                  })
                }
              />
            </label>

            <div className="form-grid two">
              <label>
                Primary Budget Holder
                <select
                  value={form.holderUserId}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      holderUserId: e.target.value
                    })
                  }
                >
                  <option value="">
                    Not assigned
                  </option>

                  {eligibleUsers.map((user) => (
                    <option
                      key={user.id}
                      value={user.id}
                    >
                      {user.firstName} {user.lastName}
                      {user.department
                        ? ` — ${user.department}`
                        : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Deputy Budget Holder
                <select
                  value={form.deputyUserId}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      deputyUserId: e.target.value
                    })
                  }
                >
                  <option value="">
                    Not assigned
                  </option>

                  {eligibleUsers.map((user) => (
                    <option
                      key={user.id}
                      value={user.id}
                    >
                      {user.firstName} {user.lastName}
                      {user.department
                        ? ` — ${user.department}`
                        : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {form.holderUserId &&
              form.holderUserId === form.deputyUserId && (
                <div className="inline-warning">
                  Primary and deputy cannot be the same person.
                  The deputy assignment will be ignored.
                </div>
              )}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowModal(false)}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary"
                disabled={saving}
              >
                {saving
                  ? 'Saving...'
                  : editingBudget
                    ? 'Save Changes'
                    : 'Create Budget'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function LocationMapClickHandler({
  onSelect
}) {
  useMapEvents({
    click(event) {
      onSelect({
        latitude:
          event.latlng.lat,
        longitude:
          event.latlng.lng
      });
    }
  });

  return null;
}


function LocationMapRecenter({
  latitude,
  longitude
}) {
  const map = useMap();

  useEffect(() => {
    if (
      latitude === null ||
      latitude === undefined ||
      longitude === null ||
      longitude === undefined ||
      !Number.isFinite(
        Number(latitude)
      ) ||
      !Number.isFinite(
        Number(longitude)
      )
    ) {
      return;
    }

    map.setView(
      [
        Number(latitude),
        Number(longitude)
      ],
      Math.max(
        map.getZoom(),
        16
      ),
      {
        animate: true
      }
    );
  }, [
    map,
    latitude,
    longitude
  ]);

  return null;
}


function LocationEditorMap({
  latitude,
  longitude,
  onSelect
}) {
  const hasCoordinate = (value) =>
    value !== null &&
    value !== undefined &&
    !(
      typeof value === 'string' &&
      !value.trim()
    ) &&
    Number.isFinite(
      Number(value)
    );

  const hasPin =
    hasCoordinate(latitude) &&
    hasCoordinate(longitude);

  const defaultCentre = [
    50.41716618389792,
    -4.116519158583742
  ];

  const locationIcon =
    L.divIcon({
      className:
        'booking-map-div-icon location-editor-icon',

      html: `
        <span class="booking-map-pin-wrapper">
          <span class="booking-map-pin pickup">
            <span class="booking-map-pin-label">
              P
            </span>
          </span>
        </span>
      `,

      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -28]
    });

  return (
    <div className="location-editor-map-shell">
      <MapContainer
        className="location-editor-map"
        center={
          hasPin
            ? [
                Number(latitude),
                Number(longitude)
              ]
            : defaultCentre
        }
        zoom={
          hasPin
            ? 16
            : 14
        }
        scrollWheelZoom
      >
        {MAP_TILE_URL && (
          <TileLayer
            attribution={
              MAP_TILE_ATTRIBUTION
            }
            url={MAP_TILE_URL}
          />
        )}

        <LocationMapClickHandler
          onSelect={onSelect}
        />

        {hasPin && (
          <>
            <LocationMapRecenter
              latitude={latitude}
              longitude={longitude}
            />

            <Marker
              position={[
                Number(latitude),
                Number(longitude)
              ]}
              icon={locationIcon}
            >
              <Popup>
                Exact transport point
              </Popup>
            </Marker>
          </>
        )}
      </MapContainer>

      <div className="location-editor-map-help">
        <strong>
          Click the map to set the exact transport point.
        </strong>

        <span>
          Use the entrance or roadside position where the taxi should
          actually collect or drop off — not simply the centre of the
          postcode.
        </span>
      </div>
    </div>
  );
}


function LocationsPage() {
  const emptyForm = {
    name: '',
    parentSite: '',
    address: '',
    postcode: '',
    latitude: null,
    longitude: null,
    category: 'hospital',
    pickupInstructions: '',
    driverInstructions: '',
    displayOrder: 0
  };

  const [
    locations,
    setLocations
  ] = useState([]);

  const [
    loading,
    setLoading
  ] = useState(true);

  const [
    saving,
    setSaving
  ] = useState(false);

  const [
    error,
    setError
  ] = useState('');

  const [
    notice,
    setNotice
  ] = useState('');

  const [
    query,
    setQuery
  ] = useState('');

  const [
    showModal,
    setShowModal
  ] = useState(false);

  const [
    editingLocation,
    setEditingLocation
  ] = useState(null);

  const [
    form,
    setForm
  ] = useState(emptyForm);

  async function loadLocations() {
    setLoading(true);
    setError('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/locations`
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Unable to load locations'
        );
      }

      setLocations(
        data.locations ?? []
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load locations'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLocations();
  }, []);

  const filteredLocations =
    useMemo(() => {
      const term =
        query
          .trim()
          .toLowerCase();

      if (!term) {
        return locations;
      }

      return locations.filter(
        (location) =>
          [
            location.name,
            location.parentSite,
            location.address,
            location.postcode,
            location.category,
            location.status
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(term)
      );
    }, [
      locations,
      query
    ]);

  const stats =
    useMemo(
      () => ({
        active:
          locations.filter(
            (location) =>
              location.status ===
              'active'
          ).length,

        inactive:
          locations.filter(
            (location) =>
              location.status ===
              'inactive'
          ).length,

        hospitals:
          locations.filter(
            (location) =>
              location.category ===
              'hospital'
          ).length
      }),
      [locations]
    );

  function openCreate() {
    setEditingLocation(null);
    setForm({
      ...emptyForm
    });

    setError('');
    setNotice('');
    setShowModal(true);
  }

  function openEdit(location) {
    setEditingLocation(location);

    setForm({
      name:
        location.name || '',

      parentSite:
        location.parentSite || '',

      address:
        location.address || '',

      postcode:
        location.postcode || '',

      latitude:
        location.latitude ?? null,

      longitude:
        location.longitude ?? null,

      category:
        location.category ||
        'hospital',

      pickupInstructions:
        location.pickupInstructions ||
        '',

      driverInstructions:
        location.driverInstructions ||
        '',

      displayOrder:
        location.displayOrder ?? 0
    });

    setError('');
    setNotice('');
    setShowModal(true);
  }

  function setMapPoint({
    latitude,
    longitude
  }) {
    setForm(
      (current) => ({
        ...current,
        latitude,
        longitude
      })
    );
  }

  async function submitLocation(
    event
  ) {
    event.preventDefault();

    setSaving(true);
    setError('');
    setNotice('');

    try {
      const isEditing =
        Boolean(
          editingLocation
        );

      const response =
        await apiFetch(
          isEditing
            ? `${API_BASE}/api/locations/${editingLocation.id}`
            : `${API_BASE}/api/locations`,
          {
            method:
              isEditing
                ? 'PATCH'
                : 'POST',

            headers: {
              'Content-Type':
                'application/json'
            },

            body:
              JSON.stringify({
                name:
                  form.name,

                parentSite:
                  form.parentSite,

                address:
                  form.address,

                postcode:
                  form.postcode,

                latitude:
                  form.latitude,

                longitude:
                  form.longitude,

                category:
                  form.category,

                pickupInstructions:
                  form.pickupInstructions,

                driverInstructions:
                  form.driverInstructions,

                displayOrder:
                  Number(
                    form.displayOrder
                  )
              })
          }
        );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
          `Unable to ${
            isEditing
              ? 'update'
              : 'create'
          } location`
        );
      }

      setShowModal(false);
      setEditingLocation(null);

      setNotice(
        isEditing
          ? 'Location updated successfully.'
          : 'Location created successfully.'
      );

      await loadLocations();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save location'
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(
    location
  ) {
    const nextStatus =
      location.status ===
        'active'
        ? 'inactive'
        : 'active';

    const verb =
      nextStatus === 'inactive'
        ? 'deactivate'
        : 'reactivate';

    if (
      !window.confirm(
        `Are you sure you want to ${verb} ${location.name}?`
      )
    ) {
      return;
    }

    setError('');
    setNotice('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/locations/${location.id}/status`,
          {
            method: 'PATCH',

            headers: {
              'Content-Type':
                'application/json'
            },

            body:
              JSON.stringify({
                status:
                  nextStatus
              })
          }
        );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
          'Unable to update location status'
        );
      }

      setNotice(
        `${location.name} is now ${nextStatus}.`
      );

      await loadLocations();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to update location'
      );
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            UHP Locations
          </h1>

          <p>
            Maintain exact hospital, clinic, entrance and transport
            pickup points used across UHP transport bookings.
          </p>
        </div>

        <button
          type="button"
          className="primary"
          onClick={openCreate}
        >
          <Plus size={18}/>
          Add Location
        </button>
      </div>

      {notice && (
        <div className="notice success">
          {notice}
        </div>
      )}

      {error &&
      !showModal &&
      !loading && (
        <div className="notice error">
          {error}
        </div>
      )}

      <div className="stats-grid location-stats-grid">
        <Stat
          icon={<MapPin/>}
          label="Active Locations"
          value={stats.active}
        />

        <Stat
          icon={<Clock3/>}
          label="Inactive"
          value={stats.inactive}
        />

        <Stat
          icon={<CarFront/>}
          label="Hospital Points"
          value={stats.hospitals}
        />
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search compact">
            <Search size={17}/>

            <input
              value={query}
              onChange={(event) =>
                setQuery(
                  event.target.value
                )
              }
              placeholder="Search locations, sites or postcodes..."
            />
          </div>
        </div>

        {loading ? (
          <div className="state-panel">
            Loading locations...
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Site / Address</th>
                  <th>Category</th>
                  <th>Pin</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredLocations.map(
                  (location) => (
                    <tr
                      key={
                        location.id
                      }
                    >
                      <td>
                        <strong>
                          {location.name}
                        </strong>
                      </td>

                      <td>
                        <div className="location-table-address">
                          {location.parentSite && (
                            <strong>
                              {location.parentSite}
                            </strong>
                          )}

                          <span>
                            {location.address}
                          </span>

                          {location.postcode && (
                            <small>
                              {location.postcode}
                            </small>
                          )}
                        </div>
                      </td>

                      <td>
                        {formatStatus(
                          location.category
                        )}
                      </td>

                      <td>
                        <span className="location-pin-status">
                          <MapPin size={14}/>
                          Exact
                        </span>
                      </td>

                      <td>
                        <span
                          className={`badge ${location.status}`}
                        >
                          {formatStatus(
                            location.status
                          )}
                        </span>
                      </td>

                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="text-action"
                            onClick={() =>
                              openEdit(
                                location
                              )
                            }
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className={
                              location.status ===
                                'active'
                                ? 'text-action warning'
                                : 'text-action'
                            }
                            onClick={() =>
                              changeStatus(
                                location
                              )
                            }
                          >
                            {location.status ===
                              'active'
                              ? 'Deactivate'
                              : 'Reactivate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}

                {filteredLocations.length ===
                  0 && (
                  <tr>
                    <td colSpan="6">
                      <div className="empty-table">
                        No locations match your search.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target ===
                event.currentTarget &&
              !saving
            ) {
              setShowModal(false);
            }
          }}
        >
          <form
            className="modal-card location-editor-modal"
            onSubmit={
              submitLocation
            }
          >
            <div className="modal-header">
              <div>
                <h2>
                  {editingLocation
                    ? 'Edit UHP Location'
                    : 'Add UHP Location'}
                </h2>

                <p>
                  Define the descriptive location and then place the
                  pin where the taxi should actually collect or drop off.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={() =>
                  setShowModal(false)
                }
                disabled={saving}
              >
                ×
              </button>
            </div>

            {error && (
              <div className="notice error">
                {error}
              </div>
            )}

            <div className="location-editor-layout">
              <div className="location-editor-fields">
                <div className="form-grid two">
                  <label>
                    Location Name
                    <input
                      required
                      value={
                        form.name
                      }
                      onChange={(event) =>
                        setForm({
                          ...form,
                          name:
                            event.target.value
                        })
                      }
                      placeholder="e.g. Renal Clinic"
                    />
                  </label>

                  <label>
                    Parent Site
                    <input
                      value={
                        form.parentSite
                      }
                      onChange={(event) =>
                        setForm({
                          ...form,
                          parentSite:
                            event.target.value
                        })
                      }
                      placeholder="e.g. Derriford Hospital"
                    />
                  </label>
                </div>

                <label>
                  Address / Site Search

                  <BookingAddressAutocomplete
                    required
                    searchEnabled={
                      form.latitude ===
                        null ||
                      form.longitude ===
                        null
                    }
                    value={
                      form.address
                    }
                    placeholder="Search for the hospital or nearest address"
                    onChange={(value) =>
                      setForm(
                        (current) => ({
                          ...current,
                          address:
                            value,
                          postcode:
                            '',
                          latitude:
                            null,
                          longitude:
                            null
                        })
                      )
                    }
                    onSelect={(result) =>
                      setForm(
                        (current) => ({
                          ...current,
                          address:
                            result.label,
                          postcode:
                            result.postcode ||
                            '',
                          latitude:
                            result.latitude,
                          longitude:
                            result.longitude
                        })
                      )
                    }
                  />
                </label>

                <div className="form-grid two">
                  <label>
                    Postcode
                    <input
                      value={
                        form.postcode
                      }
                      onChange={(event) =>
                        setForm({
                          ...form,
                          postcode:
                            event.target.value
                              .toUpperCase()
                        })
                      }
                    />
                  </label>

                  <label>
                    Category
                    <select
                      value={
                        form.category
                      }
                      onChange={(event) =>
                        setForm({
                          ...form,
                          category:
                            event.target.value
                        })
                      }
                    >
                      <option value="hospital">
                        Hospital / Clinic
                      </option>

                      <option value="uhp">
                        UHP
                      </option>

                      <option value="transport">
                        Transport
                      </option>

                      <option value="other">
                        Other
                      </option>
                    </select>
                  </label>
                </div>

                <div className="form-grid two">
                  <label>
                    Latitude
                    <input
                      readOnly
                      value={
                        form.latitude ===
                          null
                          ? ''
                          : Number(
                              form.latitude
                            ).toFixed(6)
                      }
                      placeholder="Set using map"
                    />
                  </label>

                  <label>
                    Longitude
                    <input
                      readOnly
                      value={
                        form.longitude ===
                          null
                          ? ''
                          : Number(
                              form.longitude
                            ).toFixed(6)
                      }
                      placeholder="Set using map"
                    />
                  </label>
                </div>

                <label>
                  Pickup Instructions
                  <textarea
                    rows="3"
                    value={
                      form.pickupInstructions
                    }
                    onChange={(event) =>
                      setForm({
                        ...form,
                        pickupInstructions:
                          event.target.value
                      })
                    }
                    placeholder="What should the UHP booker know about this pickup point?"
                  />
                </label>

                <label>
                  Driver Instructions
                  <textarea
                    rows="3"
                    value={
                      form.driverInstructions
                    }
                    onChange={(event) =>
                      setForm({
                        ...form,
                        driverInstructions:
                          event.target.value
                      })
                    }
                    placeholder="Operational instructions that help the driver locate the exact point."
                  />
                </label>

                <label className="location-display-order">
                  Display Order
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={
                      form.displayOrder
                    }
                    onChange={(event) =>
                      setForm({
                        ...form,
                        displayOrder:
                          event.target.value
                      })
                    }
                  />
                </label>
              </div>

              <div className="location-editor-map-column">
                <LocationEditorMap
                  latitude={
                    form.latitude
                  }
                  longitude={
                    form.longitude
                  }
                  onSelect={
                    setMapPoint
                  }
                />
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setShowModal(false)
                }
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary"
                disabled={
                  saving ||
                  form.latitude ===
                    null ||
                  form.longitude ===
                    null
                }
              >
                {saving
                  ? 'Saving...'
                  : editingLocation
                    ? 'Save Changes'
                    : 'Create Location'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}


function ReasonCodesPage() {
  const [reasonCodes, setReasonCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingReason, setEditingReason] = useState(null);

  const [form, setForm] = useState({
    code: '',
    description: ''
  });

  async function loadReasonCodes() {
    setLoading(true);
    setError('');

    try {
      const response = await apiFetch(
        `${API_BASE}/api/reason-codes`
      );

      if (!response.ok) {
        throw new Error('Unable to load reason codes');
      }

      const data = await response.json();
      setReasonCodes(data.reasonCodes ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load reason codes'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReasonCodes();
  }, []);

  const filteredReasonCodes = useMemo(() => {
    const term = query.trim().toLowerCase();

    if (!term) return reasonCodes;

    return reasonCodes.filter((reason) =>
      [
        reason.code,
        reason.description,
        reason.status
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [reasonCodes, query]);

  const stats = useMemo(() => ({
    active: reasonCodes.filter(
      (reason) => reason.status === 'active'
    ).length,
    inactive: reasonCodes.filter(
      (reason) => reason.status === 'inactive'
    ).length
  }), [reasonCodes]);

  function openCreate() {
    setEditingReason(null);

    setForm({
      code: '',
      description: ''
    });

    setError('');
    setNotice('');
    setShowModal(true);
  }

  function openEdit(reason) {
    setEditingReason(reason);

    setForm({
      code: reason.code,
      description: reason.description
    });

    setError('');
    setNotice('');
    setShowModal(true);
  }

  async function submitReason(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');

    try {
      const isEditing = Boolean(editingReason);

      const response = await apiFetch(
        isEditing
          ? `${API_BASE}/api/reason-codes/${editingReason.id}`
          : `${API_BASE}/api/reason-codes`,
        {
          method: isEditing ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            code: form.code,
            description: form.description
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
          `Unable to ${isEditing ? 'update' : 'create'} reason code`
        );
      }

      setShowModal(false);
      setEditingReason(null);

      setForm({
        code: '',
        description: ''
      });

      setNotice(
        isEditing
          ? 'Reason code updated successfully.'
          : 'Reason code created successfully.'
      );

      await loadReasonCodes();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save reason code'
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(reason) {
    const nextStatus =
      reason.status === 'active'
        ? 'inactive'
        : 'active';

    const verb =
      nextStatus === 'inactive'
        ? 'deactivate'
        : 'reactivate';

    if (
      !window.confirm(
        `Are you sure you want to ${verb} ${reason.code}?`
      )
    ) {
      return;
    }

    setError('');
    setNotice('');

    try {
      const response = await apiFetch(
        `${API_BASE}/api/reason-codes/${reason.id}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status: nextStatus
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
          'Unable to update reason code status'
        );
      }

      setNotice(
        `${reason.code} is now ${nextStatus}.`
      );

      await loadReasonCodes();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to update reason code'
      );
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Reason Codes</h1>
          <p>
            Control the valid reasons available for UHP-funded transport.
          </p>
        </div>

        <button
          className="primary"
          onClick={openCreate}
        >
          <Plus size={18}/>
          Add Reason Code
        </button>
      </div>

      {notice && (
        <div className="notice success">
          {notice}
        </div>
      )}

      {error && !loading && (
        <div className="notice error">
          {error}
        </div>
      )}

      <div className="stats-grid">
        <Stat
          icon={<Tags/>}
          label="Active Codes"
          value={stats.active}
        />

        <Stat
          icon={<Clock3/>}
          label="Inactive"
          value={stats.inactive}
        />
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search compact">
            <Search size={17}/>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search reason codes..."
            />
          </div>
        </div>

        {loading ? (
          <div className="state-panel">
            Loading reason codes...
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredReasonCodes.map((reason) => (
                  <tr key={reason.id}>
                    <td>
                      <strong>{reason.code}</strong>
                    </td>

                    <td>{reason.description}</td>

                    <td>
                      <span className={`badge ${reason.status}`}>
                        {formatStatus(reason.status)}
                      </span>
                    </td>

                    <td>
                      <div className="row-actions">
                        <button
                          className="text-action"
                          onClick={() => openEdit(reason)}
                        >
                          Edit
                        </button>

                        <button
                          className={
                            reason.status === 'active'
                              ? 'text-action warning'
                              : 'text-action'
                          }
                          onClick={() => changeStatus(reason)}
                        >
                          {reason.status === 'active'
                            ? 'Deactivate'
                            : 'Reactivate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredReasonCodes.length === 0 && (
                  <tr>
                    <td colSpan="4">
                      <div className="empty-table">
                        No reason codes match your search.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !saving
            ) {
              setShowModal(false);
            }
          }}
        >
          <form
            className="modal-card modal-card-small"
            onSubmit={submitReason}
          >
            <div className="modal-header">
              <div>
                <h2>
                  {editingReason
                    ? 'Edit Reason Code'
                    : 'Add Reason Code'}
                </h2>

                <p>
                  Only active codes will be offered on new bookings.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={() => setShowModal(false)}
                disabled={saving}
              >
                ×
              </button>
            </div>

            <label>
              Reason Code
              <input
                required
                disabled={Boolean(editingReason)}
                value={form.code}
                onChange={(e) =>
                  setForm({
                    ...form,
                    code: e.target.value.toUpperCase()
                  })
                }
              />
            </label>

            <label>
              Description
              <input
                required
                value={form.description}
                onChange={(e) =>
                  setForm({
                    ...form,
                    description: e.target.value
                  })
                }
              />
            </label>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowModal(false)}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary"
                disabled={saving}
              >
                {saving
                  ? 'Saving...'
                  : editingReason
                    ? 'Save Changes'
                    : 'Create Reason Code'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function formatStatus(status) {
  if (!status) return 'Unknown';

  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function Stat({icon, label, value}) {
  return <div className="stat"><div className="stat-icon">{icon}</div><div><small>{label}</small><strong>{value}</strong></div></div>;
}

function Placeholder({role, active}) {
  const isBooking = active === 'Book UHP Transport';

  return (
    <div className="placeholder card">
      <h1>{active}</h1>

      {isBooking ? (
        <>
          <p>
            For authorised UHP-funded transport only.
          </p>
          <p>
            Cash bookings remain outside this portal and continue through the normal Need-A-Cab booking channels.
          </p>
        </>
      ) : (
        <>
          <p>
            This screen is reserved in the MVP shell. Current role: <strong>{role.replaceAll('_',' ')}</strong>.
          </p>
          <p>
            The next implementation step is UHP administration data entry, followed by the UHP account booking workflow.
          </p>
        </>
      )}
    </div>
  );
}

const isStaffTransportRoute =
  window.location.pathname ===
    '/staff-transport' ||
  window.location.pathname ===
    '/staff-transport/';

createRoot(
  document.getElementById('root')
).render(
  isStaffTransportRoute
    ? <StaffTransportApp/>
    : <App/>
);
