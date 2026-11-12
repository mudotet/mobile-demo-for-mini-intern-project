import type { Price, Resource } from './game';

export type BattlePassNode = {
  node_id: string;
  items: Record<string, number>;
  claimed: boolean;
  claimable: boolean;
};

export type BattlePassMilestone = {
  step: number;
  required_expbp: number;
  free: BattlePassNode;
  premium: BattlePassNode;
};

export type BattlePassQuest = {
  quest_id: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  expbp_reward: number;
  claimed: boolean;
  claimable: boolean;
};

export type BattlePassState = {
  pass_id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  server_time: string;
  quests_reset_at: string;
  expbp: number;
  premium_owned: boolean;
  premium_price: Price;
  milestones: BattlePassMilestone[];
  quests: BattlePassQuest[];
};

export type BattlePassAction = 'claim' | 'premium' | 'quest';
export type PendingBattlePass = {
  action: BattlePassAction;
  passId: string;
  targetId: string;
  requestId: string;
};

export type BattlePassReceipt = {
  pass: BattlePassState;
  items: Resource[];
  resources: Resource[];
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonnegative(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function node(value: unknown): value is BattlePassNode {
  return (
    record(value) &&
    typeof value.node_id === 'string' &&
    value.node_id.length > 0 &&
    record(value.items) &&
    Object.keys(value.items).length > 0 &&
    Object.values(value.items).every((item) => nonnegative(item) && item > 0) &&
    typeof value.claimed === 'boolean' &&
    typeof value.claimable === 'boolean'
  );
}

export function isBattlePassState(value: unknown): value is BattlePassState {
  if (
    !record(value) ||
    typeof value.pass_id !== 'string' ||
    !value.pass_id ||
    typeof value.name !== 'string' ||
    !nonnegative(value.expbp) ||
    typeof value.premium_owned !== 'boolean'
  )
    return false;
  if (
    !['starts_at', 'ends_at', 'server_time', 'quests_reset_at'].every(
      (key) =>
        typeof value[key] === 'string' && /^\d+$/.test(value[key] as string) && Number.isSafeInteger(Number(value[key])),
    )
  )
    return false;
  const start = Number(value.starts_at);
  const end = Number(value.ends_at);
  const now = Number(value.server_time);
  const reset = Number(value.quests_reset_at);
  if (end <= start || now < start || now >= end || reset <= now || reset > end) return false;
  if (
    !record(value.premium_price) ||
    !record(value.premium_price.currency) ||
    Object.keys(value.premium_price.currency).length !== 1 ||
    !Object.values(value.premium_price.currency).every(
      (item) => nonnegative(item) && item > 0,
    )
  )
    return false;
  return (
    Array.isArray(value.milestones) &&
    value.milestones.length > 0 &&
    value.milestones.every(
      (item) =>
        record(item) &&
        nonnegative(item.step) &&
        item.step > 0 &&
        nonnegative(item.required_expbp) &&
        node(item.free) &&
        node(item.premium),
    ) &&
    Array.isArray(value.quests) &&
    value.quests.every(
      (item) =>
        record(item) &&
        typeof item.quest_id === 'string' &&
        item.quest_id.length > 0 &&
        typeof item.title === 'string' &&
        typeof item.description === 'string' &&
        nonnegative(item.progress) &&
        nonnegative(item.target) &&
        item.target > 0 &&
        nonnegative(item.expbp_reward) &&
        typeof item.claimed === 'boolean' &&
        typeof item.claimable === 'boolean',
    )
  );
}
