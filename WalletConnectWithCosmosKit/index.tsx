import type { FC } from 'react'
import { useMemo } from 'react'
import { useChain } from "@cosmos-kit/react";
import { ButtonConnect } from "./ButtonConnect";
import { ButtonDisconnect } from "./ButtonDisconnect";

import truncate from '~/hooks/truncate'

export const WalletConnect: FC = () => {
  const { connect, disconnect, username, address } = useChain("umee");

  const connectedTitle = useMemo(() => {
    if (username) return username
      else if (address) {
        return truncate(address, 7, 4)
      }
  }, [username, address])

  return (
    <>
      { !address ? <ButtonConnect /> : <ButtonDisconnect /> }
    </>
  )
}
