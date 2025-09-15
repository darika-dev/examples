import type { FC } from 'react'
import { useChain } from "@cosmos-kit/react";
import { Button } from "~/components/ui/button";

export const ButtonConnect: FC = () => {
  const { connect } = useChain("umee");

  return (
    <Button onClick={connect} className='group'>
      <span className="
        transition-transform group-hover:-translate-y-[40px]
        absolute -top-20 left-0 w-48 h-48 bg-dark-400 before:-translate-x-1/2 before:-translate-y-3/4 after:-translate-x-1/2 after:-translate-y-3/4
        before:absolute before:w-[200%] before:h-[200%] before:top-0 before:left-1/2 before:rounded-[45%] before:bg-dark-900/50 before:animate-liquid
        after:absolute after:w-[200%] after:h-[200%] after:top-0 after:left-1/2 after:rounded-[40%] after:bg-dark-900 after:animate-liquid-slow
      "></span>
      <span className='rwlative z-[1]'>Connect Wallet</span>
    </Button>
  )
}
