import {
  createContext,
  Dispatch,
  FC,
  MutableRefObject,
  ReactNode,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
} from 'react';
import { BrowserProvider, Contract, parseUnits, formatUnits, formatEther } from 'ethers';
import type { Eip1193Provider } from 'ethers';
import {
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  TransactionInstruction,
  Connection,
  AddressLookupTableAccount,
  VersionedTransactionResponse,
  MessageCompiledInstruction,
} from '@solana/web3.js';
import { useAppKitConnection, type Provider } from '@reown/appkit-adapter-solana/react';
import { useAppKitProvider } from '@reown/appkit/react';

import Decimal from 'decimal.js';
import { SwapMode } from 'src/types';
import { base, arbitrum, solana } from '@reown/appkit/networks';

import { DEFAULT_SLIPPAGE } from 'src/constants';
import { hasNumericValue } from 'src/misc/utils';
import { FormProps, IAsset, IInit, IForm, QuoteResponse, QuoteResponseError, Calldatas } from 'src/types';

import { useFetchQuote } from 'src/api/Quote';
import { useLocalStorage } from 'src/hooks/useLocalStorage';
import { INITIAL_FORM_CONFIG, INITIAL_SOL_CONFIG } from 'src/constants';
import { BASE_ABI } from 'src/constants/baseABI';
import { useAssetsContext } from 'src/contexts/AssetsContext';
import { useScreenState } from 'src/contexts/ScreenProvider';
import { useWalletPassThrough } from 'src/contexts/WalletPassthrough';

export interface ISwapContext {
  form: IForm;
  setForm: Dispatch<SetStateAction<IForm>>;
  isToPairFocused: MutableRefObject<boolean>;
  errors: Record<string, { title: string; message: string }>;
  setErrors: Dispatch<
    SetStateAction<
      Record<
        string,
        {
          title: string;
          message: string;
        }
      >
    >
  >;
  fromTokenInfo?: IAsset | null;
  toTokenInfo?: IAsset | null;
  multiChainSwap: boolean;
  maxBalance: string | null;
  onSubmit: () => Promise<any | null>; // ToDo: update type
  lastSwapResult: { swapResult: any; quoteResponseMeta: any | null } | null; // ToDo: update type
  formProps: FormProps;
  displayMode: IInit['displayMode'];
  scriptDomain: IInit['scriptDomain'];
  swapping: {
    txStatus:
      | {
          txid: string;
          status: 'loading' | 'fail' | 'success' | 'timeout';
        }
      | undefined;
  };
  reset: (props?: { resetValues: boolean }) => void;
  quoteResponse: any; // ToDo: update type
  dextra: {
    priorityFeeInETH: number;
    setPriorityFeeInETH: Dispatch<SetStateAction<number>>;
  };
  setUserSlippage: Dispatch<SetStateAction<number | undefined>>;
  transactionFee: number | string;
}

interface MessageHeader {
  numRequiredSignatures: number;
  numReadonlySignedAccounts: number;
  numReadonlyUnsignedAccounts: number;
}

interface MessageAddressTableLookup {
  accountKey: string;
  writableIndexes: number[];
  readonlyIndexes: number[];
}

interface ITransactionMessage {
  header: MessageHeader;
  staticAccountKeys: string[];
  compiledInstructions: MessageCompiledInstruction[];
  addressTableLookups: MessageAddressTableLookup[];
}

interface IVersionedTransaction {
  signatures: string[];
  message: ITransactionMessage;
}

export const SwapContext = createContext<ISwapContext | null>(null);

export function useSwapContext() {
  const context = useContext(SwapContext);
  if (!context) throw new Error('Missing SwapContextProvider');
  return context;
}

export const PRIORITY_NONE = 0; // No additional fee
export const PRIORITY_HIGH = 0.000_005; // Additional fee of 1x base fee
export const PRIORITY_TURBO = 0.000_5; // Additional fee of 100x base fee
export const PRIORITY_MAXIMUM_SUGGESTED = 0.01;

