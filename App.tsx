// Remount the native GL tree when this screen is edited during development.
// @refresh reset
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GameClient,
  GameError,
  normalizeServerUrl,
  type DailyOffer,
  type PlayerData,
  type PurchaseReceipt,
  type ShopData,
  type StaticOffer,
} from './src/game';
import { gameStorage, newRequestId } from './src/storage';
import DealerScene, { type DealerPointer } from './src/dealer/DealerScene';
import type { DealerReaction } from './src/dealer/world';
import BattlePassScreen from './src/BattlePassScreen';
import PurchaseCelebration from './src/PurchaseCelebration';
import type { BattlePassAction, BattlePassState } from './src/battlepass';
import {
  colors,
  GameButton,
  GameModal,
  OfferCard,
  packageNames,
  ResourceIcon,
  resourceNames,
  RewardList,
  Wallet,
} from './src/ui';

const addressKey = 'ember-and-rune.server';
const dealerGreetings = [
  { reaction: 'wave', dialogue: 'Welcome to my shop!' },
  { reaction: 'bow', dialogue: 'Orin, at your service. Mind the hat.' },
  {
    reaction: 'chuckle',
    dialogue: 'Ha! Even my bargains have a little charm.',
  },
  { reaction: 'flourish', dialogue: 'A little magic, just for you.' },
] as const;
type SelectedOffer = { offer: StaticOffer | DailyOffer; daily: boolean };
type RewardReceipt = Pick<PurchaseReceipt, 'items' | 'resources'> & {
  title: string;
  message?: string;
};

