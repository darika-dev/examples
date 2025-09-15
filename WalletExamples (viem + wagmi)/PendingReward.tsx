'use client'
import { DashboardItem } from '@components/Dashboard/DashboardItem'
import { SecondDashboardItem } from '@components/Dashboard/SecondDashboardItem'
import { useAppKitAccount, useAppKitNetwork } from '@reown/appkit/react'
import { ErrorBox } from '@ui/ErrorBox'
import type { FC } from 'react'
import { useEffect } from 'react'
import type { Abi } from 'viem'
import { useReadContract } from 'wagmi'
import { rewardsAbi } from './abi'

const CONTRACT_ADDRESS = CONTRACT_ADDRESS as const
const MAINNET_CHAIN_ID = 1

export const PendingReward: FC = () => {
  const { address, isConnected } = useAppKitAccount()
  const { chainId } = useAppKitNetwork()

  const canQuery = isConnected && !!address && chainId === MAINNET_CHAIN_ID

  const { data, isLoading, refetch, isFetching } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: rewardsAbi,
    functionName: 'pendingReward',
    args: address ? ([address as `0x${string}`] as const) : undefined,
    query: {
      enabled: canQuery,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  })

  useEffect(() => {
    if (canQuery) {
      refetch().catch((err) => {
        console.error('Refetch error:', err)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, chainId, canQuery])

  const [availableNow, totalWithdrawn] = (data ?? []) as readonly [bigint?, bigint?]

  if (chainId !== MAINNET_CHAIN_ID) {
    return <ErrorBox message="Please switch to Ethereum Mainnet." />
  }

  return (
    <div className="flex flex-col relative border-l border-r border-itemSecondaryMute -ml-px appDataWidgetsStack:ml-0 appDataWidgetsStack:w-full w-auto">
      <DashboardItem
        title="Current Amount Available for Withdrawal"
        balance={availableNow}
        isLoading={isLoading || isFetching}
      />

      <SecondDashboardItem
        title="Total Amount Ever Withdrawn"
        balance={totalWithdrawn}
        isLoading={isLoading || isFetching}
      />
    </div>
  )
}
