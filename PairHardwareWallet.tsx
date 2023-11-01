// connect to Ledger (React Native)

import { useEffect, useState } from 'react'
// eslint-disable-next-line react-native/split-platform-components
import { Platform } from 'react-native'
import { Button, Text } from '@components'
import { ButtonColorScheme, ButtonSize, ButtonStyleVariant } from '@components/Button/Button.props'
import { useGlobalSheetContext } from '@components/GlobalSheet/context'
import { SHEET_TYPE } from '@components/GlobalSheet/types'
import TransportHID from '@ledgerhq/react-native-hid'
import TransportBLE from '@ledgerhq/react-native-hw-transport-ble'
import type { BaseNavigationProp } from '@navigators/types'
import { OnboardingScreens } from '@screens/Screens'
import { getFirestoreProfile } from '@services/firebase'
import { t } from '@services/i18n'
import { handleLedgerErrors } from '@utils/ledger/ledgerUtils'
import { requestBLEPermissionsForAndroid } from '@utils/permissionUtils'
import { CosmosApp } from '@zondax/ledger-cosmos-js'
import { VStack } from 'native-base'
import { Observable } from 'rxjs'

type Props = {
  navigation: BaseNavigationProp
}

type deviceProps = {
  name: string
  id: string
}

export const PairHardwareWallet = ({ navigation }: Props) => {
  const { closeSheet } = useGlobalSheetContext()
  const [devices, setDevices] = useState([])
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(false)
  const [sub, setSub] = useState(null)
  //const PATH = [44, 118, 5, 0, 3]
  const COSMOS_PATH = [44, 118, 0, 0, 0] // first account (0/0/0) of the Cosmos blockchain (44'/118')
  //const BECH32PREFIX = 'umee'

  const deviceAddition = (device: deviceProps) => {
    return devices.some((i) => i.id === device.id) ? devices : devices.concat(device)
  }

  const startScan = () => {
    console.log('startScan')
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const observable = new Observable(TransportBLE.listen).subscribe({
      complete: () => {
        //does nothing
      },
      next: (e: { descriptor: deviceProps; type: string }) => {
        if (e.type === 'add') {
          const newDevicesList = deviceAddition(e.descriptor)
          setDevices(newDevicesList)
        }
        // NB there is no "remove" case in BLE.
      },
      error: (error) => {
        console.log('error', error)
        setError(error)
      },
    })
    setSub(observable)
  }

  const reload = () => {
    if (sub) {
      sub.unsubscribe()
    }
    setDevices([])
    setError(null)
    startScan()
  }

  const selectDevice = async (device: deviceProps) => {
    try {
      const transport = device ? await TransportBLE.open(device.id) : await TransportHID.create()

      const cosmosApp = new CosmosApp(transport)
      const appInfo = await cosmosApp.appInfo()

      if (handleLedgerErrors(appInfo)) {
        console.log('handleLedgerErrors error handled')
        return null
      }

      const { compressed_pk, bech32_address } = await cosmosApp.getAddressAndPubKey(COSMOS_PATH, 'umee')

      const publicKeyHex = compressed_pk.toString('hex')
      const profile = await getFirestoreProfile(bech32_address)
      console.log('profile:', profile)
      console.log('publicKey Hex:', publicKeyHex)
      return { profile, pubKey: publicKeyHex }
    } catch (e) {
      console.log('selectDevice ERROR: ', error)
      setError(error)
      throw error
    }
  }

  const onSelectDevice = async (device?: deviceProps) => {
    setPending(true)
    setError(null)
    try {
      const app = await selectDevice(device)
      setPending(false)
      closeSheet(SHEET_TYPE.PAIR_WALLET)
      if (app.profile) {
        navigation.navigate(OnboardingScreens.WelcomeBack, {
          username: app.profile.username,
          publicKey: app.pubKey,
          variant: 'importSeed',
        })
      } else {
        navigation.navigate(OnboardingScreens.NickHandler, { publicKey: app.pubKey, variant: 'importSeed' })
      }
    } catch (error) {
      setError(error)
      setPending(false)
    }
  }

  useEffect(() => {
    if (Platform.OS === 'android') {
      requestBLEPermissionsForAndroid()
    }

    let previousAvailable = false
    const observeState = () => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      new Observable(TransportBLE.observeState).subscribe((e: { available: boolean }) => {
        if (e.available !== previousAvailable) {
          previousAvailable = e.available
          if (e.available) {
            reload()
          }
        }
      })
    }
    observeState()

    return () => {
      if (sub) {
        sub.unsubscribe()
      }
    }
  }, [])

  return (
    <VStack p="4" pt="8">
      <Text textAlign="center" variant="h3">
        {t('pairHardwareWallet.title')}
      </Text>
      <Text mt="m" variant={'caption'}>
        {t('pairHardwareWallet.step1')}
      </Text>
      <Text mt="s" variant={'caption'}>
        {t('pairHardwareWallet.step2')}
      </Text>

      <VStack mt="xl">
        {devices.length === 0 && (
          <VStack space="md">
            <Text variant={'caption'} textAlign="center" color="primary">
              {t('importLedgerScreen.scanning')}
            </Text>
            <Button
              disabled={pending}
              variant={ButtonStyleVariant.Unstyled}
              colorScheme={ButtonColorScheme.Gray}
              label={t('pairHardwareWallet.connectWithUsb')}
              onPress={() => onSelectDevice()}
            />
          </VStack>
        )}
        {devices.map((device: deviceProps) => (
          <Button
            key={device.id}
            disabled={pending}
            variant={ButtonStyleVariant.UnstyledBold}
            size={ButtonSize.Large}
            label={device.name}
            onPress={() => onSelectDevice(device)}
          />
        ))}
      </VStack>
      {pending && (
        <VStack>
          <Text variant={'caption'} color="off" textAlign="center">
            {t('pairHardwareWallet.waiting')}
          </Text>
        </VStack>
      )}
      {error && (
        <VStack mt="xl">
          <Text variant={'caption'} color="danger" textAlign="center">
            {String(error.message)}
          </Text>
        </VStack>
      )}
    </VStack>
  )
}
