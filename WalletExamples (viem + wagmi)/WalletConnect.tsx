import { Connect, Ellipsis } from '@icons/index'
import { truncateAddress } from '@lib/utils'
import { useAppKit, useAppKitAccount } from '@reown/appkit/react'
import { Button } from '@ui/Button'
import type { FC, HTMLAttributes } from 'react'

interface WalletConnectProps extends HTMLAttributes<HTMLDivElement> {
  setIsUserInfoOpen: (isOpen: boolean) => void
}

export const WalletConnect: FC<WalletConnectProps> = ({ setIsUserInfoOpen }) => {
  const { open } = useAppKit()
  const { address, isConnected, status } = useAppKitAccount()

  const uiAddress = truncateAddress(address, 6, 4)

  const onConnect = () => open() // Open the wallet connection modal

  return (
    <>
      {isConnected && (
        <Button size="sm" variant="outline" onClick={() => setIsUserInfoOpen(true)}>
          <div className="text-itemSecondaryDefault">{uiAddress}</div>
          <div className="flex items-center justify-center -mr-1 bg-backgroundSecondaryDefault min-h-5">
            <span className="inline-block align-middle text-center mx-1" aria-hidden="true">
              <Ellipsis className="w-3.5" />
            </span>
          </div>
        </Button>
      )}

      {!isConnected && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => void onConnect()}
          disabled={isConnected || status === 'connecting'}
        >
          <Connect className="w-3 -ml-[5px]" />
          <span>Connect</span>
          <span className="hidden sm:flex">Wallets</span>
        </Button>
      )}
    </>
  )
}
