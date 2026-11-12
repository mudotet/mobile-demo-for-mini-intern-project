import React, { useState } from "react";
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
        color="#fff3bf"
        style={{ position: "absolute", left: size * 0.09, top: size * 0.14 }}
      />
      <Icon
        name="star-four-points"
        size={size * 0.08}
        color="#adf1f2"
        style={{ position: "absolute", right: size * 0.08, top: size * 0.35 }}
      />
    </View>
  );
}

function StepShield({ step, reached }: { step: number; reached: boolean }) {
  return (
    <View style={s.stepShield}>
      <Icon name="shield" size={40} color={reached ? "#edbd60" : "#aa8050"} />
      <Icon
        name="shield"
        size={32}
        color={reached ? "#8d412f" : "#243d50"}
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
  return (
    <View style={s.ladderRow} testID={`pass-node-${node.node_id}`}>
      <View style={s.stepPosition}>
        <StepShield step={milestone.step} reached={reached} />
      </View>
      <LinearGradient
        colors={
          node.claimable
            ? premium
              ? ["#8e5c20", "#50391f", "#273444"]
              : ["#235b6b", "#173d51", "#142d42"]
            : ["#254456", "#172f43", "#102237"]
        }
        style={[
          s.rewardCard,
          premium && s.premiumCard,
          node.claimable && (premium ? s.goldGlow : s.cyanGlow),
          node.claimed && s.claimedCard,
        ]}
      >
        <View style={[s.laneRibbon, premium && s.premiumRibbon]}>
          {premium && <Icon name="crown" size={11} color="#ffe1a1" />}
          <Text style={[s.laneText, premium && { color: "#ffe5a4" }]}>
            {premium ? "PREMIUM" : "FREE REWARD"}
          </Text>
        </View>
        <View style={s.nodeArt}>
          <RewardArt kind={kind} size={80} />
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
              ? `Collected ${node.node_id}`
              : node.claimable
                ? `Claim ${node.node_id}`
                : premiumLocked
                  ? `Unlock Premium for ${node.node_id}`
                  : `Locked ${node.node_id}: ${milestone.required_expbp} EXPBP required`
          }
          accessibilityState={{ disabled: unavailable }}
          disabled={unavailable}
          onPress={premiumLocked ? onPremium : onClaim}
          style={({ pressed }) => [
            s.claimButton,
            node.claimable && (premium ? s.goldClaim : s.cyanClaim),
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
              node.claimable ? "#fff1c7" : node.claimed ? "#9ee3bb" : "#b3c5cb"
            }
          />
          <Text style={[s.claimText, node.claimed && { color: "#a6e0bf" }]}>
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
      </LinearGradient>
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
  const compact =
    useWindowDimensions().height < 740 ||
    (availableHeight !== null && availableHeight < 650);
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
      <LinearGradient
        colors={["#154d60", "#17384d", "#411e35"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[s.banner, compact && s.compactBanner]}
        testID="pass-season-banner"
      >
        <View style={s.bannerFacets} />
        <View style={s.bannerRay} />
        <View style={s.bannerTop}>
          <View style={s.seasonCrest}>
            <Icon name="shield" size={compact ? 76 : 86} color="#b87e3b" />
            <Icon
              name="shield"
              size={compact ? 65 : 74}
              color="#e7c16e"
              style={s.crestInset}
            />
            <Icon
              name="shield"
              size={compact ? 55 : 63}
              color="#8b3042"
              style={s.crestInset}
            />
            <Icon
              name="crown"
              size={compact ? 34 : 39}
              color="#ffe7a0"
              style={s.crestInset}
            />
          </View>
          <View style={s.bannerCopy}>
            <Text style={s.seasonName} numberOfLines={1}>
              {pass?.name.toUpperCase() || "THE SEASON JOURNEY"}
            </Text>
            <Text style={[s.title, compact && { fontSize: 29 }]}>
              BATTLE PASS
            </Text>
            <View style={s.seasonTime}>
              <Icon name="timer-sand" size={13} color="#e5c481" />
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
            <Icon name="refresh" size={20} color="#e8cf98" />
          </Pressable>
        </View>
        {pass && (
          <View style={s.bannerProgress}>
            <View style={s.levelBadge}>
              <Text style={s.levelText}>{reached}</Text>
            </View>
            <View style={s.progressTrack}>
              <LinearGradient
                colors={["#167b99", "#5cd2d5"]}
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
      </LinearGradient>
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
                    section === tab && { color: "#ffe6aa" },
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
                      color="#9abac6"
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
                      size={compact ? 80 : 126}
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
                        colors={["#f1cc79", "#d99937", "#a86827"]}
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
                              <ResourceIcon kind={kind} size={24} />
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
                testID="pass-ladder"
                style={s.ladder}
                contentContainerStyle={s.ladderContent}
                refreshControl={refreshControl}
                showsVerticalScrollIndicator={false}
              >
                <View style={s.railLine} />
                {milestones.flatMap((milestone) =>
                  ([true, false] as const).map((premium) => {
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
                  }),
                )}
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
                  colors={["#254452", "#142c3e"]}
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
                    <View style={[s.progressTrack, { flex: 1, height: 8 }]}>
                      <LinearGradient
                        colors={["#307d83", "#9ddac5"]}
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
  screen: { flex: 1, minHeight: 0, backgroundColor: "#102237" },
  banner: {
    minHeight: 140,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 13,
    borderTopWidth: 2,
    borderBottomWidth: 3,
    borderColor: "#b58b49",
    overflow: "hidden",
  },
  compactBanner: { minHeight: 119, paddingTop: 4, paddingBottom: 9 },
  bannerFacets: {
    position: "absolute",
    width: 230,
    height: 230,
    borderWidth: 30,
    borderColor: "#e4bd6120",
    transform: [{ rotate: "35deg" }],
    left: -84,
    top: -71,
  },
  bannerRay: {
    position: "absolute",
    width: 260,
    height: 270,
    backgroundColor: "#a1224033",
    transform: [{ rotate: "24deg" }],
    right: -150,
    top: -95,
  },
  bannerTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  seasonCrest: {
    width: 74,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
  crestInset: { position: "absolute" },
  bannerCopy: { flex: 1, minWidth: 0 },
  seasonName: {
    color: "#e2c697",
    fontFamily: "Barlow",
    fontSize: 11,
    letterSpacing: 0.7,
    marginBottom: 2,
  },
  title: {
    fontFamily: "Barlow",
    fontSize: 34,
    lineHeight: 37,
    color: "#ffe297",
    textShadowColor: "#061425",
    textShadowOffset: { width: 1, height: 3 },
    textShadowRadius: 2,
  },
  seasonTime: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  timeText: { fontFamily: "Barlow", fontSize: 16, color: "#f1e3c5" },
  refreshButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
    marginRight: -8,
  },
  bannerProgress: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 69,
    marginTop: 3,
  },
  levelBadge: {
    width: 24,
    height: 26,
    backgroundColor: "#8d3a31",
    borderWidth: 2,
    borderColor: "#e6be70",
    alignItems: "center",
    justifyContent: "center",
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  levelText: {
    fontFamily: "Barlow",
    color: "#fff0bd",
    fontSize: 17,
    lineHeight: 20,
  },
  progressTrack: {
    height: 24,
    flex: 1,
    borderRadius: 5,
    overflow: "hidden",
    backgroundColor: "#09182b",
    borderWidth: 1,
    borderColor: "#718390",
    justifyContent: "center",
  },
  progressFill: { height: "100%", position: "absolute", left: 0 },
  expValue: {
    fontFamily: "Barlow",
    color: "#fff1c9",
    fontSize: 16,
    textAlign: "center",
    textShadowColor: "#102032",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 1,
  },
  segmented: {
    flexDirection: "row",
    backgroundColor: "#0a192b",
    borderWidth: 1,
    borderColor: "#4c6375",
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 10,
    padding: 3,
    borderRadius: 7,
    gap: 3,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 4,
  },
  segmentSelected: {
    backgroundColor: "#2a4857",
    borderBottomWidth: 2,
    borderBottomColor: "#d9af59",
  },
  segmentText: {
    color: "#9db8c6",
    fontFamily: "Barlow",
    fontSize: 17,
    letterSpacing: 0.3,
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
    paddingLeft: 11,
    paddingRight: 10,
    gap: 5,
  },
  featuredPanel: {
    width: "40%",
    flexShrink: 0,
    minHeight: 0,
    backgroundColor: "#0e2034",
  },
  featuredScroll: { flex: 1, minHeight: 0 },
  featuredContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingTop: 9,
    paddingBottom: 12,
  },
  featuredRibbon: {
    alignSelf: "stretch",
    alignItems: "center",
    paddingVertical: 5,
    backgroundColor: "#8e2939",
    borderTopWidth: 1,
    borderBottomWidth: 2,
    borderColor: "#b78c52",
    marginHorizontal: 1,
  },
  featuredTitle: {
    fontFamily: "Barlow",
    fontSize: 15,
    color: "#ffe19b",
    textShadowColor: "#35131c",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 1,
  },
  featuredRequirement: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 8,
  },
  featuredUnlock: { fontFamily: "Barlow", fontSize: 13, color: "#c5d5d7" },
  featuredStep: {
    width: 21,
    height: 24,
    backgroundColor: "#873d39",
    borderWidth: 1,
    borderColor: "#cfaf6c",
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
  featuredStepText: { fontFamily: "Barlow", fontSize: 17, color: "#ffe1ab" },
  featuredArt: { marginTop: 19 },
  art: { alignItems: "center", justifyContent: "center" },
  artHalo: {
    position: "absolute",
    backgroundColor: "#7dc9dc0b",
    borderWidth: 1,
    borderColor: "#75daea1c",
  },
  featuredHalo: {
    backgroundColor: "#70e6ed15",
    borderColor: "#75daea48",
    boxShadow: "0 0 22px #42e3f12e",
  },
  artDiamond: {
    position: "absolute",
    backgroundColor: "#ac845f11",
    borderWidth: 1,
    borderColor: "#d4bc8e3b",
    transform: [{ rotate: "45deg" }],
    borderRadius: 8,
  },
  gemDiamond: { backgroundColor: "#4ee7e90b", borderColor: "#93f0df33" },
  artMain: { transform: [{ rotate: "-7deg" }] },
  artShard: { position: "absolute", transform: [{ rotate: "19deg" }] },
  featuredQuantity: {
    fontFamily: "Barlow",
    fontSize: 47,
    lineHeight: 51,
    color: "#fff0be",
    textShadowColor: "#061022",
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 1,
  },
  featuredName: {
    fontFamily: "Barlow",
    fontSize: 23,
    color: "#f5d278",
    letterSpacing: 1,
  },
  compactFeaturedName: { fontSize: 18, color: "#f5d278" },
  premiumDock: {
    alignSelf: "stretch",
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  premiumButton: {
    minHeight: 70,
    borderWidth: 2,
    borderColor: "#e2d1a1",
    borderRadius: 9,
    borderBottomWidth: 4,
    borderBottomColor: "#78502d",
    overflow: "hidden",
  },
  premiumButtonFill: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 5,
    minHeight: 65,
  },
  premiumButtonHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  premiumButtonText: { color: "#5e3219", fontFamily: "Barlow", fontSize: 14 },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 1,
  },
  priceValue: {
    color: "#fff0c2",
    fontFamily: "Barlow",
    fontSize: 29,
    lineHeight: 32,
    textShadowColor: "#6b381c",
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 1,
  },
  premiumActive: {
    minHeight: 70,
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#b59353",
    borderRadius: 9,
    backgroundColor: "#393d35",
  },
  premiumActiveText: { fontFamily: "Barlow", color: colors.gold, fontSize: 16 },
  ladder: { flex: 1, minWidth: 0, minHeight: 0 },
  ladderContent: { paddingTop: 8, paddingBottom: 24 },
  railLine: {
    position: "absolute",
    left: 16,
    top: 8,
    bottom: 0,
    width: 3,
    backgroundColor: "#768b91",
    borderLeftWidth: 1,
    borderLeftColor: "#b0b6a3",
  },
  ladderRow: { paddingLeft: 27, paddingBottom: 15, minWidth: 0 },
  stepPosition: { position: "absolute", left: -3, top: 39, zIndex: 2 },
  stepShield: {
    width: 40,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  shieldInner: { position: "absolute" },
  stepText: {
    position: "absolute",
    top: 9,
    fontFamily: "Barlow",
    color: "#ffe4b0",
    fontSize: 23,
    textShadowColor: "#263b44",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 1,
  },
  rewardCard: {
    minHeight: 177,
    borderWidth: 2,
    borderColor: "#8fa5b4",
    borderBottomWidth: 4,
    borderBottomColor: "#061425",
    borderRadius: 11,
    paddingHorizontal: 7,
    paddingBottom: 7,
    paddingTop: 26,
    alignItems: "center",
  },
  premiumCard: { borderColor: "#be9b5e", borderBottomColor: "#5a442e" },
  cyanGlow: {
    borderColor: "#90f2ff",
    boxShadow: "0 0 13px #61d9ff75",
    borderBottomColor: "#4cc7df",
  },
  goldGlow: {
    borderColor: "#ffe28e",
    boxShadow: "0 0 15px #f5ae3c80",
    borderBottomColor: "#b68334",
  },
  claimedCard: { borderColor: "#6eab97", borderBottomColor: "#2b6256" },
  laneRibbon: {
    position: "absolute",
    top: 7,
    left: -5,
    minHeight: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#1d6377",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#71a6b2",
    paddingHorizontal: 9,
  },
  premiumRibbon: { backgroundColor: "#a4273d", borderColor: "#c5a061" },
  laneText: {
    color: "#bfe5ec",
    fontFamily: "Barlow",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  nodeArt: { marginTop: 0 },
  rewardQuantity: {
    color: "#fff0c7",
    fontFamily: "Barlow",
    fontSize: 29,
    lineHeight: 32,
    textAlign: "center",
    marginTop: -4,
    marginBottom: 7,
    textShadowColor: "#051525",
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 1,
  },
  rewardKind: { color: "#d9e4dc", fontSize: 17 },
  extraReward: {
    color: "#d9e4dc",
    fontFamily: "Barlow",
    fontSize: 16,
    marginBottom: 4,
  },
  claimButton: {
    alignSelf: "stretch",
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "#0c2034",
    borderWidth: 1,
    borderColor: "#426377",
    borderRadius: 5,
  },
  cyanClaim: { backgroundColor: "#24718a", borderColor: "#a8eef2" },
  goldClaim: { backgroundColor: "#9c6427", borderColor: "#f3d27a" },
  collectedButton: { backgroundColor: "#1a453f", borderColor: "#589783" },
  claimText: { fontFamily: "Barlow", color: "#cedbe0", fontSize: 14 },
  nodeThreshold: {
    color: "#b8cbd1",
    fontFamily: "Barlow",
    fontSize: 12,
    marginTop: 4,
  },
  claimedCheck: {
    position: "absolute",
    right: 6,
    top: 5,
    backgroundColor: "#a0dfb4",
    width: 25,
    height: 25,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.75, transform: [{ translateY: 1 }] },
  questScroll: { flex: 1, minHeight: 0 },
  questContent: { paddingHorizontal: 18, paddingTop: 5, paddingBottom: 25 },
  questIntro: { marginBottom: 16 },
  questHeading: {
    fontFamily: "Cinzel",
    fontSize: 20,
    color: colors.cream,
    marginBottom: 7,
  },
  body: { color: "#b4cbd2", fontSize: 12, lineHeight: 19 },
  questReset: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 9,
  },
  questResetText: { color: "#d0bc8e", fontSize: 11 },
  questCard: {
    borderWidth: 1,
    borderColor: "#648595",
    borderRadius: 12,
    padding: 15,
    marginBottom: 13,
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
    color: "#b5cbd1",
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
  questCount: { color: "#d1ddda", fontFamily: "Barlow", fontSize: 18 },
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
  empty: { paddingHorizontal: 18, paddingVertical: 24, gap: 20 },
});
