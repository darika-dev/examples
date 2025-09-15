import { cleanup, render, screen, waitFor } from '@testing-library/react'

// --- controlled mock state
let mockChainId = 11155111 // Sepolia by default
let mockReadData: readonly [bigint?, bigint?] | undefined = undefined
const refetchMock: jest.Mock<Promise<{ data: readonly [bigint?, bigint?] | undefined }>, []> = jest.fn(() =>
  Promise.resolve({ data: mockReadData }),
)

// --- mocks
jest.mock('@reown/appkit/react', () => ({
  useAppKitAccount: () => ({ address: '0xabc', isConnected: true }),
  useAppKitNetwork: () => ({ chainId: mockChainId }),
}))

jest.mock('wagmi', () => ({
  useReadContract: () => ({
    data: mockReadData,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: refetchMock, // ⬅️ provide refetch
  }),
}))

type ItemProps = { title: string; balance?: bigint; isLoading?: boolean }
jest.mock('@components/Dashboard/DashboardItem', () => ({
  DashboardItem: (p: ItemProps) => <div>{p.title}</div>,
}))
jest.mock('@components/Dashboard/SecondDashboardItem', () => ({
  SecondDashboardItem: (p: ItemProps) => <div>{p.title}</div>,
}))
jest.mock('@ui/ErrorBox', () => ({
  ErrorBox: ({ message }: { message: string }) => <div role="alert">{message}</div>,
}))

import { PendingReward } from './PendingReward'

afterEach(() => {
  cleanup()
  mockChainId = 11155111
  mockReadData = undefined
  refetchMock.mockClear()
})

test('renders network error when not on mainnet', () => {
  render(<PendingReward />)
  expect(screen.getByRole('alert')).toHaveTextContent(/please switch to ethereum mainnet/i)
})

test('renders items on mainnet with data', async () => {
  mockChainId = 1
  mockReadData = [123n, 456n]

  render(<PendingReward />)

  // optional: prove the effect tried to refetch
  await waitFor(() => expect(refetchMock).toHaveBeenCalled())

  expect(screen.getByText(/current amount available for withdrawal/i)).toBeInTheDocument()
  expect(screen.getByText(/total amount ever withdrawn/i)).toBeInTheDocument()
})
