import type { FC } from 'react'
import { useMemo } from 'react'
import { useChain } from "@cosmos-kit/react";
import { Button } from "~/components/ui/button";
import truncate from '~/hooks/truncate'

export const ButtonDisconnect: FC = () => {
  const { disconnect, username, address } = useChain("umee");

  const connectedTitle = useMemo(() => {
    if (username) return username
      else if (address) {
        return truncate(address, 7, 4)
      } else {
        return 'Wallet'
      }
  }, [username, address])

  return (
    <Button onClick={disconnect} className='group min-w-[8rem]'>
      <span className='relative transition-transform group-hover:-translate-y-[150%]'>{connectedTitle}</span>
      <span className='absolute inset-x-0 top-full transition-transform group-hover:-translate-y-[150%]'>Disconnect</span>
    </Button>
  )
}
