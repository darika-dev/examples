import React, { createContext, FC, PropsWithChildren, ReactNode, useContext, useMemo } from 'react';
import { appProps } from 'src/library';
import { useAtom } from 'jotai';

import type { PublicStateControllerState } from '@reown/appkit';
import { createAppKit, useAppKit, useAppKitAccount, useAppKitProvider, useAppKitState } from '@reown/appkit/react';
import { SolanaAdapter } from '@reown/appkit-adapter-solana';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { SolflareWalletAdapter, PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';

import { PROJECT_ID } from 'src/constants';
import { chains, metadata } from 'src/config';

// Create the Ethers adapter
export const ethersAdapter = new EthersAdapter();

// Create Solana adapter
const solanaWeb3JsAdapter = new SolanaAdapter({
  wallets: [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
});

// Create the AppKit instance
createAppKit({
  adapters: [ethersAdapter, solanaWeb3JsAdapter],
  metadata,
  networks: chains,
  projectId: PROJECT_ID as string,
  features: {
    email: false,
    socials: false,
    swaps: false,
    analytics: true, // Optional - defaults to your Cloud configuration
  },
});

interface IWalletPassThrough {
  account:
    | {
        caipAddress:
          | `eip155:${string}:${string}`
          | `eip155:${number}:${string}`
          | `solana:${string}:${string}`
          | `solana:${number}:${string}`
          | `polkadot:${string}:${string}`
          | `polkadot:${number}:${string}`
          | undefined;
        address: string | undefined;
        isConnected: boolean;
        status: 'reconnecting' | 'connected' | 'disconnected' | 'connecting' | undefined;
      }
    | undefined;
  providers: {
    eth:
      | {
          walletProvider: unknown;
          walletProviderType:
            | ('walletConnect' | 'injected' | 'coinbaseWallet' | 'eip6963' | 'w3mAuth' | 'coinbaseWalletSDK')
            | undefined;
        }
      | undefined;
    sol:
      | {
          walletProvider: unknown;
          walletProviderType:
            | ('walletConnect' | 'injected' | 'coinbaseWallet' | 'eip6963' | 'w3mAuth' | 'coinbaseWalletSDK')
            | undefined;
        }
      | undefined;
  };
  web3Modal:
    | {
        open: (options?: {
          view: 'Account' | 'Connect' | 'Networks' | 'ApproveTransaction' | 'OnRampProviders';
        }) => Promise<void>;
        close: () => Promise<void>;
      }
    | undefined;
  appState: PublicStateControllerState | undefined;
}

export const initialPassThrough = {
  account: undefined,
  providers: {
    eth: undefined,
    sol: undefined,
  },
  web3Modal: undefined,
  appState: undefined,
};

export const WalletPassthroughContext = createContext<IWalletPassThrough>(initialPassThrough);

export function useWalletPassThrough(): IWalletPassThrough {
  return useContext(WalletPassthroughContext);
}

const FromWalletAdapter: FC<PropsWithChildren> = ({ children }) => {
  const account = useAppKitAccount();
  const providerEth = useAppKitProvider('eip155');
  const providerSolana = useAppKitProvider('solana');
  const web3Modal = useAppKit();
  const appState = useAppKitState();

  return (
    <WalletPassthroughContext.Provider
      value={{
        account: account,
        providers: {
          eth: providerEth,
          sol: providerSolana,
        },
        web3Modal: web3Modal,
        appState: appState,
      }}
    >
      {children}
    </WalletPassthroughContext.Provider>
  );
};

export const WalletPassthroughProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [atom] = useAtom(appProps);
  const passthroughWalletContextState = atom?.passthroughWalletContextState || {};

  const walletPassthrough: IWalletPassThrough = useMemo(() => {
    return {
      ...initialPassThrough,
      ...passthroughWalletContextState,
    };
  }, [atom]);

  if (!window?.Dextra?.enableWalletPassthrough) {
    return <FromWalletAdapter>{children}</FromWalletAdapter>;
  }

  if (walletPassthrough) {
    return <WalletPassthroughContext.Provider value={walletPassthrough}>{children}</WalletPassthroughContext.Provider>;
  }

  return <>{children}</>;
};
