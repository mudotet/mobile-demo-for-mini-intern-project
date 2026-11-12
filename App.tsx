// Remount the native GL tree when this screen is edited during development.
// @refresh reset
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Animated,
  Easing,
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
  const [greeting, setGreeting] = useState(1);
  const [celebration, setCelebration] = useState(0);
  const [dialogue, setDialogue] = useState(
    'Every rune has a story. Let’s find yours.',
  );
  const entrance = useRef(new Animated.Value(0)).current;
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
      setDialogue('A fine choice! May it bring you good fortune.');
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
      setDialogue(
        actualAction === 'premium'
          ? 'The golden path welcomes you, adventurer.'
          : 'Well earned! Your journey grows brighter.',
      );
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

  useEffect(() => {
    entrance.setValue(0);
    Animated.timing(entrance, {
      toValue: 1,
      duration: 550,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [screen]);

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
          greeting={greeting}
          celebration={celebration}
          celebrating={!!receipt}
          pointer={pointer}
        />
        <LinearGradient
          colors={
            receipt
              ? ['#07151e10', '#07151e00', '#07151e30']
              : screen === 'home'
              ? ['#07151e85', '#10212000', '#07151ed9']
              : ['#07151e90', '#0b201c85', '#07151ef0']
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
                  <Animated.View
                    style={{
                      opacity: entrance,
                      transform: [
                        {
                          translateY: entrance.interpolate({
                            inputRange: [0, 1],
                            outputRange: [12, 0],
                          }),
                        },
                      ],
                    }}
                  >
                    <Text style={s.eyebrow}>WELCOME TO</Text>
                    <Text style={s.homeTitle}>The Rune Exchange</Text>
                  </Animated.View>
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
                        setGreeting((value) => value + 1);
                        const lines = [
                          'Ah, a curious soul! Come a little closer.',
                          'Fresh crystals. Ancient wisdom. Fair prices.',
                          'Take your time. The magic isn’t going anywhere.',
                        ];
                        setDialogue(lines[greeting % lines.length]);
                      }}
                    />
                  </View>
                  <LinearGradient
                    colors={['#173036e8', '#0d212aef']}
                    style={s.adventurerCard}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.welcome}>ORIN, THE RUNEKEEPER</Text>
                      <Text style={s.dealerDialogue}>{dialogue}</Text>
                      <Text selectable style={s.playerId}>
                        Player {player.player_id.slice(0, 8)}
                      </Text>
                    </View>
                    <View style={s.online} accessibilityLabel="Connected" />
                  </LinearGradient>
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
                  <Text style={s.eyebrow}>THE MERCHANT’S COLLECTION</Text>
                  <Text style={s.shopTitle}>The Shop</Text>
                  <Text style={s.shopSubtitle}>
                    Treasures for your next adventure.
                  </Text>
                  <View style={s.sectionHeader}>
                    <View>
                      <Text style={s.sectionTitle}>DAILY OFFERS</Text>
                      <Text style={s.sectionSubtitle}>
                        A little rarer. A little more rewarding.
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
                  {shop &&
                    Array.from(
                      { length: Math.ceil(shop.static.slots.length / 2) },
                      (_, index) => (
                        <View style={s.staticRow} key={index}>
                          {shop.static.slots
                            .slice(index * 2, index * 2 + 2)
                            .map((slot) => (
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
                      ),
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
                        color={screen === tab ? colors.gold : '#8aa497'}
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
    paddingLeft: 22,
    paddingRight: 12,
    minHeight: 52,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordmark: {
    color: colors.gold,
    fontFamily: 'Barlow',
    fontSize: 17,
    letterSpacing: 2.5,
  },
  iconButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletWrap: { marginHorizontal: 18, marginBottom: 6 },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: '#0b211aa8',
  },
  crest: {
    width: 98,
    height: 98,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#19332fd9',
    transform: [{ rotate: '-6deg' }],
  },
  loadingTitle: {
    fontFamily: 'Cinzel',
    fontSize: 36,
    color: colors.cream,
    marginTop: 30,
    textAlign: 'center',
  },
  subtitle: { color: '#d0d6bf', fontSize: 14, marginTop: 10 },
  loadingStatus: { color: colors.cream, marginTop: 12, fontSize: 13 },
  home: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 22,
    minHeight: 420,
  },
  eyebrow: {
    color: '#dfce9e',
    fontSize: 10,
    letterSpacing: 2.5,
    textAlign: 'center',
  },
  homeTitle: {
    fontFamily: 'Cinzel',
    fontSize: 26,
    color: '#fff0ca',
    textAlign: 'center',
    lineHeight: 34,
    marginTop: 5,
    textShadowColor: '#071e1d',
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 3 },
  },
  sceneSpace: { flex: 1, minHeight: 140 },
  adventurerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 15,
    borderWidth: 1,
    borderColor: '#9b8656',
    borderRadius: 14,
  },
  welcome: {
    color: colors.cream,
    fontFamily: 'Barlow',
    fontSize: 20,
    letterSpacing: 0.5,
  },
  playerId: { color: colors.muted, fontSize: 12, marginTop: 4 },
  dealerDialogue: {
    color: '#d3e1d5',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  online: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  homeAction: { marginTop: 15, gap: 11 },
  homeFootnote: { color: '#a4b9a7', fontSize: 11, textAlign: 'center' },
  shop: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 12 },
  shopTitle: {
    fontFamily: 'Cinzel',
    fontSize: 34,
    color: colors.cream,
    textAlign: 'center',
    marginTop: 8,
  },
  shopSubtitle: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 5,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#8c77455c',
    paddingTop: 15,
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: 'Barlow',
    fontSize: 27,
    color: colors.gold,
    letterSpacing: 1,
  },
  sectionSubtitle: { fontSize: 11, color: colors.muted, marginTop: 2 },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 13,
  },
  timerText: {
    color: '#ead7a7',
    fontFamily: 'Barlow',
    fontSize: 16,
    minWidth: 80,
  },
  timerHint: { color: '#99b4a2', fontSize: 11 },
  dailyRow: { flexDirection: 'row', gap: 7, alignItems: 'stretch' },
  staticRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  shopEmpty: { gap: 16, paddingVertical: 24 },
  shopFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 20,
  },
  footerText: { color: '#b5bd9e', fontSize: 11, fontStyle: 'italic' },
  bottomSafe: {
    backgroundColor: '#0c211eeF',
    borderTopWidth: 1,
    borderTopColor: '#8c7745',
  },
  navigation: {
    flexDirection: 'row',
    paddingHorizontal: 40,
    paddingTop: 5,
    paddingBottom: 4,
    gap: 26,
  },
  navItem: {
    flex: 1,
    paddingTop: 7,
    paddingBottom: 6,
    alignItems: 'center',
    gap: 3,
    borderRadius: 10,
    minHeight: 61,
  },
  navActive: { backgroundColor: '#2741359c' },
  navText: {
    color: '#8aa497',
    fontFamily: 'Barlow',
    fontSize: 15,
    letterSpacing: 1.5,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4d352bf2',
    borderWidth: 1,
    borderColor: '#ad7e50',
    marginHorizontal: 18,
    marginVertical: 8,
    borderRadius: 10,
  },
  noticeText: {
    color: '#ffdfb1',
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
  pending: { marginHorizontal: 18, marginVertical: 8, gap: 10 },
  pendingText: { color: colors.cream, fontSize: 12, textAlign: 'center' },
  body: { color: '#cad5c2', fontSize: 14, lineHeight: 21 },
  inputLabel: {
    fontFamily: 'Barlow',
    fontSize: 16,
    letterSpacing: 1,
    color: colors.gold,
    marginTop: 5,
  },
  input: {
    backgroundColor: '#102620',
    borderColor: '#71846b',
    borderWidth: 1,
    borderRadius: 9,
    padding: 13,
    color: colors.cream,
    minHeight: 50,
    fontSize: 14,
  },
  connectionError: {
    color: '#ffd0a4',
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
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#586247',
    paddingVertical: 15,
    marginBottom: 5,
  },
  costValue: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  price: { color: colors.cream, fontFamily: 'Barlow', fontSize: 25 },
});
