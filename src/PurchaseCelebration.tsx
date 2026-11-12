import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import type { Resource } from './game';
import { colors, GameButton, ResourceIcon, resourceNames } from './ui';

type Props = {
  title: string;
  items: Resource[];
  message?: string;
  error?: string;
  busy: boolean;
  onCollect: () => void;
  onCheer: () => void;
};

export default function PurchaseCelebration({
  title,
  items,
  message,
  error,
  busy,
  onCollect,
  onCheer,
}: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = height < 740;
  const [reducedMotion, setReducedMotion] = useState(true);
  const [active, setActive] = useState(AppState.currentState !== 'background');
  const reveal = useRef(new Animated.Value(1)).current;
  const burst = useRef(new Animated.Value(1)).current;

  const celebrate = useCallback(() => {
    if (reducedMotion || !active) return;
    burst.stopAnimation();
    burst.setValue(0);
    Animated.timing(burst, {
      toValue: 1,
      duration: 1500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [active, burst, reducedMotion]);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReducedMotion(value);
    });
    const motion = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );
    const app = AppState.addEventListener('change', (state) =>
      setActive(state === 'active'),
    );
    return () => {
      mounted = false;
      motion.remove();
      app.remove();
    };
  }, []);

  useEffect(() => {
    if (active && !reducedMotion) {
      reveal.setValue(0);
      Animated.timing(reveal, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      celebrate();
    } else {
      reveal.stopAnimation();
      burst.stopAnimation();
      reveal.setValue(1);
      burst.setValue(1);
    }
    return () => {
      reveal.stopAnimation();
      burst.stopAnimation();
    };
  }, [active, reducedMotion, celebrate, reveal, burst]);

  return (
    <View
      style={StyleSheet.absoluteFill}
      testID="purchase-celebration"
      accessibilityViewIsModal
    >
      <LinearGradient
        pointerEvents="none"
        colors={['#061324b8', '#07162500', '#07162500', '#061322f2']}
        locations={[0, 0.22, 0.62, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length: 18 }, (_, index) => {
          const angle = (index / 18) * Math.PI * 2;
          const distance =
            Math.min(width * 0.53, 210) * (0.72 + (index % 3) * 0.13);
          return (
            <Animated.View
              key={index}
              style={[
                s.spark,
                {
                  backgroundColor: index % 3 ? '#f3d58b' : '#90f2df',
                  opacity: burst.interpolate({
                    inputRange: [0, 0.1, 0.7, 1],
                    outputRange: [0, 1, 0.8, 0],
                  }),
                  transform: [
                    {
                      translateX: burst.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, Math.cos(angle) * distance],
                      }),
                    },
                    {
                      translateY: burst.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, Math.sin(angle) * distance * 0.8 + 34],
                      }),
                    },
                    { rotate: `${index * 37}deg` },
                    {
                      scale: burst.interpolate({
                        inputRange: [0, 0.2, 1],
                        outputRange: [0.4, 1.2, 0.2],
                      }),
                    },
                  ],
                },
              ]}
            />
          );
        })}
      </View>
      <View
        style={[
          s.safe,
          {
            paddingTop: insets.top,
            paddingBottom: Math.max(insets.bottom, 12),
            paddingLeft: Math.max(insets.left, 21),
            paddingRight: Math.max(insets.right, 21),
          },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            s.heading,
            compact && { paddingTop: 10 },
            {
              opacity: reveal,
              transform: [
                {
                  translateY: reveal.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-12, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={s.successSeal}>
            <Icon name="check-bold" size={23} color="#183e35" />
          </View>
          <Text style={[s.title, compact && { fontSize: 25 }]}>{title}</Text>
        </Animated.View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Celebrate with Orin"
          testID="celebration-stage"
          onPress={() => {
            onCheer();
            celebrate();
          }}
          style={s.stage}
        >
          <Text style={s.stageHint}>Tap Orin to celebrate</Text>
        </Pressable>
        <Animated.View
          style={[
            s.rewardPanel,
            {
              maxHeight: height * 0.34,
              opacity: reveal,
              transform: [
                {
                  translateY: reveal.interpolate({
                    inputRange: [0, 1],
                    outputRange: [18, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <ScrollView
            style={s.rewardScroll}
            contentContainerStyle={s.rewardContent}
            showsVerticalScrollIndicator={false}
          >
            {items.length > 0 && (
              <View style={s.rewards}>
                {items.map((item, index) => (
                  <View style={s.reward} key={`${item.resource_id}-${index}`}>
                    <ResourceIcon
                      kind={item.resource_id}
                      size={compact ? 25 : 29}
                    />
                    <Text style={[s.rewardText, compact && { fontSize: 25 }]}>
                      +{item.quantity}{' '}
                      {resourceNames[item.resource_id] || item.resource_id}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            {message && <Text style={s.message}>{message}</Text>}
            {error && (
              <Text style={s.error} accessibilityRole="alert">
                {error}
              </Text>
            )}
          </ScrollView>
          <GameButton title="COLLECT" busy={busy} onPress={onCollect} />
        </Animated.View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: 21,
    paddingBottom: 12,
  },
  heading: { alignItems: 'center', paddingTop: 22, gap: 10 },
  successSeal: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#bbe2bb',
    borderWidth: 2,
    borderColor: '#efd292',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.cream,
    fontFamily: 'Cinzel',
    fontSize: 29,
    lineHeight: 37,
    textAlign: 'center',
    textShadowColor: '#0a1722',
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 4,
  },
  stage: {
    flex: 1,
    minHeight: 100,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 13,
  },
  stageHint: {
    color: '#f2dfb9',
    fontFamily: 'Barlow',
    fontSize: 16,
    textShadowColor: '#071520',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  spark: {
    position: 'absolute',
    left: '50%',
    top: '42%',
    width: 5,
    height: 12,
    marginLeft: -2,
    borderRadius: 2,
  },
  rewardPanel: {
    borderTopWidth: 1,
    borderColor: '#e0bd72',
    backgroundColor: '#102a32ed',
    borderRadius: 15,
    padding: 12,
    gap: 10,
  },
  rewardScroll: { flexShrink: 1 },
  rewardContent: { gap: 8 },
  rewards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 17,
    rowGap: 7,
    paddingTop: 3,
  },
  reward: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  rewardText: { color: colors.cream, fontFamily: 'Barlow', fontSize: 28 },
  message: {
    color: '#c3d8d4',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  error: {
    color: '#f4bd9b',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