function defaultServer() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  if (Platform.OS === 'web' && typeof window !== 'undefined')
    return window.location.origin;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host || 'localhost'}:8080`;
}

function errorMessage(error: unknown) {
  if (error instanceof GameError) {
    const messages: Record<string, string> = {
      INSUFFICIENT_FUNDS:
        'Your pouch is a little light. You need more currency for this offer.',
      PURCHASE_LIMIT:
        'You have claimed every available purchase of this daily offer. Return after the daily refresh.',
      OFFER_EXPIRED:
        'The daily collection has changed. Refresh the shop to discover the new offers.',
      PURCHASE_PENDING:
        'Your last action is awaiting confirmation. Check it before continuing.',
      INSUFFICIENT_EXPBP:
        'Complete daily quests and claim their EXPBP to reach this milestone.',
      PREMIUM_REQUIRED: 'Unlock Premium to collect this reward.',
      ALREADY_CLAIMED:
        'This reward has already been collected. Refresh to see the latest progress.',
      ALREADY_PREMIUM: 'Premium is already active for this season.',
      QUEST_INCOMPLETE:
        'Complete the required trades in the Shop before claiming this quest.',
      PASS_EXPIRED:
        'A new season has begun. Refresh the Battle Pass to see its rewards.',
      QUEST_EXPIRED:
        'The daily quests have refreshed. Open the latest quests to continue.',
    };
    return messages[error.code] || error.message;
  }
  return error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.';
}

function countdown(shop: ShopData | null, syncedAt: number, now: number) {
  if (!shop) return 'Refreshing…';
  const seconds = Math.max(
    0,
    Number(shop.daily.expires_at) -
      Number(shop.daily.server_time) -
      Math.floor((now - syncedAt) / 1000),
  );
  if (!seconds) return 'Refresh available';
  return `${Math.floor(seconds / 3600)}h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}m ${String(seconds % 60).padStart(2, '0')}s`;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Game />
    </SafeAreaProvider>
  );
}

function Game() {
  const { width, height } = useWindowDimensions();
  const pointer = useRef<DealerPointer>({ x: 0, y: 0 });
  const gestureStart = useRef({ x: 0, y: 0 });
  const didDrag = useRef(false);
  const gestureSize = useRef({ width, height });
  const [dealer, setDealer] = useState<{
    greeting: number;
    reaction: DealerReaction;
    dialogue: string;
  }>({
    greeting: 1,
    reaction: 'wave',
    dialogue: 'Every rune has a story. Let’s find yours.',
  });
  const [celebration, setCelebration] = useState(0);
  const gesture = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, movement) =>
        movement.numberActiveTouches <= 1 &&
        Math.abs(movement.dx) > 6 &&
        Math.abs(movement.dx) > Math.abs(movement.dy),
      onMoveShouldSetPanResponder: (_, movement) =>
        movement.numberActiveTouches <= 1 &&
        Math.abs(movement.dx) > 6 &&
        Math.abs(movement.dx) > Math.abs(movement.dy),
      onPanResponderGrant: () => {
        didDrag.current = true;
        gestureStart.current = {
          x: pointer.current.x,
          y: pointer.current.y,
        };
      },
      onPanResponderMove: (_, movement) => {
        if (movement.numberActiveTouches > 1) return;
        pointer.current.x = Math.max(
          -1,
          Math.min(
            1,
            gestureStart.current.x +
              (movement.dx / Math.max(1, gestureSize.current.width)) * 2,
          ),
        );
        pointer.current.y = Math.max(
          -1,
          Math.min(
            1,
            gestureStart.current.y +
              movement.dy / Math.max(1, gestureSize.current.height),
          ),
        );
        pointer.current.invalidate?.();
      },
      onPanResponderTerminate: () => {
        pointer.current.x = gestureStart.current.x;
        pointer.current.y = gestureStart.current.y;
        pointer.current.invalidate?.();
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;
  const [fontsLoaded, fontError] = useFonts({
    Barlow: require('./assets/BarlowCondensed-Bold.ttf'),
    Cinzel: require('./assets/Cinzel.ttf'),
  });
  const [screen, setScreen] = useState<'home' | 'shop' | 'pass'>('home');
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [shop, setShop] = useState<ShopData | null>(null);
  const [pass, setPass] = useState<BattlePassState | null>(null);
  const [passSyncedAt, setPassSyncedAt] = useState(Date.now());
  const [premiumConfirmation, setPremiumConfirmation] =
    useState<BattlePassState | null>(null);
  const [server, setServer] = useState(defaultServer);
  const [address, setAddress] = useState(defaultServer);
  const [settings, setSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Opening the gates…');
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectedOffer | null>(null);
  const [receipt, setReceipt] = useState<RewardReceipt | null>(null);
  const [pendingAction, setPendingAction] = useState<
    'purchase' | 'pass' | null
  >(null);
  const pending = pendingAction !== null;
  const [now, setNow] = useState(Date.now());
  const [syncedAt, setSyncedAt] = useState(Date.now());
  const client = useRef<GameClient | null>(null);
  const working = useRef(false);

  function showShop(data: ShopData) {
    setShop(data);
    setSyncedAt(Date.now());
  }

  function showPass(data: BattlePassState) {
    setPass(data);
    setPassSyncedAt(Date.now());
  }

  async function run(action: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPendingAction(
        client.current?.pendingPurchase
          ? 'purchase'
          : client.current?.pendingBattlePass
            ? 'pass'
            : null,
      );
      working.current = false;
      setBusy(false);
    }
  }

  async function connect(input: string) {
    await run(async () => {
      const baseUrl = normalizeServerUrl(input);
      await AsyncStorage.setItem(addressKey, baseUrl);
      setServer(baseUrl);
      setAddress(baseUrl);
      // Keep the client on retries so a pending operation retains its request identity.
      if (client.current?.baseUrl !== baseUrl) {
        client.current = new GameClient(baseUrl, {
          storage: gameStorage,
          requestId: newRequestId,
          platform: Platform.OS,
        });
        setPlayer(null);
        setShop(null);
        setPass(null);
        setScreen('home');
      }
      setStatus('Finding your adventurer…');
      const current = await client.current.connect();
      setPlayer(current);
      setStatus('Preparing the market…');
      const [offers, battlePass] = await Promise.all([
        client.current.loadShop(),
        client.current.loadBattlePass(),
      ]);
      showShop(offers);
      showPass(battlePass);
      setSettings(false);
    });
  }

  async function refresh() {
    await run(async () => {
      if (!client.current) return;
      const [current, offers, battlePass] = await Promise.all([
        client.current.refreshPlayer(),
        client.current.loadShop(),
        client.current.loadBattlePass(),
      ]);
      setPlayer(current);
      showShop(offers);
      showPass(battlePass);
    });
  }

  async function buy(retry = false) {
    const chosen = selection;
    await run(async () => {
      if (!client.current || (!retry && !chosen)) return;
      const result = retry
        ? await client.current.retryPurchase()
        : await client.current.purchase(chosen!.offer.offer_id);
      setSelection(null);
      setReceipt({ ...result, title: 'Treasure received' });
      setCelebration((value) => value + 1);
      setDealer((current) => ({
        ...current,
        dialogue: 'A fine choice! May it bring you good fortune.',
      }));
      if (!retry && !pending)
        setPlayer((current) =>
          current ? { ...current, resources: result.resources } : current,
        );
      // A replay receipt contains historical balances. Read current state after confirming the purchase.
      try {
        const [current, offers, battlePass] = await Promise.all([
          client.current.refreshPlayer(),
          client.current.loadShop(),
          client.current.loadBattlePass(),
        ]);
        setPlayer(current);
        showShop(offers);
        showPass(battlePass);
      } catch {
        setShop(null);
        setPass(null);
        setError(
          'Purchase confirmed. Refresh to update your pouch and the latest offers.',
        );
      }
    });
  }

  async function battleAction(
    action: BattlePassAction,
    targetId = '',
    retry = false,
  ) {
    const passId = premiumConfirmation?.pass_id || pass?.pass_id;
    await run(async () => {
      if (!client.current || (!retry && !passId)) return;
      const actualAction = retry
        ? client.current.pendingBattlePass?.action || action
        : action;
      const result = retry
        ? await client.current.retryBattlePass()
        : await client.current.battlePassAction(action, passId!, targetId);
      setPremiumConfirmation(null);
      setReceipt({
        ...result,
        title:
          actualAction === 'premium'
            ? 'Premium unlocked'
            : actualAction === 'quest'
              ? 'Progress earned'
              : 'Treasure received',
        ...(actualAction === 'premium'
          ? {
              message:
                'The golden path is open. Collect Premium rewards at the milestones you have reached.',
            }
          : {}),
      });
      setCelebration((value) => value + 1);
      setDealer((current) => ({
        ...current,
        dialogue:
          actualAction === 'premium'
            ? 'The golden path welcomes you, adventurer.'
            : 'Well earned! Your journey grows brighter.',
      }));
      try {
        const [current, offers, battlePass] = await Promise.all([
          client.current.refreshPlayer(),
          client.current.loadShop(),
          client.current.loadBattlePass(),
        ]);
        setPlayer(current);
        showShop(offers);
        showPass(battlePass);
      } catch {
        setPass(null);
        setShop(null);
        setError(
          'Action confirmed. Refresh to see your current resources and Battle Pass progress.',
        );
      }
    });
  }

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(addressKey)
      .then((saved) => {
        if (mounted) void connect(saved || defaultServer());
      })
      .catch(() => {
        if (mounted)
          setError(
            'Could not load your server address. Open connection settings and try again.',
          );
      });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && client.current && player) void refresh();
    });
    return () => subscription.remove();
  }, [player?.player_id]);

  const expired =
    !!shop &&
    Number(shop.daily.expires_at) <=
      Number(shop.daily.server_time) + (now - syncedAt) / 1000;
  const passExpired =
    !!pass &&
    Number(pass.server_time) + (now - passSyncedAt) / 1000 >=
      Math.min(Number(pass.ends_at), Number(pass.quests_reset_at));
  useEffect(() => {
    if (
      (expired || passExpired) &&
      !busy &&
      !error &&
      !selection &&
      !receipt &&
      !premiumConfirmation
    )
      void refresh();
  }, [
    expired,
    passExpired,
    busy,
    error,
    selection,
    receipt,
    premiumConfirmation,
  ]);

  const ready = fontsLoaded || !!fontError;
  const confirmPrice = selection
    ? selection.daily
      ? (selection.offer as DailyOffer).final_price
      : (selection.offer as StaticOffer).price
    : null;

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <View style={s.background}>
        <DealerScene
          shop={screen !== 'home' && !receipt}
          greeting={dealer.greeting}
          reaction={dealer.reaction}
          celebration={celebration}
          celebrating={!!receipt}
          pointer={pointer}
        />
        <LinearGradient
          colors={
            receipt
              ? ['#07151e10', '#07151e00', '#07151e30']
              : screen === 'home'
                ? ['#111b18c9', '#111b1800', '#111b18e8']
                : ['#141d18e8', '#141d18a8', '#141d18f5']
          }
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <SafeAreaView
          testID="game-interface"
          style={[s.safe, receipt && { opacity: 0 }]}
          pointerEvents={receipt ? 'none' : 'auto'}
          accessibilityElementsHidden={!!receipt}
          aria-hidden={!!receipt}
          {...(Platform.OS === 'web' ? { inert: !!receipt } : {})}
          importantForAccessibility={receipt ? 'no-hide-descendants' : 'auto'}
          edges={['top', 'left', 'right']}
        >
          <View style={s.topBar}>
            <View style={s.brand}>
              <Icon name="star-four-points" size={19} color={colors.gold} />
              <Text style={s.wordmark}>EMBER & RUNE</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Connection settings"
              disabled={busy}
              onPress={() => {
                setAddress(server);
                setSettings(true);
              }}
              style={s.iconButton}
            >
              <Icon name="cog-outline" color={colors.gold} size={23} />
            </Pressable>
          </View>
          {player && ready && (
            <View style={s.walletWrap}>
              <Wallet resources={player.resources} />
            </View>
          )}

          {!player || !ready ? (
            <View style={s.loading}>
              <View style={s.crest}>
                <Icon name="star-four-points" size={54} color={colors.gold} />
              </View>
              <Text style={s.loadingTitle}>Ember & Rune</Text>
              <Text style={s.subtitle}>A little magic. A new adventure.</Text>
              {busy || !ready ? (
                <>
                  <ActivityIndicator
                    color={colors.gold}
                    style={{ marginTop: 28 }}
                  />
                  <Text style={s.loadingStatus}>{status}</Text>
                </>
              ) : (
                <View style={{ gap: 12, marginTop: 28, width: '100%' }}>
                  <Text style={s.connectionError}>
                    {error || 'Connect to your game server to begin.'}
                  </Text>
                  <GameButton
                    title="TRY AGAIN"
                    onPress={() => void connect(server)}
                  />
                  <GameButton
                    secondary
                    title="CONNECTION SETTINGS"
                    onPress={() => setSettings(true)}
                  />
                </View>
              )}
            </View>
          ) : (
            <>
              {error && (
                <View style={s.notice} accessibilityRole="alert">
                  <Text style={s.noticeText}>{error}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Refresh game"
                    onPress={() => void refresh()}
                    disabled={busy}
                    style={s.noticeAction}
                  >
                    <Icon name="refresh" size={22} color={colors.gold} />
                  </Pressable>
                </View>
              )}
              {pending && (
                <View style={s.pending}>
                  <Text style={s.pendingText}>
                    {pendingAction === 'pass'
                      ? 'A Battle Pass action is awaiting confirmation.'
                      : 'A purchase is awaiting confirmation.'}
                  </Text>
                  <GameButton
                    title={
                      pendingAction === 'pass'
                        ? 'CHECK BATTLE PASS ACTION'
                        : 'CHECK PURCHASE'
                    }
                    secondary
                    busy={busy}
                    onPress={() =>
                      pendingAction === 'pass'
                        ? void battleAction('claim', '', true)
                        : void buy(true)
                    }
                  />
                </View>
              )}
              {screen === 'home' ? (
                <ScrollView
                  key="home"
                  contentContainerStyle={s.home}
                  refreshControl={
                    <RefreshControl
                      refreshing={busy}
                      onRefresh={() => void refresh()}
                      tintColor={colors.gold}
                    />
                  }
                >
                  <View style={s.homeHeading}>
                    <Text style={s.eyebrow}>THE WOODLAND MARKET</Text>
                    <Text style={s.homeTitle}>The Rune{'\n'}Exchange</Text>
                    <View style={s.headingRule} />
                  </View>
                  <View
                    style={s.sceneSpace}
                    onLayout={(event) => {
                      gestureSize.current = event.nativeEvent.layout;
                    }}
                    {...gesture.panHandlers}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Greet Orin"
                      style={StyleSheet.absoluteFill}
                      onPressIn={() => {
                        didDrag.current = false;
                      }}
                      onPress={() => {
                        if (didDrag.current) return;
                        setDealer((current) => ({
                          ...dealerGreetings[
                            (current.greeting - 1) % dealerGreetings.length
                          ],
                          greeting: current.greeting + 1,
                        }));
                      }}
                    />
                  </View>
                  <View style={s.adventurerCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.welcome}>Orin, the Runekeeper</Text>
                      <Text
                        style={s.dealerDialogue}
                        testID="dealer-dialogue"
                        accessibilityLiveRegion="polite"
                      >
                        {dealer.dialogue}
                      </Text>
                    </View>
                    <View style={s.online} accessibilityLabel="Connected" />
                  </View>
                  <View style={s.homeAction}>
                    <GameButton
                      title="ENTER THE SHOP"
                      onPress={() => {
                        setScreen('shop');
                        if (!shop) void refresh();
                      }}
                      testID="enter-shop"
                    />
                    <Text style={s.homeFootnote}>
                      Touch Orin to say hello · Drag to look around
                    </Text>
                  </View>
                </ScrollView>
              ) : screen === 'pass' ? (
                <BattlePassScreen
                  pass={pass}
                  now={now}
                  syncedAt={passSyncedAt}
                  busy={busy}
                  pending={pending}
                  hidden={!!receipt}
                  onRefresh={() => void refresh()}
                  onAction={(action, targetId) =>
                    void battleAction(action, targetId)
                  }
                  onPremium={() => setPremiumConfirmation(pass)}
                  onShop={() => setScreen('shop')}
                />
              ) : (
                <ScrollView
                  key="shop"
                  style={receipt ? { opacity: 0 } : undefined}
                  contentContainerStyle={s.shop}
                  refreshControl={
                    <RefreshControl
                      refreshing={busy}
                      onRefresh={() => void refresh()}
                      tintColor={colors.gold}
                    />
                  }
                >
                  <View style={s.shopHeading}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.eyebrow}>ORIN’S COLLECTION</Text>
                      <Text style={s.shopTitle}>The Shop</Text>
                    </View>
                    <Icon
                      name="storefront-outline"
                      size={33}
                      color={colors.gold}
                    />
                  </View>
                  <View style={s.sectionHeader}>
                    <View>
                      <Text style={s.sectionTitle}>DAILY OFFERS</Text>
                      <Text style={s.sectionSubtitle}>
                        Three finds. Here until midnight.
                      </Text>
                    </View>
                    <Icon name="weather-night" size={25} color={colors.gold} />
                  </View>
                  <View style={s.timer}>
                    <Icon name="timer-sand" size={15} color={colors.gold} />
                    <Text style={s.timerText}>
                      {countdown(shop, syncedAt, now)}
                    </Text>
                    <Text style={s.timerHint}>until refresh</Text>
                  </View>
                  {shop ? (
                    <View style={s.dailyRow}>
                      {shop.daily.slots.map((slot) => (
                        <OfferCard
                          key={slot.offer.offer_id}
                          offer={slot.offer}
                          daily
                          disabled={busy || pending || expired}
                          onBuy={() =>
                            setSelection({ offer: slot.offer, daily: true })
                          }
                        />
                      ))}
                    </View>
                  ) : (
                    <View style={s.shopEmpty}>
                      <Text style={s.body}>
                        The merchant is preparing your offers.
                      </Text>
                      <GameButton
                        title="REFRESH SHOP"
                        secondary
                        busy={busy}
                        onPress={() => void refresh()}
                      />
                    </View>
                  )}
                  <View style={[s.sectionHeader, { marginTop: 30 }]}>
                    <View>
                      <Text style={s.sectionTitle}>EVERGREEN GOODS</Text>
                      <Text style={s.sectionSubtitle}>
                        Your familiar favorites, always in stock.
                      </Text>
                    </View>
                    <Icon name="treasure-chest" size={25} color={colors.gold} />
                  </View>
                  {shop && (
                    <View style={s.staticRow}>
                      {shop.static.slots.map((slot) => (
                        <OfferCard
                          key={slot.offer.offer_id}
                          offer={slot.offer}
                          disabled={busy || pending}
                          onBuy={() =>
                            setSelection({
                              offer: slot.offer,
                              daily: false,
                            })
                          }
                        />
                      ))}
                    </View>
                  )}
                  <View style={s.shopFooter}>
                    <Icon
                      name="star-four-points"
                      color={colors.border}
                      size={15}
                    />
                    <Text style={s.footerText}>
                      A fair trade, a brighter journey.
                    </Text>
                    <Icon
                      name="star-four-points"
                      color={colors.border}
                      size={15}
                    />
                  </View>
                </ScrollView>
              )}
              <SafeAreaView edges={['bottom']} style={s.bottomSafe}>
                <View style={s.navigation}>
                  {(['home', 'shop', 'pass'] as const).map((tab) => (
                    <Pressable
                      accessibilityRole="tab"
                      accessibilityLabel={
                        tab === 'home'
                          ? 'Home'
                          : tab === 'shop'
                            ? 'Shop'
                            : 'Battle Pass'
                      }
                      accessibilityState={{ selected: screen === tab }}
                      key={tab}
                      onPress={() => {
                        setScreen(tab);
                        if (tab === 'shop' && !shop) void refresh();
                        if (tab === 'pass' && !pass) void refresh();
                      }}
                      style={[s.navItem, screen === tab && s.navActive]}
                    >
                      <Icon
                        name={
                          tab === 'home'
                            ? 'home-variant-outline'
                            : tab === 'shop'
                              ? 'storefront-outline'
                              : 'shield-star-outline'
                        }
                        size={26}
                        color={screen === tab ? colors.gold : colors.muted}
                      />
                      <Text
                        style={[
                          s.navText,
                          screen === tab && { color: colors.gold },
                        ]}
                      >
                        {tab.toUpperCase()}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </SafeAreaView>
            </>
          )}
        </SafeAreaView>
      </View>

      <GameModal
        visible={settings}
        title="Connection"
        onClose={() => setSettings(false)}
        busy={busy}
      >
        <Text style={s.body}>
          Connect your iPhone and Mac to the same Wi-Fi, then enter your Mac’s
          game server address.
        </Text>
        <Text style={s.inputLabel}>SERVER ADDRESS</Text>
        <TextInput
          accessibilityLabel="Server address"
          value={address}
          onChangeText={setAddress}
          placeholder="http://192.168.1.10:8080"
          placeholderTextColor="#829888"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          textContentType="URL"
          editable={!busy}
          style={s.input}
        />
        {error && (
          <Text style={s.connectionError} accessibilityRole="alert">
            {error}
          </Text>
        )}
        <GameButton
          title="CONNECT"
          busy={busy}
          onPress={() => void connect(address)}
        />
        {player && (
          <Text selectable style={s.playerId}>
            Player {player.player_id.slice(0, 8)}
          </Text>
        )}
      </GameModal>
      <GameModal
        visible={!!selection}
        title="A fair trade?"
        onClose={() => setSelection(null)}
        busy={busy}
      >
        {selection && (
          <>
            <Text style={s.dialogName}>
              {packageNames[selection.offer.package_id] ||
                selection.offer.package_id}
            </Text>
            <RewardList items={selection.offer.items} />
            <View style={s.cost}>
              <Text style={s.body}>Your price</Text>
              {confirmPrice &&
                Object.entries(confirmPrice.currency).map(
                  ([kind, quantity]) => (
                    <View style={s.costValue} key={kind}>
                      <ResourceIcon kind={kind} />
                      <Text style={s.price}>
                        {quantity} {resourceNames[kind]}
                      </Text>
                    </View>
                  ),
                )}
            </View>
            {error && (
              <Text style={s.connectionError} accessibilityRole="alert">
                {error}
              </Text>
            )}
            <GameButton
              title={pending ? 'CHECK PURCHASE' : 'CONFIRM PURCHASE'}
              busy={busy}
              onPress={() => void buy(pending)}
            />
            <GameButton
              title="BACK TO SHOP"
              secondary
              disabled={busy}
              onPress={() => setSelection(null)}
            />
          </>
        )}
      </GameModal>
      {receipt && (
        <PurchaseCelebration
          title={receipt.title}
          items={receipt.items}
          message={receipt.message}
          error={error || undefined}
          busy={busy}
          onCollect={() => setReceipt(null)}
          onCheer={() => setCelebration((value) => value + 1)}
        />
      )}
      <GameModal
        visible={!!premiumConfirmation}
        title="Unlock Premium"
        onClose={() => setPremiumConfirmation(null)}
        busy={busy}
      >
        <Text style={s.dialogName}>{premiumConfirmation?.name}</Text>
        <Text style={s.body}>
          Unlock Premium rewards for this season. Your EXPBP determines which
          milestones you can claim.
        </Text>
        <View style={s.cost}>
          <Text style={s.body}>One-time price</Text>
          {premiumConfirmation &&
            Object.entries(premiumConfirmation.premium_price.currency).map(
              ([kind, quantity]) => (
                <View style={s.costValue} key={kind}>
                  <ResourceIcon kind={kind} />
                  <Text style={s.price}>
                    {quantity} {resourceNames[kind]}
                  </Text>
                </View>
              ),
            )}
        </View>
        {error && (
          <Text style={s.connectionError} accessibilityRole="alert">
            {error}
          </Text>
        )}
        <GameButton
          title={
            pendingAction === 'pass'
              ? 'CHECK BATTLE PASS ACTION'
              : 'CONFIRM PREMIUM'
          }
          busy={busy}
          disabled={pendingAction === 'purchase'}
          onPress={() =>
            void battleAction('premium', '', pendingAction === 'pass')
          }
        />
        <GameButton
          title="BACK TO PASS"
          secondary
          disabled={busy}
          onPress={() => setPremiumConfirmation(null)}
        />
      </GameModal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  background: { flex: 1 },
  safe: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 10,
    minHeight: 48,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordmark: {
    color: colors.cream,
    fontFamily: 'Barlow',
    fontSize: 15,
    letterSpacing: 2.8,
  },
  iconButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletWrap: { marginHorizontal: 20 },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: '#141d18c9',
  },
  crest: {
    width: 98,
    height: 98,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#263125d9',
    transform: [{ rotate: '-6deg' }],
  },
  loadingTitle: {
    fontFamily: 'Cinzel',
    fontSize: 36,
    color: colors.cream,
    marginTop: 30,
    textAlign: 'center',
  },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 10 },
  loadingStatus: { color: colors.cream, marginTop: 12, fontSize: 13 },
  home: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 18,
    minHeight: 435,
  },
  homeHeading: { alignSelf: 'flex-start' },
  eyebrow: {
    color: colors.gold,
    fontFamily: 'Barlow',
    fontSize: 11,
    letterSpacing: 2.4,
  },
  homeTitle: {
    fontFamily: 'Cinzel',
    fontSize: 34,
    color: colors.cream,
    lineHeight: 39,
    marginTop: 7,
    textShadowColor: '#111b18',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 2 },
  },
  headingRule: {
    width: 35,
    height: 2,
    backgroundColor: colors.gold,
    marginTop: 15,
  },
  sceneSpace: { flex: 1, minHeight: 140 },
  adventurerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#18231cde',
    borderLeftWidth: 2,
    borderLeftColor: colors.gold,
  },
  welcome: { color: colors.cream, fontFamily: 'Cinzel', fontSize: 17 },
  playerId: { color: colors.muted, fontSize: 12, marginTop: 4 },
  dealerDialogue: {
    color: '#d0d5c4',
    fontSize: 12,
    lineHeight: 19,
    marginTop: 6,
  },
  online: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.green,
  },
  homeAction: { marginTop: 12, gap: 11 },
  homeFootnote: { color: '#b7bfac', fontSize: 10, textAlign: 'center' },
  shop: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 12 },
  shopHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 23,
  },
  shopTitle: {
    fontFamily: 'Cinzel',
    fontSize: 34,
    color: colors.cream,
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: 'Barlow',
    fontSize: 23,
    color: colors.cream,
    letterSpacing: 1.1,
  },
  sectionSubtitle: { fontSize: 11, color: colors.muted, marginTop: 3 },
  timer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 5,
    marginBottom: 14,
  },
  timerText: {
    color: colors.gold,
    fontFamily: 'Barlow',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  timerHint: { color: colors.muted, fontSize: 11, marginLeft: 3 },
  dailyRow: { gap: 8 },
  staticRow: { gap: 1 },
  shopEmpty: { gap: 16, paddingVertical: 24 },
  shopFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
  },
  footerText: { color: colors.muted, fontSize: 11, fontStyle: 'italic' },
  bottomSafe: {
    backgroundColor: '#151e18f5',
    borderTopWidth: 1,
    borderTopColor: '#b7a97938',
  },
  navigation: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 4,
    gap: 18,
  },
  navItem: {
    flex: 1,
    paddingTop: 10,
    paddingBottom: 7,
    alignItems: 'center',
    gap: 3,
    borderTopWidth: 2,
    borderTopColor: 'transparent',
    minHeight: 63,
  },
  navActive: { borderTopColor: colors.gold, backgroundColor: '#c4b17908' },
  navText: {
    color: colors.muted,
    fontFamily: 'Barlow',
    fontSize: 12,
    letterSpacing: 1.8,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#44342bf2',
    borderLeftWidth: 2,
    borderColor: '#d4a47b',
    marginHorizontal: 20,
    marginVertical: 8,
  },
  noticeText: {
    color: '#f2d6b4',
    fontSize: 12,
    lineHeight: 18,
    padding: 12,
    flex: 1,
  },
  noticeAction: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pending: { marginHorizontal: 20, marginVertical: 8, gap: 10 },
  pendingText: { color: colors.cream, fontSize: 12, textAlign: 'center' },
  body: { color: '#c9cfbe', fontSize: 14, lineHeight: 21 },
  inputLabel: {
    fontFamily: 'Barlow',
    fontSize: 16,
    letterSpacing: 1,
    color: colors.gold,
    marginTop: 5,
  },
  input: {
    backgroundColor: '#17221a',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 3,
    padding: 13,
    color: colors.cream,
    minHeight: 50,
    fontSize: 14,
  },
  connectionError: {
    color: '#f1c9a4',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  dialogName: {
    textAlign: 'center',
    fontFamily: 'Cinzel',
    fontSize: 20,
    color: colors.gold,
  },
  cost: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: 15,
    marginBottom: 5,
  },
  costValue: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  price: { color: colors.cream, fontFamily: 'Barlow', fontSize: 25 },
});
