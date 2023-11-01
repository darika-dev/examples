// Splash screen animation (React Native)

import type { PropsWithChildren } from 'react'
import { useEffect, useState } from 'react'
import { LayoutRectangle, Platform, StyleSheet } from 'react-native'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import { useTheme } from 'native-base'

type ScaleOutProps = PropsWithChildren<{
  animationDuration?: number
  isToValue?: boolean
  toValue?: LayoutRectangle | null
}>

export const AnimatedSplash = ({ animationDuration = 1000, toValue, isToValue = false }: ScaleOutProps) => {
  const {
    colors: { primary },
  } = useTheme()

  const [isLoading, setIsLoading] = useState(true)
  const [screenSize, setScreenSize] = useState()
  const scaleX = useSharedValue(1)
  const scaleY = useSharedValue(1)
  const translateY = useSharedValue(0)
  const opacity = useSharedValue(0.95)

  const animatedScaleStyle = useAnimatedStyle(() => {
    if (!screenSize) {
      return {}
    }

    return {
      transform: [{ scaleX: scaleX.value }, { scaleY: scaleY.value }],
    }
  })

  const animatedTranslateStyle = useAnimatedStyle(() => {
    if (!screenSize) {
      return {}
    }

    return {
      opacity: opacity.value,
      transform: [{ scaleY: -1 }, { translateY: translateY.value }],
    }
  })

  const config = { duration: animationDuration }
  const DEFAULT_ANCHOR_POINT = 0.5
  const ANCHOR_POINT = 1
  const ANCHOR_OFFSET = Platform.OS === 'ios' ? 98 : 64

  const handleFinishAnimation = (isFinished) => {
    setIsLoading(!isFinished)
  }

  useEffect(() => {
    if (!screenSize || !isLoading) {
      return
    }
    if (isToValue && !toValue) {
      return
    }
    setTimeout(() => {
      opacity.value = withDelay(
        animationDuration,
        withTiming(0, { duration: animationDuration / 2 }, (isFinished) => {
          runOnJS(handleFinishAnimation)(isFinished)
        }),
      )
      const scaleXToValue = isToValue ? (toValue.width - 5) / screenSize.width : 0
      const scaleYToValue = isToValue ? toValue.height / screenSize.height : 0
      const translateYToValue = isToValue
        ? screenSize.height * (DEFAULT_ANCHOR_POINT - ANCHOR_POINT) +
          toValue.height * DEFAULT_ANCHOR_POINT +
          ANCHOR_OFFSET
        : screenSize.height * (DEFAULT_ANCHOR_POINT - ANCHOR_POINT)
      scaleX.value = withTiming(scaleXToValue, config)
      scaleY.value = withTiming(scaleYToValue, config)
      translateY.value = withTiming(translateYToValue, config)
    }, 2700)
  }, [screenSize, toValue])

  if (!isLoading) {
    return null
  }

  return (
    <Animated.View // Special animatable View
      style={[styles.container, animatedTranslateStyle]}
      onLayout={(event) => {
        setScreenSize(event.nativeEvent.layout)
      }}
    >
      <Animated.View style={[{ backgroundColor: primary[500] }, styles.inner, animatedScaleStyle]}></Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  inner: {
    height: '100%',
    width: '100%',
  },
})
