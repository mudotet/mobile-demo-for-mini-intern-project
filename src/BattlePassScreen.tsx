import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "@expo/vector-icons/MaterialCommunityIcons";
import type {
  BattlePassAction,
  BattlePassMilestone,
  BattlePassNode,
  BattlePassState,
} from "./battlepass";
import { colors, GameButton, ResourceIcon, resourceNames } from "./ui";

type Props = {
  pass: BattlePassState | null;
  now: number;
  syncedAt: number;
  busy: boolean;
  pending: boolean;
  hidden: boolean;
  onRefresh: () => void;
  onAction: (action: BattlePassAction, targetId: string) => void;
  onPremium: () => void;
  onShop: () => void;
};

function remaining(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  if (!value) return "Refreshing…";
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return days
    ? `${days}d ${hours}h`
    : `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function RewardArt({
  kind,
  size,
  featured = false,
}: {
  kind: string;
  size: number;
  featured?: boolean;
}) {
  return (
    <View
      style={[s.art, { width: size, height: size }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={[
          s.artHalo,
          { width: size * 0.84, height: size * 0.84, borderRadius: size },
          featured && s.featuredHalo,
        ]}
      />
      <View
        style={[
          s.artDiamond,
          { width: size * 0.6, height: size * 0.6 },
          kind === "gem" && s.gemDiamond,
        ]}
      />
      <View style={s.artMain}>
        <ResourceIcon kind={kind} size={size * 0.75} />
      </View>
      {kind === "gem" && (
        <View style={[s.artShard, { right: size * 0.01, bottom: size * 0.13 }]}>
          <ResourceIcon kind="gem" size={size * 0.32} />
        </View>
      )}
      {kind === "gold" && (
        <View style={[s.artShard, { left: size * 0.02, bottom: size * 0.1 }]}>
          <ResourceIcon kind="gold" size={size * 0.36} />
        </View>
      )}
      <Icon
        name="star-four-points"
        size={size * 0.12}
        color={colors.gold}
        style={{ position: "absolute", left: size * 0.09, top: size * 0.14 }}
      />
      <Icon
        name="star-four-points"
        size={size * 0.08}
        color={colors.gold}
        style={{ position: "absolute", right: size * 0.08, top: size * 0.35 }}
      />
    </View>
  );
}

function StepShield({ step, reached }: { step: number; reached: boolean }) {
  return (
    <View style={s.stepShield}>
      <Icon name="shield" size={36} color={reached ? colors.gold : "#5f6a53"} />
      <Icon
        name="shield"
        size={29}
        color={reached ? "#3f4933" : "#212b22"}
        style={s.shieldInner}
      />
      <Text style={s.stepText}>{step}</Text>
    </View>
  );
}

function RewardNode({
  node,
  milestone,
  premium,
  owned,
  disabled,
  reached,
  onClaim,
  onPremium,
}: {
  node: BattlePassNode;
  milestone: BattlePassMilestone;
  premium: boolean;
  owned: boolean;
  disabled: boolean;
  reached: boolean;
  onClaim: () => void;
  onPremium: () => void;
}) {
  const [kind, quantity] = Object.entries(node.items)[0] || ["xp", 0];
  const premiumLocked = premium && !owned;
  const unavailable =
    disabled || node.claimed || (!node.claimable && !premiumLocked);
  const label = node.claimed
    ? "COLLECTED"
    : node.claimable
      ? "CLAIM REWARD"
      : premiumLocked
        ? "PREMIUM LOCKED"
        : `${milestone.required_expbp} EXPBP`;
  const rewardDescription = Object.entries(node.items)
    .map(
      ([resource, amount]) =>
        `${amount} ${resourceNames[resource] || resource}`,
    )
    .join(", ");
  const milestoneLabel = `${premium ? "Premium" : "Free"} milestone ${milestone.step}`;
  return (
    <View style={s.ladderRow} testID={`pass-node-${node.node_id}`}>
      {reached && (
        <View
          style={s.railReached}
          testID={`pass-rail-reached-${node.node_id}`}
        />
      )}
      <View style={s.stepPosition}>
        <StepShield step={milestone.step} reached={reached} />
      </View>
      <View
        style={[
          s.rewardCard,
          premium && s.premiumCard,
          node.claimable && s.claimableCard,
          node.claimed && s.claimedCard,
        ]}
      >
        <View style={s.laneRibbon}>
          {premium && <Icon name="crown" size={11} color={colors.gold} />}
          <Text style={[s.laneText, premium && { color: colors.gold }]}>
            {premium ? "PREMIUM" : "FREE REWARD"}
          </Text>
        </View>
        <View style={s.nodeArt}>
          <RewardArt kind={kind} size={66} />
        </View>
        <Text style={s.rewardQuantity}>
          ×{quantity}
          <Text style={s.rewardKind}> {resourceNames[kind] || kind}</Text>
        </Text>
        {Object.entries(node.items)
          .slice(1)
          .map(([resource, amount]) => (
            <Text key={resource} style={s.extraReward}>
              +{amount} {resourceNames[resource] || resource}
            </Text>
          ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            node.claimed
              ? `Collected ${milestoneLabel}: ${rewardDescription}`
              : node.claimable
                ? `Claim ${milestoneLabel}: ${rewardDescription}`
                : premiumLocked
                  ? `Unlock Premium for milestone ${milestone.step}: ${rewardDescription}`
                  : `Locked ${milestoneLabel}: ${milestone.required_expbp} EXPBP required`
          }
          accessibilityState={{ disabled: unavailable }}
          disabled={unavailable}
          onPress={premiumLocked ? onPremium : onClaim}
          style={({ pressed }) => [
            s.claimButton,
            node.claimable && s.goldClaim,
            node.claimed && s.collectedButton,
            pressed && s.pressed,
          ]}
        >
          <Icon
            name={
              node.claimed
                ? "check-bold"
                : node.claimable
                  ? "hand-coin-outline"
                  : "lock"
            }
            size={15}
            color={
              node.claimable
                ? colors.ink
                : node.claimed
                  ? colors.green
                  : colors.muted
            }
          />
          <Text
            style={[
              s.claimText,
              node.claimable && { color: colors.ink },
              node.claimed && { color: colors.green },
            ]}
          >
            {label}
          </Text>
        </Pressable>
        {premium && (
          <Text style={s.nodeThreshold}>{milestone.required_expbp} EXPBP</Text>
        )}
        {node.claimed && (
          <View style={s.claimedCheck}>
            <Icon name="check-bold" size={17} color="#133c31" />
          </View>
        )}
      </View>
    </View>
  );
}

export default function BattlePassScreen({
  pass,
  now,
  syncedAt,
  busy,
  pending,
  hidden,
  onRefresh,
  onAction,
  onPremium,
  onShop,
}: Props) {
  const [section, setSection] = useState<"milestones" | "quests">("milestones");
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);
  const ladderRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const ladderSize = useRef({ height: 0, contentHeight: 0 });
  const milestoneLayouts = useRef(
    new Map<number, { y: number; height: number }>(),
  );
  const positionedAt = useRef<string | null>(null);
  const { width, height } = useWindowDimensions();
  const compact =
    height < 740 || (availableHeight !== null && availableHeight < 650);
  const serverNow = pass
    ? Number(pass.server_time) + Math.max(0, now - syncedAt) / 1000
    : 0;
  const expired = !!pass && serverNow >= Number(pass.ends_at);
  const maxExp = pass?.milestones.at(-1)?.required_expbp || 600;
  const reached =
    pass?.milestones.filter((item) => item.required_expbp <= pass.expbp)
      .length || 0;
  const disabled = busy || pending || expired;
  const milestones = pass
    ? [...pass.milestones].sort((a, b) => b.step - a.step)
    : [];
  const featured = milestones[0];
  const currentMilestone =
    milestones.find(
      (milestone) => milestone.required_expbp <= (pass?.expbp || 0),
    ) || milestones.at(-1);
  const currentStep = currentMilestone?.step;
  const positionKey =
    pass && section === "milestones" && !hidden
      ? `${pass.pass_id}:${currentStep}`
      : null;
  const positionLadder = useCallback(() => {
    const layout =
      currentStep === undefined
        ? undefined
        : milestoneLayouts.current.get(currentStep);
    const { height, contentHeight } = ladderSize.current;
    if (
      !positionKey ||
      positionedAt.current === positionKey ||
      !layout ||
      !height ||
      contentHeight < layout.y + layout.height - 1 ||
      !ladderRef.current
    )
      return;
    const y = Math.max(
      0,
      Math.min(
        contentHeight - height,
        layout.y + layout.height / 2 - height / 2,
      ),
    );
    ladderRef.current.scrollTo({ y, animated: false });
    positionedAt.current = positionKey;
  }, [positionKey, currentStep]);
  useEffect(() => {
    positionedAt.current = null;
    positionLadder();
  }, [positionLadder]);
  const [featuredKind, featuredQuantity] = featured
    ? Object.entries(featured.premium.items)[0]
    : ["gem", 0];
  const refreshControl = (
    <RefreshControl
      refreshing={busy}
      onRefresh={onRefresh}
      tintColor={colors.gold}
    />
  );

  return (
    <View
      style={[s.screen, hidden && { opacity: 0 }]}
      onLayout={(event) => setAvailableHeight(event.nativeEvent.layout.height)}
      pointerEvents={hidden ? "none" : "auto"}
    >
      <View
        style={[s.banner, compact && s.compactBanner]}
        testID="pass-season-banner"
      >
        <View style={s.bannerTop}>
          <View style={s.seasonCrest}>
            <Icon name="shield-star-outline" size={32} color={colors.gold} />
          </View>
          <View style={s.bannerCopy}>
            <Text style={s.seasonName} numberOfLines={1}>
              {pass?.name.toUpperCase() || "THE SEASON JOURNEY"}
            </Text>
            <Text style={s.title}>BATTLE PASS</Text>
            <View style={s.seasonTime}>
              <Icon name="timer-sand" size={13} color={colors.gold} />
              <Text style={s.timeText}>
                {pass
                  ? `Ends in ${remaining(Number(pass.ends_at) - serverNow)}`
                  : "Your season awaits"}
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh Battle Pass"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={onRefresh}
            style={s.refreshButton}
          >
            <Icon name="refresh" size={20} color={colors.gold} />
          </Pressable>
        </View>
        {pass && (
          <View style={s.bannerProgress}>
            <View style={s.levelBadge}>
              <Text style={s.levelText}>{reached}</Text>
            </View>
            <View style={s.progressTrack}>
              <LinearGradient
                colors={["#616f49", "#8d9d66"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[
                  s.progressFill,
                  { width: `${Math.min(100, (pass.expbp / maxExp) * 100)}%` },
                ]}
              />
              <Text style={s.expValue} testID="pass-expbp">
                {pass.expbp} / {maxExp} EXPBP
              </Text>
            </View>
          </View>
        )}
      </View>
      {!pass ? (
        <View style={s.empty}>
          <Text style={s.body}>
            Discover this season’s milestones and rewards.
          </Text>
          <GameButton
            secondary
            title="LOAD BATTLE PASS"
            busy={busy}
            onPress={onRefresh}
          />
        </View>
      ) : (
        <>
          <View style={s.segmented} accessibilityRole="tablist">
            {(["milestones", "quests"] as const).map((tab) => (
              <Pressable
                key={tab}
                accessibilityRole="tab"
                accessibilityLabel={
                  tab === "milestones" ? "Milestones" : "Daily Quests"
                }
                accessibilityState={{ selected: section === tab }}
                onPress={() => setSection(tab)}
                style={[s.segment, section === tab && s.segmentSelected]}
              >
                <Icon
                  name={
                    tab === "milestones"
                      ? "shield-star-outline"
                      : "clipboard-text-outline"
                  }
                  size={18}
                  color={section === tab ? colors.gold : "#9bb6c6"}
                />
                <Text
                  style={[
                    s.segmentText,
                    section === tab && { color: colors.gold },
                  ]}
                >
                  {tab === "milestones" ? "MILESTONES" : "DAILY QUESTS"}
                </Text>
                {tab === "quests" &&
                  pass.quests.some((item) => item.claimable) && (
                    <View style={s.readyDot} />
                  )}
              </Pressable>
            ))}
          </View>
          {section === "milestones" && featured ? (
            <View style={s.journey}>
              <View style={s.featuredPanel} testID="pass-featured-panel">
                <ScrollView
                  style={s.featuredScroll}
                  contentContainerStyle={s.featuredContent}
                  showsVerticalScrollIndicator={false}
                >
                  <View style={s.featuredRibbon}>
                    <Text style={s.featuredTitle}>FEATURED REWARD</Text>
                  </View>
                  <View style={s.featuredRequirement}>
                    <Icon
                      name="lock-open-variant-outline"
                      size={12}
                      color={colors.muted}
                    />
                    <Text style={s.featuredUnlock}>
                      {featured.required_expbp} EXPBP
                    </Text>
                    <View style={s.featuredStep}>
                      <Text style={s.featuredStepText}>{featured.step}</Text>
                    </View>
                  </View>
                  <View style={[s.featuredArt, compact && { marginTop: 4 }]}>
                    <RewardArt
                      kind={featuredKind}
                      size={compact ? 80 : Math.min(112, width * 0.28)}
                      featured
                    />
                  </View>
                  <Text
                    style={[
                      s.featuredQuantity,
                      compact && { fontSize: 32, lineHeight: 36 },
                    ]}
                  >
                    ×{featuredQuantity}
                    {compact && (
                      <Text style={s.compactFeaturedName}>
                        {" "}
                        {(
                          resourceNames[featuredKind] || featuredKind
                        ).toUpperCase()}
                      </Text>
                    )}
                  </Text>
                  {!compact && (
                    <Text style={s.featuredName}>
                      {(
                        resourceNames[featuredKind] || featuredKind
                      ).toUpperCase()}
                    </Text>
                  )}
                </ScrollView>
                <View style={s.premiumDock}>
                  {pass.premium_owned ? (
                    <View style={s.premiumActive}>
                      <Icon name="crown" size={21} color={colors.gold} />
                      <Text style={s.premiumActiveText}>PREMIUM ACTIVE</Text>
                      <Icon name="check-circle" size={18} color="#9bd7b7" />
                    </View>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Unlock Premium"
                      accessibilityState={{ disabled }}
                      disabled={disabled}
                      onPress={onPremium}
                      style={({ pressed }) => [
                        s.premiumButton,
                        disabled && { opacity: 0.55 },
                        pressed && s.pressed,
                      ]}
                    >
                      <LinearGradient
                        colors={["#dfc58f", "#c5a66c"]}
                        style={s.premiumButtonFill}
                      >
                        <View style={s.premiumButtonHeading}>
                          <Icon name="crown" size={13} color="#5a311a" />
                          <Text style={s.premiumButtonText}>
                            UNLOCK PREMIUM
                          </Text>
                        </View>
                        {Object.entries(pass.premium_price.currency).map(
                          ([kind, quantity]) => (
                            <View key={kind} style={s.priceRow}>
                              <ResourceIcon
                                kind={kind}
                                size={24}
                                color={colors.ink}
                              />
                              <Text style={s.priceValue}>{quantity}</Text>
                            </View>
                          ),
                        )}
                      </LinearGradient>
                    </Pressable>
                  )}
                </View>
              </View>
              <ScrollView
                ref={ladderRef}
                testID="pass-ladder"
                onLayout={(event) => {
                  ladderSize.current.height = event.nativeEvent.layout.height;
                  positionedAt.current = null;
                  positionLadder();
                }}
                onContentSizeChange={(_, height) => {
                  ladderSize.current.contentHeight = height;
                  positionLadder();
                }}
                style={s.ladder}
                contentContainerStyle={s.ladderContent}
                refreshControl={refreshControl}
                showsVerticalScrollIndicator={false}
              >
                <View style={s.railLine} testID="pass-milestone-rail" />
                {milestones.map((milestone) => (
                  <View
                    key={milestone.step}
                    testID={
                      milestone.step === currentStep
                        ? "pass-current-milestone"
                        : undefined
                    }
                    onLayout={(event) => {
                      const { y, height } = event.nativeEvent.layout;
                      milestoneLayouts.current.set(milestone.step, {
                        y,
                        height,
                      });
                      if (milestone.step === currentStep)
                        positionedAt.current = null;
                      positionLadder();
                    }}
                  >
                    {([true, false] as const).map((premium) => {
                      const node = premium ? milestone.premium : milestone.free;
                      return (
                        <RewardNode
                          key={node.node_id}
                          node={node}
                          milestone={milestone}
                          premium={premium}
                          owned={pass.premium_owned}
                          disabled={disabled}
                          reached={milestone.required_expbp <= pass.expbp}
                          onClaim={() => onAction("claim", node.node_id)}
                          onPremium={onPremium}
                        />
                      );
                    })}
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : (
            <ScrollView
              style={s.questScroll}
              contentContainerStyle={s.questContent}
              refreshControl={refreshControl}
            >
              <View style={s.questIntro}>
                <Text style={s.questHeading}>Your daily pursuits</Text>
                <Text style={s.body}>
                  Complete trades in the Shop, then claim your EXPBP here.
                </Text>
                <View style={s.questReset}>
                  <Icon name="refresh" size={14} color={colors.gold} />
                  <Text style={s.questResetText}>
                    Resets in{" "}
                    {remaining(Number(pass.quests_reset_at) - serverNow)}
                  </Text>
                </View>
              </View>
              {pass.quests.map((quest) => (
                <LinearGradient
                  key={quest.quest_id}
                  colors={["#293328", "#252e24"]}
                  style={s.questCard}
                >
                  <View style={s.questTop}>
                    <Text style={s.questTitle}>{quest.title}</Text>
                    <View style={s.questReward}>
                      <Icon
                        name="star-four-points"
                        size={15}
                        color={colors.gold}
                      />
                      <Text style={s.questRewardText}>
                        +{quest.expbp_reward}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.questDescription}>{quest.description}</Text>
                  <View style={s.questProgressRow}>
                    <View
                      style={[
                        s.progressTrack,
                        { flex: 1, minHeight: 6, height: 6 },
                      ]}
                    >
                      <LinearGradient
                        colors={["#758657", "#b0bc8a"]}
                        style={[
                          s.progressFill,
                          {
                            width: `${Math.min(100, (quest.progress / quest.target) * 100)}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={s.questCount}>
                      {quest.progress}/{quest.target}
                    </Text>
                  </View>
                  {quest.claimed ? (
                    <View style={s.questCollected}>
                      <Icon
                        name="check-circle-outline"
                        color={colors.green}
                        size={18}
                      />
                      <Text style={s.questCollectedText}>EXPBP COLLECTED</Text>
                    </View>
                  ) : quest.claimable ? (
                    <GameButton
                      title={`CLAIM +${quest.expbp_reward} EXPBP`}
                      disabled={disabled}
                      onPress={() => onAction("quest", quest.quest_id)}
                    />
                  ) : (
                    <GameButton
                      title="VISIT THE SHOP"
                      secondary
                      disabled={busy}
                      onPress={onShop}
                    />
                  )}
                </LinearGradient>
              ))}
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, backgroundColor: colors.ink },
  banner: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#242d23",
  },
  compactBanner: { paddingTop: 10, paddingBottom: 10 },
  bannerTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  seasonCrest: {
    width: 44,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#a7976555",
    borderRadius: 3,
  },
  bannerCopy: { flex: 1, minWidth: 0 },
  seasonName: {
    color: colors.muted,
    fontFamily: "Barlow",
    fontSize: 10,
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  title: { fontFamily: "Cinzel", fontSize: 24, color: colors.cream },
  seasonTime: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  timeText: { fontFamily: "Barlow", fontSize: 14, color: colors.muted },
  refreshButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
    marginRight: -10,
  },
  bannerProgress: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 12,
  },
  levelBadge: {
    width: 26,
    minHeight: 26,
    backgroundColor: "#39442e",
    borderWidth: 1,
    borderColor: "#7a8257",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 2,
  },
  levelText: { fontFamily: "Barlow", color: colors.gold, fontSize: 17 },
  progressTrack: {
    minHeight: 24,
    flex: 1,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "#141c15",
    justifyContent: "center",
  },
  progressFill: { height: "100%", position: "absolute", left: 0 },
  expValue: {
    fontFamily: "Barlow",
    color: colors.cream,
    fontSize: 15,
    textAlign: "center",
    paddingVertical: 2,
    letterSpacing: 0.4,
  },
  segmented: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 16,
    marginTop: 3,
    marginBottom: 12,
    gap: 8,
  },
  segment: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  segmentSelected: { borderBottomColor: colors.gold },
  segmentText: {
    color: colors.muted,
    fontFamily: "Barlow",
    fontSize: 15,
    letterSpacing: 0.7,
  },
  readyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.gold,
  },
  journey: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
    paddingLeft: 16,
    paddingRight: 12,
    paddingBottom: 8,
    gap: 8,
  },
  featuredPanel: {
    width: "36%",
    flexShrink: 0,
    minHeight: 0,
    backgroundColor: "#1d271e",
  },
  featuredScroll: { flex: 1, minHeight: 0 },
  featuredContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingTop: 14,
    paddingBottom: 12,
  },
  featuredRibbon: {
    alignSelf: "stretch",
    alignItems: "center",
    paddingVertical: 5,
    borderTopWidth: 1,
    borderColor: colors.gold,
    marginHorizontal: 8,
  },
  featuredTitle: {
    fontFamily: "Barlow",
    fontSize: 12,
    letterSpacing: 0.6,
    color: colors.gold,
    textAlign: "center",
  },
  featuredRequirement: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: 3,
    marginTop: 7,
  },
  featuredUnlock: { fontFamily: "Barlow", fontSize: 11, color: colors.muted },
  featuredStep: {
    width: 19,
    minHeight: 21,
    backgroundColor: "#3b4530",
    borderRadius: 2,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
  featuredStepText: { fontFamily: "Barlow", fontSize: 14, color: colors.gold },
  featuredArt: { marginTop: 28, marginBottom: 8 },
  art: { alignItems: "center", justifyContent: "center" },
  artHalo: { position: "absolute", borderWidth: 1, borderColor: "#c1b17f1f" },
  featuredHalo: { borderColor: "#b8c8a333", backgroundColor: "#b8c8a308" },
  artDiamond: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "#c1b17f26",
    transform: [{ rotate: "45deg" }],
    borderRadius: 2,
  },
  gemDiamond: { borderColor: "#b8c8a333" },
  artMain: { transform: [{ rotate: "-7deg" }] },
  artShard: { position: "absolute", transform: [{ rotate: "19deg" }] },
  featuredQuantity: {
    fontFamily: "Barlow",
    fontSize: 44,
    color: colors.cream,
    textAlign: "center",
  },
  featuredName: {
    fontFamily: "Barlow",
    fontSize: 18,
    color: colors.muted,
    letterSpacing: 2,
  },
  compactFeaturedName: { fontSize: 15, color: colors.muted },
  premiumDock: { alignSelf: "stretch", padding: 6 },
  premiumButton: { minHeight: 70, borderRadius: 3, overflow: "hidden" },
  premiumButtonFill: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    minHeight: 70,
  },
  premiumButtonHeading: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  premiumButtonText: {
    color: "#303322",
    fontFamily: "Barlow",
    fontSize: 12,
    textAlign: "center",
  },
  priceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 2,
  },
  priceValue: { color: "#263020", fontFamily: "Barlow", fontSize: 27 },
  premiumActive: {
    minHeight: 70,
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  premiumActiveText: {
    fontFamily: "Barlow",
    color: colors.gold,
    fontSize: 14,
    textAlign: "center",
  },
  ladder: { flex: 1, minWidth: 0, minHeight: 0 },
  ladderContent: { paddingTop: 8, paddingBottom: 24 },
  railLine: {
    position: "absolute",
    left: 11,
    top: 8,
    bottom: 0,
    width: 8,
    backgroundColor: "#3c4935",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#5c694b",
    borderRadius: 2,
  },
  railReached: {
    position: "absolute",
    left: 11,
    top: 0,
    bottom: 0,
    width: 8,
    backgroundColor: colors.gold,
    borderRadius: 2,
  },
  ladderRow: { paddingLeft: 27, paddingBottom: 12, minWidth: 0 },
  stepPosition: { position: "absolute", left: -3, top: 28, zIndex: 2 },
  stepShield: {
    width: 36,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  shieldInner: { position: "absolute" },
  stepText: {
    position: "absolute",
    top: 8,
    fontFamily: "Barlow",
    color: colors.cream,
    fontSize: 20,
  },
  rewardCard: {
    backgroundColor: "#263126",
    minHeight: 174,
    borderTopWidth: 1,
    borderColor: "#5b674b",
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingBottom: 8,
    paddingTop: 9,
    alignItems: "center",
  },
  premiumCard: { backgroundColor: "#303529", borderColor: "#8c7c51" },
  claimableCard: { borderColor: colors.gold, backgroundColor: "#39412c" },
  claimedCard: { borderColor: "#657e5a", opacity: 0.8 },
  laneRibbon: {
    alignSelf: "stretch",
    minHeight: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 2,
  },
  laneText: {
    color: colors.muted,
    fontFamily: "Barlow",
    fontSize: 11,
    letterSpacing: 1,
  },
  nodeArt: { marginTop: 2 },
  rewardQuantity: {
    color: colors.cream,
    fontFamily: "Barlow",
    fontSize: 27,
    textAlign: "center",
    marginTop: -2,
    marginBottom: 8,
  },
  rewardKind: { color: "#c9cfbe", fontSize: 16 },
  extraReward: {
    color: "#c9cfbe",
    fontFamily: "Barlow",
    fontSize: 16,
    marginBottom: 4,
  },
  claimButton: {
    alignSelf: "stretch",
    minHeight: 44,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "#1d271e",
    borderWidth: 1,
    borderColor: "#525e45",
    borderRadius: 2,
    padding: 4,
  },
  goldClaim: { backgroundColor: colors.gold, borderColor: colors.gold },
  collectedButton: { backgroundColor: "#263b29", borderColor: "#536f47" },
  claimText: {
    fontFamily: "Barlow",
    color: "#c9cfbe",
    fontSize: 12,
    textAlign: "center",
  },
  nodeThreshold: {
    color: colors.muted,
    fontFamily: "Barlow",
    fontSize: 11,
    marginTop: 5,
  },
  claimedCheck: {
    position: "absolute",
    right: 6,
    top: 5,
    backgroundColor: colors.green,
    width: 23,
    height: 23,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.75, transform: [{ translateY: 1 }] },
  questScroll: { flex: 1, minHeight: 0 },
  questContent: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 25 },
  questIntro: { marginBottom: 20 },
  questHeading: {
    fontFamily: "Cinzel",
    fontSize: 20,
    color: colors.cream,
    marginBottom: 7,
  },
  body: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  questReset: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 9,
  },
  questResetText: { color: colors.gold, fontSize: 11 },
  questCard: {
    borderTopWidth: 1,
    borderColor: "#6c7654",
    borderRadius: 3,
    padding: 15,
    marginBottom: 12,
  },
  questTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  questTitle: {
    fontFamily: "Barlow",
    fontSize: 24,
    color: colors.cream,
    flex: 1,
  },
  questReward: { flexDirection: "row", alignItems: "center", gap: 5 },
  questRewardText: { fontFamily: "Barlow", fontSize: 23, color: colors.gold },
  questDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 6,
  },
  questProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    marginBottom: 13,
  },
  questCount: { color: "#c9cfbe", fontFamily: "Barlow", fontSize: 18 },
  questCollected: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  questCollectedText: {
    fontFamily: "Barlow",
    fontSize: 19,
    color: colors.green,
  },
  empty: { paddingHorizontal: 20, paddingVertical: 24, gap: 20 },
});
