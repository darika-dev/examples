import { Device } from 'react-native-ble-plx'
import Config from 'react-native-config'
import Keychain, { UserCredentials } from 'react-native-keychain'
import Toast from 'react-native-toast-message'
import { encodeSecp256k1Pubkey, makeSignDoc, StdSignDoc } from '@cosmjs/amino'
import { Secp256k1HdWallet } from '@cosmjs/amino/build/secp256k1hdwallet'
import { HdPath, stringToPath } from '@cosmjs/crypto'
import { LedgerSigner } from '@cosmjs/ledger-amino'
import TransportBLE from '@ledgerhq/react-native-hw-transport-ble'
import { goBack } from '@navigators'
import { t } from '@services/i18n'
import { store } from '@store'
import { AccountState } from '@types'
import {
  ERROR_LEDGER_SIGNING,
  ERROR_NO_CREDENTIALS_FOUND_FOR_KEY,
  ERROR_NO_NAMESPACES,
  TOAST_VISIBILITY_TIME,
} from '@utils/constants'
import { handleLedgerErrors } from '@utils/ledger/ledgerUtils'
import { Core } from '@walletconnect/core'
import { getSdkError } from '@walletconnect/utils'
import { IWeb3Wallet, Web3Wallet } from '@walletconnect/web3wallet'
import { CosmosApp } from '@zondax/ledger-cosmos-js'

export let wcV2Client: IWeb3Wallet
let isHandlingWalletConnectPairing = false

export const resetHandlingWalletConnectPairingFlag = () => {
  isHandlingWalletConnectPairing = false
}

export async function createV2Client() {
  resetHandlingWalletConnectPairingFlag()
  const wcCore = new Core({
    projectId: Config.WC_PROJECT_ID,
    relayUrl: Config.WC_RELAY_URL,
  })

  wcV2Client = await Web3Wallet.init({
    core: wcCore,
    metadata: {
      name: 'App',
      description: 'App description',
      url: 'https://www.google.com/',
      icons: ['https://pbs.twimg.com/profile_images/1641181817976901636/9SPaHVIi_400x400.jpg'],
    },
  })

  //await disconnectAll()
}

export const processTransaction = async (
  id,
  topic,
  messages,
  fee,
  memo,
  chainId,
  accountNumber,
  sequence,
  cosmosAccounts: AccountState[],
) => {
  let signedMessage
  const address = getAddress(messages[0])

  const accounts = cosmosAccounts.filter((account) => account.chain.chainId === chainId)
  const account = accounts[0]
  const coinType = 118
  const path: HdPath = stringToPath(`m/44'/${coinType}'/0'/0/0`)

  const signDoc: StdSignDoc = makeSignDoc(messages, fee, chainId, memo, accountNumber, sequence)

  if (!account.isLedger) {
    signedMessage = await getSignedMessageWithMnemonic(path, account, address, signDoc)
  } else {
    signedMessage = await getSignedMessageWithLedger(path, account, address, signDoc)
  }

  const response = {
    id,
    result: signedMessage,
    jsonrpc: '2.0',
  }

  const finalResponse = { topic: topic, response }
  await wcV2Client.respondSessionRequest(finalResponse)
}

const getAddress = (message) => {
  const typeToAddressMap = {
    'osmosis/lockup/lock-tokens': message.value.owner,
    'umee/leverage/MsgSupplyCollateral': message.value.supplier,
    'umee/leverage/MsgSupply': message.value.supplier,
    'umee/leverage/MsgMaxWithdraw': message.value.supplier,
    'umee/leverage/MsgCollateralize': message.value.borrower,
    'umee/leverage/MsgDecollateralize': message.value.borrower,
    'umee/leverage/MsgBorrow': message.value.borrower,
    'umee/leverage/MsgRepay': message.value.borrower,
    'umee/leverage/MsgWithdraw': message.value.supplier,
    'umee/leverage/MsgMaxBorrow': message.value.borrower,
    'umee/leverage/MsgLiquidate': message.value.liquidator,
    'cosmos-sdk/MsgDelegate': message.value.delegator_address,
    'cosmos-sdk/MsgWithdrawDelegationReward': message.value.delegator_address,
    'cosmos-sdk/MsgVote': message.value.voter,
  }

  return typeToAddressMap[message.type] || message.value.sender
}

export const handleQrCodeReadV2 = (event) => {
  const qrCodeString = event.nativeEvent.codeStringValue
  handleWalletConnectUri(qrCodeString, true)
}

