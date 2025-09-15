import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps, PropsWithChildren } from 'react'

let mockIsConnected = false as boolean
let mockStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected'
let mockAddress: string | undefined = undefined
const openMock = jest.fn()

jest.mock('@reown/appkit/react', () => ({
  useAppKit: () => ({ open: openMock }),
  useAppKitAccount: () => ({ isConnected: mockIsConnected, status: mockStatus, address: mockAddress }),
}))

jest.mock('@lib/utils', () => ({
  truncateAddress: (a: string) => a,
}))
type ButtonProps = PropsWithChildren<ComponentProps<'button'>>
jest.mock('@ui/Button', () => ({
  Button: ({ children, ...p }: ButtonProps) => <button {...p}>{children}</button>,
}))

jest.mock('@lib/utils', () => ({ truncateAddress: () => '0x1234…cdef' }))

import { WalletConnect } from './WalletConnect'

afterEach(() => {
  mockIsConnected = false
  mockStatus = 'disconnected'
  mockAddress = undefined
  openMock.mockClear()
})

test('shows Connect button when disconnected', () => {
  render(<WalletConnect setIsUserInfoOpen={() => {}} />)
  expect(screen.getByRole('button', { name: /connect/i })).toBeInTheDocument()
})

test('opens modal on Connect click', () => {
  render(<WalletConnect setIsUserInfoOpen={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: /connect/i }))
  expect(open).toHaveBeenCalled()
})

test('shows address button when connected', () => {
  mockStatus = 'connecting'
  render(<WalletConnect setIsUserInfoOpen={() => {}} />)
  expect(screen.getByRole('button', { name: /0x1234…cdef/i })).toBeInTheDocument()
})
