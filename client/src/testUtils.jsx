import { render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import App from './App.jsx';

function RoutePath() {
  const location = useLocation();
  return <output data-testid="route-path">{location.pathname}</output>;
}

export function renderApp(initialEntries = ['/']) {
  return render(<MemoryRouter initialEntries={initialEntries}><App /><RoutePath /></MemoryRouter>);
}