export const SwapContextProvider: FC<{
  displayMode: IInit['displayMode'];
  scriptDomain?: string;
  formProps?: FormProps;
  maxAccounts?: number;
  useUserSlippage?: boolean;
  slippagePresets?: number[];
  children: ReactNode;
}> = (props) => {
  const { displayMode, scriptDomain, formProps: originalFormProps, maxAccounts, children } = props;
  const { screen, setScreen } = useScreenState();
  const { assets, refetchBalance } = useAssetsContext();
  const { account, appState, switchNetwork, providers, web3Modal } = useWalletPassThrough();

  const isSolana = appState?.selectedNetworkId?.split(':')[0] === 'solana';

  let INITIAL_FORM = {
    srcToken: isSolana
      ? INITIAL_SOL_CONFIG.initialInputToken
      : (INITIAL_FORM_CONFIG.formProps.initialInputToken as string),
    destToken: isSolana
      ? INITIAL_SOL_CONFIG.initialOutputToken
      : (INITIAL_FORM_CONFIG.formProps.initialOutputToken as string),
    srcChain: isSolana
      ? INITIAL_SOL_CONFIG.initialInputChain
      : (INITIAL_FORM_CONFIG.formProps.initialInputChain as number),
    destChain: isSolana
      ? INITIAL_SOL_CONFIG.initialOutputChain
      : (INITIAL_FORM_CONFIG.formProps.initialOutputChain as number),
    fromValue: '',
    toValue: '',
    slippageBps: DEFAULT_SLIPPAGE,
    destinationAddress: '',
  };

  const formProps: FormProps = useMemo(() => ({ ...INITIAL_FORM, ...originalFormProps }), [originalFormProps]);
  const [userSlippage, setUserSlippage] = useLocalStorage<number | undefined>('dextra-terminal-slippage', undefined);
  const [transactionFee, setTransactionFee] = useState<string | number>(0);
  const [form, setForm] = useState<IForm>(
    (() => {
      const slippageBps = (() => {
        if (props.useUserSlippage && typeof userSlippage !== 'undefined' && !formProps?.initialSlippageBps) {
          return userSlippage;
        }

        if (props.useUserSlippage && formProps?.initialSlippageBps) {
          return formProps?.initialSlippageBps;
        }
        return DEFAULT_SLIPPAGE;
      })();

      const state = {
        srcToken: (formProps?.initialInputToken ??
          (isSolana
            ? INITIAL_SOL_CONFIG.initialInputToken
            : INITIAL_FORM_CONFIG.formProps.initialInputToken)) as string,
        destToken: (formProps?.initialOutputToken ??
          (isSolana
            ? INITIAL_SOL_CONFIG.initialOutputToken
            : INITIAL_FORM_CONFIG.formProps.initialOutputToken)) as string,
        srcChain: (formProps?.initialInputChain ??
          (isSolana
            ? INITIAL_SOL_CONFIG.initialInputChain
            : INITIAL_FORM_CONFIG.formProps.initialInputChain)) as number,
        destChain: (formProps?.initialOutputChain ??
          (isSolana
            ? INITIAL_SOL_CONFIG.initialOutputChain
            : INITIAL_FORM_CONFIG.formProps.initialOutputChain)) as number,
        fromValue: '',
        toValue: '',
        slippageBps,
      };

      return state;
    })(),
  );

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      srcToken: (isSolana ? INITIAL_SOL_CONFIG.initialInputToken : INITIAL_FORM_CONFIG.formProps.initialInputToken) as string,
      srcChain: (isSolana ? INITIAL_SOL_CONFIG.initialInputChain : INITIAL_FORM_CONFIG.formProps.initialInputChain) as string,
    }));
  }, [isSolana]);

  const [errors, setErrors] = useState<Record<string, { title: string; message: string }>>({});
  const [maxBalance, setMaxBalance] = useState<string | null>(null);

  const fromTokenInfo = useMemo(() => {
    const tokenInfo = form.srcToken
      ? assets.find((item) => item.address === form.srcToken && item.chain?.id === form.srcChain)
      : null;
    return tokenInfo;
  }, [form.srcToken, form.srcChain, assets]);

  const toTokenInfo = useMemo(() => {
    const tokenInfo = form.destToken
      ? assets.find((item) => item.address === form.destToken && item.chain?.id === form.destChain)
      : null;
    return tokenInfo;
  }, [form.destToken, form.destChain, assets]);

  const multiChainSwap = useMemo(() => {
    const res =
      ((fromTokenInfo?.chain?.id == base.id || fromTokenInfo?.chain?.id == arbitrum.id) &&
        toTokenInfo?.chain?.id == solana.id) ||
      (fromTokenInfo?.chain?.id == solana.id &&
        (toTokenInfo?.chain?.id == base.id || toTokenInfo?.chain?.id == arbitrum.id));
    return res;
  }, [fromTokenInfo?.chain?.id, toTokenInfo?.chain?.id]);

  useEffect(() => {
    const newChainId: number = Number(fromTokenInfo?.chain?.id);
    if (account?.caipAddress !== newChainId.toString() && newChainId) {
      try {
        switchNetwork?.switchNetwork(newChainId);
      } catch (error) {
        console.error('Network switch error', error);
        throw new Error('Network switch failed');
      }
    }
  }, [fromTokenInfo]);

  useEffect(() => {
    if (!account?.isConnected) {
      return;
    }
    refetchBalance();
    const tokenInfo = account?.isConnected
      ? assets.find((item) => item.address === form.srcToken && item.chain?.id === form.srcChain)
      : null;
    const balance = tokenInfo?.balance;
    setMaxBalance(balance?.balanceFormatted || '0');
  }, [form.srcToken, account?.address, assets, account?.isConnected]);

  const isToPairFocused = useRef<boolean>(false);
  const swapMode = isToPairFocused.current ? SwapMode.ExactOut : SwapMode.ExactIn;

  // Set value given initial amount
  const setupInitialAmount = useCallback(() => {
    if (!formProps?.initialAmount || assets?.length === 0 || !fromTokenInfo || !toTokenInfo) return;

    if (swapMode === SwapMode.ExactOut) {
      setTimeout(() => {
        setForm((prev) => {
          return { ...prev, toValue: String(formProps.initialAmount) ?? '' };
        });
      }, 0);
    } else {
      setTimeout(() => {
        setForm((prev) => ({ ...prev, fromValue: String(formProps.initialAmount) ?? '' }));
      }, 0);
    }
  }, [formProps?.initialAmount, swapMode, assets]);

  useEffect(() => {
    setupInitialAmount();
  }, [formProps?.initialAmount, setupInitialAmount]);

  // We dont want to effect to keep trigger for fromValue and toValue
  const userInputChange = useMemo(() => {
    if (swapMode === SwapMode.ExactOut) {
      return form.toValue;
    } else {
      return form.fromValue;
    }
  }, [form.fromValue, form.toValue, swapMode]);

  const dextraParams = useMemo(() => {
    const amount = (() => {
      // ExactIn
      if (isToPairFocused.current === false) {
        if (!fromTokenInfo || !form.fromValue || !hasNumericValue(form.fromValue)) {
          return 0;
        }
        return parseUnits(form.fromValue, fromTokenInfo?.decimals || 18);
      }

      // ExactOut
      if (!toTokenInfo || !form.toValue || !hasNumericValue(form.toValue)) {
        return 0;
      }
      return parseUnits(form.toValue, toTokenInfo?.decimals || 18);
    })();

    return {
      srcToken: form.srcToken,
      destToken: form.destToken,
      walletAddress: account?.address ? (account?.address as string) : '',
      amount: amount.toString(),
      srcChainId: form.srcChain,
      destChainId: form.destChain,
      slippage: form.slippageBps * 10,
      // excludeAffiliateFee = false,
      swapMode,
      destinationAddress: multiChainSwap ? form.destinationAddress : '',
    };
  }, [
    form.srcChain,
    form.destChain,
    form.srcToken,
    form.destToken,
    form.fromValue,
    form.toValue,
    form.destinationAddress,
    account?.address,
    maxAccounts,
    userInputChange,
    swapMode,
    fromTokenInfo?.address,
    toTokenInfo?.address,
  ]);

  const quoteResponse = useFetchQuote(dextraParams);
  const { data: swapInfo, refetch: quoteRefetch } = quoteResponse;
  const [quoteResponseMeta, setQuoteResponseMeta] = useState<any | null>(null);

  useEffect(() => {
    if (!swapInfo) {
      setQuoteResponseMeta(null);
      return;
    }
    // the UI sorts the best route depending on ExactIn or ExactOut
    setQuoteResponseMeta(swapInfo);
  }, [swapMode, swapInfo]);

  useEffect(() => {
    if (!form.fromValue && !quoteResponseMeta) {
      setForm((prev) => ({ ...prev, fromValue: '', toValue: '' }));
      return;
    }

    setForm((prev) => {
      const newValue = { ...prev };

      if (!fromTokenInfo || !toTokenInfo) return prev;

      let { inputAmount, outputAmount } = quoteResponseMeta || {};
      if (swapMode === SwapMode.ExactIn) {
        newValue.toValue = outputAmount
          ? String(formatUnits(outputAmount.value, outputAmount?.decimals || toTokenInfo?.decimals))
          : '';
      } else {
        newValue.fromValue = inputAmount
          ? String(formatUnits(inputAmount.value, inputAmount?.decimals || fromTokenInfo?.decimals))
          : '';
      }
      return newValue;
    });
  }, [quoteResponseMeta, fromTokenInfo, toTokenInfo, swapMode]);

  const [txStatus, setTxStatus] = useState<
    | {
        txid: string;
        status: 'loading' | 'fail' | 'success' | 'timeout';
      }
    | undefined
  >(undefined);

  const [lastSwapResult, setLastSwapResult] = useState<ISwapContext['lastSwapResult']>(null);

  const calcTransactionFee = useCallback(async () => {
    if (!account?.address || !quoteResponseMeta) {
      return 0;
    }

    const isQuoteResponse = (response: QuoteResponse | QuoteResponseError | undefined): response is QuoteResponse => {
      return (response as QuoteResponse).calldatas !== undefined;
    };

    if (!isQuoteResponse(swapInfo)) {
      return 0;
    }

    if (isSolana) {
      // newProvider = new BrowserProvider(providers?.sol?.walletProvider);
    } else {
      const newProvider = new BrowserProvider(providers?.eth?.walletProvider as Eip1193Provider);

      const signer = newProvider && (await newProvider.getSigner());
      const contract = new Contract(form.srcToken, BASE_ABI, signer);

      const feeData = newProvider && (await newProvider.getFeeData());

      const calldata: Calldatas = swapInfo?.calldatas;
      const { to: spenderAddress, value: amount, data } = calldata;

      const isNativeToken = fromTokenInfo?.isNativeToken;

      let transactionFee: bigint | number = 0;

      const tx: any = {
        to: spenderAddress,
        value: amount,
        data: data,
      };
      try {
        if (isNativeToken) {
          const gasEstimate = await signer.estimateGas(tx);
          transactionFee = feeData.gasPrice ? gasEstimate * feeData.gasPrice : 0;
        } else {
          const gasEstimate = await contract.transfer.estimateGas(form.destToken, amount);
          transactionFee = feeData.gasPrice ? gasEstimate * feeData.gasPrice : 0;
        }
      } catch (error) {
        transactionFee = 2000000000000;
      }

      setTransactionFee(formatEther(transactionFee));
    }
  }, [account?.address, quoteResponseMeta]);

  useEffect(() => {
    calcTransactionFee();
  }, [quoteResponseMeta]);

  const { connection } = useAppKitConnection();
  const { walletProvider: walletProviderSol } = useAppKitProvider<Provider>('solana');

  const reconstructInstructions = async (
    transaction: IVersionedTransaction,
    connection: Connection,
  ): Promise<TransactionInstruction[]> => {
    const staticAccountKeys: PublicKey[] = transaction.message.staticAccountKeys.map(
      (key: string) => new PublicKey(key),
    );

    const addressTableLookups = transaction.message.addressTableLookups;

    const addressTableAccounts: (AddressLookupTableAccount | null)[] = await Promise.all(
      addressTableLookups.map(async (lookup) => {
        const addressLookupTableAccount = await connection.getAddressLookupTable(new PublicKey(lookup.accountKey));
        return addressLookupTableAccount.value;
      }),
    );

    let accountKeys: PublicKey[] = [...staticAccountKeys];

    addressTableLookups.forEach((lookup, tableIndex) => {
      const tableAccount = addressTableAccounts[tableIndex];
      const addresses = tableAccount?.state?.addresses;

      if (!addresses) return

      lookup.writableIndexes.forEach((index) => {
        accountKeys.push(addresses[index]);
      });

      lookup.readonlyIndexes.forEach((index) => {
        accountKeys.push(addresses[index]);
      });
    });

    const compiledInstructions = transaction.message.compiledInstructions;

    const isAccountSigner = (accountIndex: number): boolean => {
      return accountIndex < transaction.message.header.numRequiredSignatures;
    };

    const isAccountWritable = (accountIndex: number): boolean => {
      const numSignedAccounts = transaction.message.header.numRequiredSignatures;
      const numWritableSignedAccounts =
        numSignedAccounts - transaction.message.header.numReadonlySignedAccounts;
      const numUnsignedAccounts = transaction.message.staticAccountKeys.length - numSignedAccounts;
      const numWritableUnsignedAccounts =
        numUnsignedAccounts - transaction.message.header.numReadonlyUnsignedAccounts;
  
      if (accountIndex < numWritableSignedAccounts) {
        return true;
      } else if (accountIndex < numSignedAccounts) {
        return false;
      } else if (accountIndex < numSignedAccounts + numWritableUnsignedAccounts) {
        return true;
      } else {
        return false;
      }
    };

    const instructions: TransactionInstruction[] = compiledInstructions.map((ci) => {
      const programId = accountKeys[ci.programIdIndex];

      const keys = ci.accountKeyIndexes.map((accountIndex: number) => {
        const pubkey = accountKeys[accountIndex];
        const isSigner = isAccountSigner(accountIndex);
        const isWritable = isAccountWritable(accountIndex);
        return { pubkey, isSigner, isWritable };
      });

      const data = Buffer.from(Object.values(ci.data));

      return new TransactionInstruction({
        programId,
        keys,
        data,
      });
    });

    return instructions;
  };

  const handleSendSolanaTransaction = async () => {
    if (!connection) {
      console.log('connection not set');
      return;
    }
    if (!walletProviderSol || !account?.address || !connection) {
      console.log('walletProvider or address is undefined');
      return;
    }

    try {
      const { blockhash } = await connection.getLatestBlockhash();

      const deserializeInstruction = async () => {
        const base64Data = quoteResponseMeta?.calldatas[0]?.data;
        const dataBuffer = Buffer.from(base64Data, 'base64');

        let transaction;
        try {
          transaction = VersionedTransaction.deserialize(dataBuffer);
        } catch (error) {
          return null;
        }

        if (transaction) {
          // @ts-ignore
          const instructions = await reconstructInstructions(transaction, connection);

          return instructions;
        } else {
          return null;
        }
      };

      const instructions = await deserializeInstruction();
      console.log('>>>>>> instructions', instructions);

      const messageV0 = new TransactionMessage({
        payerKey: walletProviderSol.publicKey as PublicKey,
        recentBlockhash: blockhash,
        instructions: instructions as TransactionInstruction[],
      }).compileToV0Message();
      console.log('>>>>>> messageV0', messageV0);

      // Make a versioned transaction
      const transactionV0 = new VersionedTransaction(messageV0);
      console.log('>>>>>> transactionV0', transactionV0);

      // @ts-ignore 
      const signature = await walletProviderSol.sendTransaction(transactionV0, connection);
      console.log('>>>>>> signature', signature);

      // Handle successful swap
      if (signature) {
        setLastSwapResult({ swapResult: signature, quoteResponseMeta: quoteResponseMeta });
        setScreen('Swapping');
        setTxStatus({ txid: signature, status: 'success' });
      }
    } catch (error) {
      console.error('Swap error', error);
      setTxStatus({ txid: '', status: 'fail' });
      return null;
    }
  };

  const onSubmit = useCallback(async () => {
    if (!account?.address || !quoteResponseMeta) {
      return null;
    }

    if (isSolana) {
      handleSendSolanaTransaction();
    } else {
      try {
        // Initialize provider and signer
        const newProvider = new BrowserProvider(providers?.eth?.walletProvider as Eip1193Provider);
        const signer = await newProvider.getSigner();

        // Initialize contract instance
        const contract = new Contract(form.srcToken, BASE_ABI, signer);

        // Type guard to verify response type
        const isQuoteResponse = (
          response: QuoteResponse | QuoteResponseError | undefined,
        ): response is QuoteResponse => {
          return (response as QuoteResponse).calldatas !== undefined;
        };

        // Refresh quote data
        quoteRefetch();

        // Verify swapInfo response type
        if (!isQuoteResponse(swapInfo)) {
          throw new Error('error');
        }
        const calldata: Calldatas = swapInfo?.calldatas;
        const { to: spenderAddress, value: amount, data } = calldata;

        // Check if the token is a native token (e.g., ETH)
        const isNativeToken = fromTokenInfo?.isNativeToken;

        if (isNativeToken) {
          // Prepare and execute native token transaction
          const tx: any = {
            to: spenderAddress,
            value: amount,
            data: data,
          };

          // Simulate the transaction
          try {
            await signer.call(tx);
          } catch (simulationError) {
            console.error('Transaction simulation error', simulationError);
            throw new Error('Transaction simulation failed');
          }

          // Execute transaction
          const swapResult = await signer.sendTransaction(tx).catch((err) => {
            console.error('Transaction error', err);
            setTxStatus({ txid: '', status: 'fail' });
            return null;
          });

          // Handle successful swap
          if (swapResult) {
            setLastSwapResult({ swapResult: swapResult, quoteResponseMeta: quoteResponseMeta });
            setScreen('Swapping');
            setTxStatus({ txid: swapResult.hash, status: 'success' });
          }

          return swapResult;
        } else {
          const approveTx = await contract.approve(spenderAddress, swapInfo.inputAmount.value);
          await approveTx.wait();

          // Prepare transaction
          const tx: any = {
            to: spenderAddress,
            value: amount,
            data: data,
          };

          // Simulate the transaction
          try {
            await signer.call(tx);
          } catch (simulationError) {
            console.error('Transaction simulation error', simulationError);
            throw new Error('Transaction simulation failed');
          }

          // Execute transaction
          const swapResult = await signer.sendTransaction(tx).catch((err) => {
            console.error('Transaction error', err);
            setTxStatus({ txid: '', status: 'fail' });
            return null;
          });

          // Handle successful swap
          if (swapResult) {
            setLastSwapResult({ swapResult: swapResult, quoteResponseMeta: quoteResponseMeta });
            setScreen('Swapping');
            setTxStatus({ txid: swapResult.hash, status: 'success' });
          }

          return swapResult;
        }
      } catch (error) {
        console.error('Swap error', error);
        setTxStatus({ txid: '', status: 'fail' });
        return null;
      }
    }
  }, [account?.address, quoteResponseMeta]);

  const reset = useCallback(
    ({ resetValues } = { resetValues: false }) => {
      if (resetValues) {
        setForm(INITIAL_FORM);
        setupInitialAmount();
      } else {
        setForm((prev) => ({ ...prev, toValue: '' }));
      }

      setQuoteResponseMeta(null);
      setErrors({});
      setLastSwapResult(null);
      setTxStatus(undefined);
    },
    [setupInitialAmount, form],
  );

  const [priorityFeeInETH, setPriorityFeeInETH] = useState<number>(PRIORITY_NONE);
  const computeUnitPriceMicroLamports = useMemo(() => {
    if (priorityFeeInETH === undefined) return 0;
    return new Decimal(priorityFeeInETH)
      .mul(10 ** 9) // Eth into lamports
      .mul(10 ** 6) // lamports into microlamports
      .div(1_400_000) // divide by CU
      .round()
      .toNumber();
  }, [priorityFeeInETH]);

  // onFormUpdate callback
  useEffect(() => {
    if (typeof window?.Dextra.onFormUpdate === 'function') {
      window.Dextra.onFormUpdate(form);
    }
  }, [form]);

  // onFormUpdate callback
  useEffect(() => {
    if (typeof window?.Dextra.onScreenUpdate === 'function') {
      window.Dextra.onScreenUpdate(screen);
    }
  }, [screen]);

  return (
    <SwapContext.Provider
      value={{
        form,
        setForm,
        isToPairFocused,
        errors,
        setErrors,
        fromTokenInfo,
        toTokenInfo,
        multiChainSwap,
        maxBalance,
        onSubmit,
        lastSwapResult,
        reset,
        displayMode,
        formProps,
        scriptDomain,
        swapping: {
          txStatus,
        },
        quoteResponse,
        dextra: {
          priorityFeeInETH,
          setPriorityFeeInETH,
        },
        setUserSlippage,
        transactionFee,
      }}
    >
      {children}
    </SwapContext.Provider>
  );
};
