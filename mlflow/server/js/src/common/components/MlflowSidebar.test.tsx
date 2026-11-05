import { describe, jest, test, expect } from '@jest/globals';
import { act, screen } from '@testing-library/react';
import { DesignSystemProvider } from '@databricks/design-system';
import { MlflowSidebar } from './MlflowSidebar';
import { MemoryRouter, Outlet, Route, Routes, useNavigate } from '../utils/RoutingUtils';
import type { NavigateFunction } from '../utils/RoutingUtils';
import { QueryClient, QueryClientProvider } from '../utils/reactQueryHooks';
import { renderWithDesignSystem, renderWithIntl } from '../utils/TestUtils.react18';
import { useFeatureEnabled } from '../../experiment-tracking/hooks/useServerInfo';

jest.mock('../../account/hooks', () => ({
  useCurrentUserIsAdmin: jest.fn(() => false),
  useCurrentUserQuery: jest.fn(() => ({ data: undefined, isError: true, isLoading: false })),
  useIsBasicAuth: jest.fn(() => false),
}));

jest.mock('../../experiment-tracking/hooks/useServerInfo', () => ({
  ...jest.requireActual<typeof import('../../experiment-tracking/hooks/useServerInfo')>(
    '../../experiment-tracking/hooks/useServerInfo',
  ),
  useFeatureEnabled: jest.fn(() => false),
}));

jest.mock('./MlflowSidebarExperimentItems', () => ({
  MlflowSidebarExperimentItems: ({ experimentId }: { experimentId?: string }) => (
    <li>{`Experiment items for ${experimentId}`}</li>
  ),
}));

const renderSidebarAt = (path: string) =>
  renderWithDesignSystem(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <MlflowSidebar showSidebar setShowSidebar={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('MlflowSidebar', () => {
  test('collapses the AI Registry section to a single link outside the registry pages', () => {
    renderSidebarAt('/experiments');

    expect(screen.getByRole('link', { name: 'AI Registry' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Prompts' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /MCP/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Skills/ })).not.toBeInTheDocument();
  });

  test.each(['/prompts', '/mcp-registry', '/skills'])('expands the AI Registry section on %s', (path) => {
    renderSidebarAt(path);

    expect(screen.getByRole('link', { name: 'Prompts' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /MCP/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Skills/ })).toBeInTheDocument();
  });

  test('renders Chinese labels when the locale is zh-CN', () => {
    renderWithIntl(
      <DesignSystemProvider>
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter initialEntries={['/experiments']}>
            <MlflowSidebar showSidebar setShowSidebar={() => {}} />
          </MemoryRouter>
        </QueryClientProvider>
      </DesignSystemProvider>,
      {},
      {
        locale: 'zh-CN',
        messages: {
          uAv9Zs: '主页',
          U4ox5k: '实验',
          jiIft9: '设置',
          YqXBoN: '语言',
        },
      },
    );

    expect(screen.getByRole('link', { name: '主页' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '实验' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '设置' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Evaluation platform' })).toBeInTheDocument();
    expect(screen.getByText('评测')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Docs|文档/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '中文' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'English' })).not.toBeInTheDocument();
    expect(screen.queryByText('3.18.1.dev0')).not.toBeInTheDocument();
  });

  test('renders AI Gateway without a New badge', () => {
    jest.mocked(useFeatureEnabled).mockReturnValue(true);
    try {
      renderSidebarAt('/experiments');

      expect(screen.getByRole('link', { name: 'AI Gateway' })).toBeInTheDocument();
      expect(screen.queryByText('New')).not.toBeInTheDocument();
    } finally {
      jest.mocked(useFeatureEnabled).mockReturnValue(false);
    }
  });

  test('shows the evaluation logo and omits docs and the language toggle', () => {
    renderSidebarAt('/experiments');

    expect(screen.getByRole('img', { name: 'Evaluation platform' })).toBeInTheDocument();
    expect(screen.getByText('Eval')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Docs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '中文' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'English' })).not.toBeInTheDocument();
    expect(screen.queryByText('3.18.1.dev0')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
  });

  test('shows the top-level menu after navigating back to the experiments list', () => {
    let navigate: NavigateFunction | undefined;
    const NavigateCapture = () => {
      navigate = useNavigate();
      return null;
    };
    const Layout = () => (
      <>
        <MlflowSidebar showSidebar setShowSidebar={() => {}} />
        <NavigateCapture />
        <Outlet />
      </>
    );

    renderWithDesignSystem(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/experiments', '/experiments/123/traces']} initialIndex={1}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/experiments" element={null} />
              <Route path="/experiments/:experimentId/*" element={null} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText('Experiment items for 123')).toBeInTheDocument();
    expect(screen.queryByText('Home')).not.toBeInTheDocument();

    // Simulate the browser back button
    act(() => navigate?.(-1));

    expect(screen.queryByText('Experiment items for 123')).not.toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
  });
});
