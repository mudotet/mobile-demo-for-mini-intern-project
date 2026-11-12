import React, { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import type { DailyOffer, Resource, StaticOffer } from './game';

export const colors = {
  ink: '#101e20',
  panel: '#19332f',
  gold: '#efc877',
  cream: '#fff2d3',
  muted: '#adc1b1',
  green: '#91d1ab',
  border: '#947349',
};
export const resourceNames: Record<string, string> = {
  gold: 'Gold',
  gem: 'Gems',
  xp: 'XP',
  expbp: 'EXPBP',
};
export const packageNames: Record<string, string> = {
  xp_gold: 'Scholar’s Spark',
  xp_gem: 'Arcane Wisdom',
  gold_small: 'Merchant’s Purse',
  gold_large: 'Royal Treasury',
  gem_small: 'Crystal Shards',
  gem_large: 'Gemstone Cache',
};
const icons = {
  gold: 'gold',
  gem: 'diamond-stone',
  xp: 'star-four-points',
  expbp: 'star-four-points',
} as const;
const tones: Record<string, string> = {
  gold: '#f4c667',
  gem: '#9ee1ce',
  xp: '#c6acff',
  expbp: '#efc877',
};

export function ResourceIcon({
  kind,
  size = 24,
}: {
  kind: string;
  size?: number;
}) {
  return (
    <Icon
      name={icons[kind as keyof typeof icons] || 'star-four-points'}
      size={size}
      color={tones[kind] || colors.gold}
    />
  );
}

export function GameButton({
  title,
  onPress,
  disabled,
  busy,
  secondary = false,
  testID,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  secondary?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondaryButton,
        disabled && s.disabled,
        pressed && s.pressed,
      ]}
    >
      <LinearGradient
        colors={secondary ? ['#294b40', '#19352f'] : ['#f6d58a', '#c9903d']}
        style={s.buttonFill}
      >
        {busy ? (
          <ActivityIndicator color={secondary ? colors.gold : '#382512'} />
        ) : (
          <Text style={[s.buttonText, secondary && { color: colors.cream }]}>
            {title}
          </Text>
        )}
      </LinearGradient>
    </Pressable>
  );
}