export const handleWalletConnectUri = (uri, shouldGoBack = false) => {
  if (validateQRCodeData(uri) && !isHandlingWalletConnectPairing) {
    isHandlingWalletConnectPairing = true

    if (shouldGoBack) goBack()
    pairWalletConnect(uri).catch((error) => {
      resetHandlingWalletConnectPairingFlag()
    })
  } else {
    resetHandlingWalletConnectPairingFlag()
  }
}

export const disconnectAll = async () => {
  if (!wcV2Client) {
    await createV2Client()
  }
  const pendingSessions = wcV2Client.getPendingSessionProposals()
  const sessions = Object.values(pendingSessions)
  for (const session of sessions) {
    wcV2Client.rejectSession({ id: session.id, reason: getSdkError('USER_REJECTED') }).catch((error) => {})
  }

  const activeSessions = wcV2Client.getActiveSessions()
  for (const session of Object.values(activeSessions)) {
    wcV2Client.disconnectSession({ topic: session.topic, reason: getSdkError('USER_DISCONNECTED') }).catch((error) => {})
  }
}

export const validateQRCodeData = (qrcodeData) => {
  try {
    const parsedData = parseWalletConnectURI(qrcodeData)

    // Check if required fields exist
    if (
      !parsedData.bridge ||
      !parsedData.version ||
      !parsedData.parameters ||
      (!parsedData.parameters['relay-protocol'] &&
        !parsedData.parameters.relayProtocol &&
        !parsedData.parameters.bridge) ||
      (!parsedData.parameters.symKey && !parsedData.parameters.key)
    ) {
      return false
    }

    // Additional validation checks can be performed here

    return true
  } catch (error) {
    return false
  }
}

export const parseWalletConnectURI = (uri) => {
  const result = {
    bridge: '',
    version: '',
    parameters: {},
  }

  const parts = uri.split('?')

  // Parse bridge and version
  const bridgeAndVersion = parts[0].split('@')
  result.bridge = bridgeAndVersion[0].substring(3)
  result.version = bridgeAndVersion[1]

  // Parse parameters
  if (parts[1]) {
    const paramPairs = parts[1].split('&')
    paramPairs.forEach((pair) => {
      const [key, ...value] = pair.split('=')
      result.parameters[key] = value.map((v) => decodeURIComponent(v)).join('=')
    })
  }

  return result
}

export const pairWalletConnect = async (qrcodeData) => {
  if (!wcV2Client) {
    await createV2Client()
  }
  try {
    await wcV2Client.pair({ uri: qrcodeData }).then(() => {
      console.log(':::::: PAIRED :::::::')
    })
  } catch (error) {
    console.log(':::::: ERROR :::::::')
    return null
  }
  resetHandlingWalletConnectPairingFlag()
}

export async function approveV2Session(session) {
  try {
    if (!wcV2Client) {
      await createV2Client()
    }

    // Get the list of unique chainIds from the requiredNamespaces
    const uniqueChainIds = new Set()
    Object.values(session.params.requiredNamespaces).forEach((namespace) => {
      const chains = namespace.chains || []
      chains.forEach((chain) => {
        const chainId = chain.split(':')[1]
        uniqueChainIds.add(chainId)
      })
    })

    // Filter the unique chains with associated accounts
    const state = store.getState()
    const _accounts = state.accounts.cosmosAccounts as AccountState[]
    const validChains = Array.from(uniqueChainIds).filter((chainId) => {
      return _accounts.some((acc) => acc.chain.chainId === chainId)
    })

    // Create the namespaces object with valid chains only
    const namespaces = {}
    Object.keys(session.params.requiredNamespaces).forEach((key) => {
      const chains = session.params.requiredNamespaces[key].chains as string[]
      const validChainsForNamespace = chains.filter((chain) => {
        const chainId = chain.split(':')[1]
        return validChains.includes(chainId)
      })

      const accounts = validChainsForNamespace.reduce((acc, chain) => {
        const account: AccountState = _accounts.find((acc) => acc.chain.chainId === chain.split(':')[1])
        if (account) {
          acc.push(`${chain}:${account.address}`)
        }
        return acc
      }, [])

      if (accounts.length > 0) {
        namespaces[key] = {
          accounts,
          chains: validChainsForNamespace,
          methods: session.params.requiredNamespaces[key].methods,
          events: session.params.requiredNamespaces[key].events,
        }
      }
    })

    if (!namespaces || Object.keys(namespaces).length === 0) {
      throw new Error(ERROR_NO_NAMESPACES)
    }

    const sessionToApprove = {
      id: session.id,
      namespaces,
      relayProtocol: session.params.relays,
    }

    return await wcV2Client.approveSession(sessionToApprove)
  } catch (error) {
    Toast.show({
      type: 'error',
      text1: t('walletConnectSession.unsupportedNamespace'),
      visibilityTime: TOAST_VISIBILITY_TIME,
      autoHide: true,
    })
    await disconnect(session.params.pairingTopic)
    return null
  }
}

