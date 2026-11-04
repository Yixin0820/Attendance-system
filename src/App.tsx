import { useState } from 'react';
import { Login } from './components/Login';
import { Shell } from './components/Shell';
import { ToastHost } from './components/ui';
import { CommitteeUpload, CommitteeHistory } from './components/Committee';
import { InspectorDuty, InspectorShift, InspectorView } from './components/Inspector';
import { AdminOverview, AdminStaff, AdminShift, AdminHistory, AdminRooms } from './components/Admin';
import { OpsSystem, OpsAccounts, OpsLogs } from './components/Ops';
import { StoreProvider, useStore } from './store';
import type { Role } from './types';

function defaultNav(role: Role): string {
  switch (role) {
    case 'committee': return 'upload';
    case 'inspector': return 'duty';
    case 'admin': return 'overview';
    case 'ops': return 'system';
  }
}

function Workspace() {
  const { user, logout } = useStore();
  const [active, setActive] = useState<string>('');

  if (!user) {
    return <Login />;
  }

  return (
    <Shell
      role={user.role}
      active={active || defaultNav(user.role)}
      onNavigate={setActive}
      onExit={() => {
        logout();
        setActive('');
      }}
    >
      {renderPage(user.role, active || defaultNav(user.role))}
    </Shell>
  );
}

function renderPage(role: Role, active: string) {
  if (role === 'committee') {
    if (active === 'upload') return <CommitteeUpload />;
    if (active === 'history') return <CommitteeHistory />;
  }
  if (role === 'inspector') {
    if (active === 'duty') return <InspectorDuty />;
    if (active === 'shift') return <InspectorShift />;
    if (active === 'view') return <InspectorView />;
  }
  if (role === 'admin') {
    if (active === 'overview') return <AdminOverview />;
    if (active === 'staff') return <AdminStaff />;
    if (active === 'shift') return <AdminShift />;
    if (active === 'history') return <AdminHistory />;
    if (active === 'rooms') return <AdminRooms />;
  }
  if (role === 'ops') {
    if (active === 'system') return <OpsSystem />;
    if (active === 'accounts') return <OpsAccounts />;
    if (active === 'logs') return <OpsLogs />;
  }
  return null;
}

function App() {
  return (
    <StoreProvider>
      <Workspace />
      <ToastHost />
    </StoreProvider>
  );
}

export default App;
