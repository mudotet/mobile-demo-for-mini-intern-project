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
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import type { DailyOffer, Resource, StaticOffer } from './game';

export const colors = {
  ink: '#141b18',
  panel: '#222b24',
  gold: '#d7b77a',
  cream: '#f3eddf',
  muted: '#afb4a4',
  green: '#a6c8ad',
  border: '#4c5141',
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
  gold: '#dfbd77',
  gem: '#a3d2bd',
  xp: '#c5bfdb',
  expbp: '#d7b77a',
};

export function ResourceIcon({
  kind,
  size = 24,
  color,
}: {
  kind: string;
  size?: number;
  color?: string;
}) {
  return (
    <Icon
      name={icons[kind as keyof typeof icons] || 'star-four-points'}
      size={size}
      color={color || tones[kind] || colors.gold}
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
      <View style={[s.buttonFill, secondary && s.secondaryFill]}>
        {busy ? (
          <ActivityIndicator color={secondary ? colors.gold : '#382512'} />
        ) : (
          <Text style={[s.buttonText, secondary && { color: colors.cream }]}>
            {title}
          </Text>
        )}
      </View>
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
          <ResourceIcon kind={kind} size={20} />
          <View style={s.walletCopy}>
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
      <View style={[s.itemArt, daily && s.dailyArt]}>
        <View style={s.itemHalo}>
          <ResourceIcon kind={kind} size={daily ? 42 : 32} />
        </View>
      </View>
      <View style={s.offerInfo}>
        {day && (
          <View style={s.offerTop}>
            <Text style={s.discount}>−{day.discount_percent}%</Text>
            <Text style={s.remaining}>
              {day.remaining}/{day.purchase_limit} LEFT
            </Text>
          </View>
        )}
        <Text style={s.offerName}>
          {packageNames[offer.package_id] ||
            offer.package_id.replace(/_/g, ' ')}
        </Text>
        {Object.entries(offer.items).map(([resource, quantity]) => (
          <Text key={resource} style={s.itemQuantity}>
            {quantity}{' '}
            <Text style={s.itemKind}>
              {resourceNames[resource] || resource}
            </Text>
          </Text>
        ))}
      </View>
      <View style={s.offerPrice}>
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
          <View style={s.buyFill}>
            {soldOut ? (
              <Text style={s.buyText}>SOLD OUT</Text>
            ) : (
              <>
                <ResourceIcon kind={currency} size={19} />
                <Text style={s.buyText}>{amount}</Text>
              </>
            )}
          </View>
        </Pressable>
      </View>
    </View>
  );
}

export function GameModal({
  visible,
  title,
  children,
  onClose,
  busy,
}: {
  visible: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
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
        style={s.modalBackdrop}
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
    borderRadius: 3,
    overflow: 'hidden',
    minHeight: 52,
  },
  secondaryButton: { borderWidth: 1, borderColor: colors.border },
  buttonFill: {
    backgroundColor: colors.gold,
    paddingHorizontal: 18,
    paddingVertical: 13,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryFill: { backgroundColor: '#293229' },
  buttonText: {
    fontFamily: 'Barlow',
    fontSize: 21,
    letterSpacing: 1,
    textAlign: 'center',
    color: '#24281f',
  },
  pressed: { opacity: 0.8, transform: [{ translateY: 1 }] },
  disabled: { opacity: 0.45 },
  wallet: {
    flexDirection: 'row',
    backgroundColor: '#151e19e8',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#b8ac7833',
    paddingVertical: 8,
  },
  walletCell: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 4,
  },
  walletCopy: { flexShrink: 1 },
  walletLabel: {
    color: colors.muted,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  walletValue: {
    color: colors.cream,
    fontFamily: 'Barlow',
    fontSize: 21,
    fontVariant: ['tabular-nums'],
  },
  rewards: { gap: 12, alignItems: 'center', paddingVertical: 18 },
  reward: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  rewardText: { fontFamily: 'Barlow', fontSize: 29, color: colors.cream },
  offer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
    backgroundColor: '#202a22f5',
    borderBottomWidth: 1,
    borderColor: '#c2b28029',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  dailyOffer: {
    backgroundColor: '#2c3327f5',
    borderLeftWidth: 2,
    borderLeftColor: colors.gold,
    paddingVertical: 16,
  },
  soldOut: { opacity: 0.65 },
  offerTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 7,
    marginBottom: 4,
  },
  remaining: {
    fontFamily: 'Barlow',
    fontSize: 11,
    letterSpacing: 0.5,
    color: colors.muted,
  },
  discount: { fontFamily: 'Barlow', fontSize: 13, color: colors.gold },
  itemArt: {
    width: 48,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dailyArt: { width: 54, minHeight: 70 },
  itemHalo: {
    height: 48,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#c2b28009',
    borderWidth: 1,
    borderColor: '#c2b28022',
    borderRadius: 4,
    transform: [{ rotate: '-8deg' }],
  },
  offerInfo: { flex: 1, minWidth: 0 },
  itemQuantity: {
    fontFamily: 'Barlow',
    fontSize: 24,
    color: colors.cream,
    marginTop: 3,
  },
  itemKind: { fontSize: 14, color: colors.muted },
  offerName: {
    fontFamily: 'Barlow',
    fontSize: 20,
    color: colors.cream,
    lineHeight: 23,
  },
  offerPrice: { width: 76, gap: 5 },
  oldPrice: {
    fontSize: 10,
    textAlign: 'center',
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  buyButton: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#a99a6a',
    borderRadius: 3,
    overflow: 'hidden',
  },
  buyFill: {
    backgroundColor: '#394433',
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 5,
    gap: 5,
  },
  buyText: {
    fontFamily: 'Barlow',
    fontSize: 21,
    color: colors.cream,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#101610df',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalPanel: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    backgroundColor: colors.panel,
    borderTopWidth: 3,
    borderColor: colors.gold,
    borderRadius: 4,
    overflow: 'hidden',
  },
  modalHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    flex: 1,
    fontFamily: 'Cinzel',
    fontSize: 22,
    color: colors.cream,
    paddingVertical: 16,
  },
  close: { padding: 16, minWidth: 48, minHeight: 48 },
  modalBody: { padding: 20, gap: 14 },
});