export const disconnect = async (pairingTopic) => {
  try {
    if (!wcV2Client) {
      await createV2Client()
    }
    await wcV2Client
      .disconnectSession({ topic: pairingTopic, reason: getSdkError('USER_REJECTED_METHODS') })
  } catch (error) {
    console.log('Error disconnecting session')
  }
}

/**
 * Retrieves the signed message using the mnemonic phrase stored in the Keychain.
 *
 * @param {string} path - The HD path.
 * @param {object} account - The [AccountState] object.
 * @param {string} address - The address.
 * @param {object} signDoc - The sign document.
 * @returns {Promise<string>} - The signed message.
 * @throws {Error} - Throws an error if no credentials are found for the given public key.
 */
const getSignedMessageWithMnemonic = async (path, account, address, signDoc) => {
  // Get the stored mnemonic phrase from the Keychain
  const credentials = (await Keychain.getGenericPassword({ service: account.pubKey })) as UserCredentials
  if (!credentials) {
    throw new Error(ERROR_NO_CREDENTIALS_FOUND_FOR_KEY)
  }
  const { password: mnemonic } = credentials

  const aminoWallet = await Secp256k1HdWallet.fromMnemonic(mnemonic, {
    hdPaths: [path],
    prefix: account.chain.prefix,
  })

  return await aminoWallet.signAmino(address, signDoc)
}

/**
 * Retrieves the signed message using a Ledger device.
 *
 * @param {string} path - The HD path.
 * @param {object} account - The [AccountState] object.
 * @param {string} address - The address.
 * @param {object} signDoc - The sign document.
 * @returns {Promise<string>} - The signed message.
 * @throws {Error} - Throws an error if there are any issues with the Ledger device or signing process.
 */
const getSignedMessageWithLedger = async (path, account, address, signDoc) => {
  const device: Device = await findLedgerDevice()

  // Open a BLE transport connection to the device
  const transport = await TransportBLE.open(device)
  const cosmosApp = new CosmosApp(transport)
  const appInfo = await cosmosApp.appInfo()

  if (handleLedgerErrors(appInfo)) throw new Error(ERROR_LEDGER_SIGNING)

  // Create a LedgerSigner instance with the transport and path
  const signer = new LedgerSigner(transport, {
    hdPaths: [path],
    prefix: account.chain.prefix,
  })

  return await signer.signAmino(address, signDoc)
}

const findLedgerDevice = (): Promise<Device> => {
  return new Promise((resolve, reject) => {
    TransportBLE.listen({
      complete: () => {
        reject('Listening completed without finding the device.')
      },
      next: (e) => {
        if (e.type === 'add') {
          const device: Device = e.descriptor
          resolve(device)
        }
      },
      error: (error) => {
        reject(error)
      },
    })
  })
}

export const getCosmosAccountsForWalletConnect = async (topic: string, id: number, chainId?: string) => {
  const chainIdWithoutPrefix = chainId.split(':')[1] ?? chainId
  if (!chainIdWithoutPrefix) return

  const state = store.getState()
  const _accounts = state.accounts.cosmosAccounts as AccountState[]
  const wc_accounts = []
  _accounts.forEach((account) => {
    if (chainId && account.chain.chainId !== chainIdWithoutPrefix) return

    const pkUint8Array: Uint8Array = new Uint8Array(Buffer.from(account.pubKey, 'hex'))
    const pk = encodeSecp256k1Pubkey(pkUint8Array).value

    wc_accounts.push({
      algo: 'secp256k1',
      address: account.address,
      pubkey: pk,
    })
  })

  const response = {
    id,
    result: wc_accounts,
    jsonrpc: '2.0',
  }

  const requestResponse = { topic, response }

  await wcV2Client.respondSessionRequest(requestResponse)
}