export function Wallet({ resources }: { resources: Resource[] }) {
  return (
    <View style={s.wallet}>
      {['gold', 'gem', 'xp'].map((kind) => (
        <View
          key={kind}
          style={s.walletCell}
          accessibilityLabel={`${resourceNames[kind]} ${resources.find((r) => r.resource_id === kind)?.quantity || '0'}`}
        >
          <ResourceIcon kind={kind} size={23} />
          <View>
            <Text style={s.walletLabel}>{resourceNames[kind]}</Text>
            <Text style={s.walletValue} testID={`wallet-${kind}`}>
              {resources.find((r) => r.resource_id === kind)?.quantity || '0'}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function RewardList({ items }: { items: Record<string, number> }) {
  return (
    <View style={s.rewards}>
      {Object.entries(items).map(([kind, quantity]) => (
        <View style={s.reward} key={kind}>
          <ResourceIcon kind={kind} size={26} />
          <Text style={s.rewardText}>
            +{quantity} {resourceNames[kind] || kind}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function OfferCard({
  offer,
  daily,
  disabled,
  onBuy,
}: {
  offer: StaticOffer | DailyOffer;
  daily?: boolean;
  disabled: boolean;
  onBuy: () => void;
}) {
  const day = daily ? (offer as DailyOffer) : null;
  const price = day ? day.final_price : (offer as StaticOffer).price;
  const [currency, amount] = Object.entries(price.currency)[0] || ['gold', 0];
  const kind = Object.keys(offer.items)[0] || 'xp';
  const soldOut = day !== null && day.remaining <= 0;
  return (
    <View style={[s.offer, daily && s.dailyOffer, soldOut && s.soldOut]}>
      {day && (
        <View style={s.offerTop}>
          <Text style={s.remaining}>
            {day.remaining}/{day.purchase_limit} LEFT
          </Text>
          <Text style={s.discount}>−{day.discount_percent}%</Text>
        </View>
      )}
      <LinearGradient
        colors={
          kind === 'gem'
            ? ['#204b47', '#172c2a']
            : kind === 'xp'
              ? ['#3c3652', '#222b2e']
              : ['#51412a', '#292d25']
        }
        style={s.itemArt}
      >
        <View style={s.itemHalo}>
          <ResourceIcon kind={kind} size={daily ? 45 : 53} />
        </View>
        <Text style={s.itemQuantity}>{Object.values(offer.items)[0]}</Text>
      </LinearGradient>
      <Text style={s.offerName} numberOfLines={2}>
        {packageNames[offer.package_id] || offer.package_id.replace(/_/g, ' ')}
      </Text>
      {day && (
        <Text style={s.oldPrice}>
          {Object.values(day.original_price.currency)[0]}{' '}
          {resourceNames[currency]}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Buy ${packageNames[offer.package_id] || offer.package_id} for ${amount} ${resourceNames[currency]}`}
        accessibilityState={{ disabled: disabled || soldOut }}
        disabled={disabled || soldOut}
        onPress={onBuy}
        style={({ pressed }) => [
          s.buyButton,
          soldOut && s.disabled,
          pressed && s.pressed,
        ]}
      >
        <LinearGradient
          colors={soldOut ? ['#3b4940', '#29362f'] : ['#517f56', '#2e5e43']}
          style={s.buyFill}
        >
          {soldOut ? (
            <Text style={s.buyText}>SOLD OUT</Text>
          ) : (
            <>
              <ResourceIcon kind={currency} size={19} />
              <Text style={s.buyText}>{amount}</Text>
            </>
          )}
        </LinearGradient>
      </Pressable>
    </View>
  );
}

export function GameModal({
  visible,
  title,
  children,
  onClose,
  busy,
  docked = false,
}: {
  visible: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  docked?: boolean;
}) {
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={[s.modalBackdrop, docked && s.dockedBackdrop]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.modalPanel} accessibilityViewIsModal>
          <View style={s.modalHeading}>
            <Text style={s.modalTitle}>{title}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close dialog"
              disabled={busy}
              onPress={onClose}
              style={s.close}
            >
              <Icon name="close" size={24} color={colors.gold} />
            </Pressable>
          </View>
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.modalBody}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  button: {
    borderWidth: 1,
    borderColor: '#ffe3a0',
    borderRadius: 13,
    overflow: 'hidden',
    borderBottomWidth: 4,
    borderBottomColor: '#76542c',
    minHeight: 54,
  },
  secondaryButton: { borderColor: '#6c9274', borderBottomColor: '#0a2019' },
  buttonFill: {
    paddingHorizontal: 24,
    paddingVertical: 13,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontFamily: 'Barlow',
    fontSize: 23,
    letterSpacing: 1,
    color: '#362510',
  },
  pressed: { opacity: 0.8, transform: [{ translateY: 2 }] },
  disabled: { opacity: 0.45 },
  wallet: {
    flexDirection: 'row',
    backgroundColor: '#102a27',
    borderWidth: 1,
    borderColor: '#7d714e',
    borderRadius: 14,
    paddingVertical: 9,
  },
  walletCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  walletLabel: {
    color: colors.muted,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  walletValue: {
    color: colors.cream,
    fontFamily: 'Barlow',
    fontSize: 24,
    lineHeight: 25,
  },
  rewards: { gap: 12, alignItems: 'center', paddingVertical: 18 },
  reward: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  rewardText: { fontFamily: 'Barlow', fontSize: 29, color: colors.cream },
  offer: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#1e302c',
    borderWidth: 1,
    borderColor: '#816a43',
    borderRadius: 12,
    padding: 8,
    borderBottomWidth: 4,
    borderBottomColor: '#0a1715',
  },
  dailyOffer: { borderColor: '#b28c4e', padding: 6 },
  soldOut: { opacity: 0.65 },
  offerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 2,
    minHeight: 23,
  },
  remaining: { fontFamily: 'Barlow', fontSize: 12, color: '#d4dec4' },
  discount: { fontFamily: 'Barlow', fontSize: 14, color: colors.gold },
  itemArt: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    minHeight: 105,
    paddingTop: 10,
    borderWidth: 1,
    borderColor: '#ffffff0b',
  },
  itemHalo: {
    height: 60,
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ffffff18',
    borderRadius: 30,
    backgroundColor: '#ffffff06',
    transform: [{ rotate: '-8deg' }],
  },
  itemQuantity: {
    fontFamily: 'Barlow',
    fontSize: 27,
    color: colors.cream,
    marginTop: 2,
  },
  offerName: {
    fontFamily: 'Barlow',
    fontSize: 18,
    color: '#e9dabb',
    textAlign: 'center',
    height: 44,
    marginTop: 8,
    lineHeight: 21,
  },
  oldPrice: {
    fontSize: 11,
    textAlign: 'center',
    color: '#a8b4a3',
    textDecorationLine: 'line-through',
    marginBottom: 6,
  },
  buyButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#83a979',
    borderRadius: 7,
    overflow: 'hidden',
  },
  buyFill: {
    flex: 1,
    minHeight: 43,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  buyText: { fontFamily: 'Barlow', fontSize: 22, color: '#f5f5d5' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#020b0cce',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  dockedBackdrop: {
    justifyContent: 'flex-end',
    backgroundColor: '#020b0c22',
    paddingBottom: 28,
  },
  modalPanel: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    backgroundColor: '#19322e',
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 20,
    overflow: 'hidden',
    borderBottomWidth: 5,
    borderBottomColor: '#80663b',
  },
  modalHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 22,
    borderBottomWidth: 1,
    borderBottomColor: '#536047',
  },
  modalTitle: {
    flex: 1,
    fontFamily: 'Barlow',
    fontSize: 30,
    color: colors.cream,
  },
  close: { padding: 16, minWidth: 48, minHeight: 48 },
  modalBody: { padding: 22, gap: 14 },
});
