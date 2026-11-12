import {
  isBattlePassState,
  type BattlePassAction,
  type BattlePassReceipt,
  type BattlePassState,
  type PendingBattlePass,
} from './battlepass';

export interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type Resource = { resource_id: string; quantity: string };
export type PlayerData = {
  player_id: string;
  account_id: string;
  resources: Resource[];
};
export type Price = { currency: Record<string, number> };
export type StaticOffer = {
  offer_id: string;
  package_id: string;
  price: Price;
  items: Record<string, number>;
};
export type DailyOffer = {
  offer_id: string;
  package_id: string;
  original_price: Price;
  final_price: Price;
  items: Record<string, number>;
  discount_percent: number;
  purchased: number;
  remaining: number;
  purchase_limit: number;
};
export type ShopData = {
  static: {
    slots: { slot_id: string; offer: StaticOffer }[];
    server_time: string;
  };
  daily: {
    slots: { slot_id: string; offer: DailyOffer }[];
    cycle_start: string;
    expires_at: string;
    server_time: string;
  };
};
export type PurchaseReceipt = {
  items: Resource[];
  resources: Resource[];
  offer_id: string;
};
export type PendingPurchase = { offerId: string; requestId: string };
type LoginBody = {
  device_id: string;
  client: { platform: string; identifier: string; version: string };
};
type Credentials = {
  deviceId: string;
  login?: { requestId: string; body: LoginBody };
  purchase?: PendingPurchase;
  passOperation?: PendingBattlePass;
};
type ClientOptions = {
  storage: Storage;
  requestId: () => string;
  fetch?: typeof fetch;
  platform?: string;
  timeoutMs?: number;
};

export class GameError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 0,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'GameError';
  }
}

export function normalizeServerUrl(input: string): string {
  try {
    const url = new URL(input.trim());
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/*$/.test(url.pathname)
    ) {
      throw new Error();
    }
    return url.origin;
  } catch {
    throw new GameError(
      'INVALID_SERVER',
      'Enter a server address such as http://192.168.1.10:8080.',
    );
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resources(value: unknown): value is Resource[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        record(item) &&
        typeof item.resource_id === 'string' &&
        typeof item.quantity === 'string' &&
        /^\d+$/.test(item.quantity),
    )
  );
}

function quantities(value: unknown): value is Record<string, number> {
  return (
    record(value) &&
    Object.values(value).every(
      (quantity) => Number.isSafeInteger(quantity) && Number(quantity) > 0,
    )
  );
}

function price(value: unknown): value is Price {
  return (
    record(value) &&
    quantities(value.currency) &&
    Object.keys(value.currency).length === 1
  );
}

function offer(value: unknown, daily: boolean): boolean {
  if (
    !record(value) ||
    typeof value.offer_id !== 'string' ||
    typeof value.package_id !== 'string' ||
    !quantities(value.items)
  )
    return false;
  if (!daily) return price(value.price);
  return (
    price(value.original_price) &&
    price(value.final_price) &&
    ['discount_percent', 'purchased', 'remaining', 'purchase_limit'].every(
      (key) => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0,
    )
  );
}

function shop(value: unknown, daily: boolean): boolean {
  if (
    !record(value) ||
    typeof value.server_time !== 'string' ||
    !/^\d+$/.test(value.server_time) ||
    !Array.isArray(value.slots)
  )
    return false;
  if (
    daily &&
    (typeof value.cycle_start !== 'string' ||
      !/^\d+$/.test(value.cycle_start) ||
      typeof value.expires_at !== 'string' ||
      !/^\d+$/.test(value.expires_at))
  )
    return false;
  return value.slots.every(
    (slot) =>
      record(slot) &&
      typeof slot.slot_id === 'string' &&
      offer(slot.offer, daily),
  );
}

function invalidResponse(): GameError {
  return new GameError(
    'INVALID_RESPONSE',
    'The server returned an unexpected response. Try again.',
    0,
    true,
  );
}

export class GameClient {
  readonly baseUrl: string;
  private readonly storageKey: string;
  private state?: Credentials;
  private loading?: Promise<void>;
  private token?: string;
  private loggingIn?: Promise<void>;
  private purchasing?: Promise<PurchaseReceipt>;
  private activeOffer?: string;
  private battleOperation?: {
    key: string;
    promise: Promise<BattlePassReceipt>;
  };
  private writing: Promise<void> = Promise.resolve();

  constructor(
    baseUrl: string,
    private readonly options: ClientOptions,
  ) {
    this.baseUrl = normalizeServerUrl(baseUrl);
    this.storageKey = `fantasy-game:${this.baseUrl}`;
  }

  get pendingPurchase(): PendingPurchase | null {
    return this.state?.purchase ? { ...this.state.purchase } : null;
  }

  get pendingBattlePass(): PendingBattlePass | null {
    return this.state?.passOperation ? { ...this.state.passOperation } : null;
  }

  async connect(): Promise<PlayerData> {
    return this.refreshPlayer();
  }

  async refreshPlayer(): Promise<PlayerData> {
    await this.ensureSession();
    const value = await this.authenticated('/api/002007', {});
    if (
      !record(value) ||
      typeof value.player_id !== 'string' ||
      typeof value.account_id !== 'string' ||
      !resources(value.resources)
    )
      throw invalidResponse();
    return value as PlayerData;
  }

  async loadShop(): Promise<ShopData> {
    await this.ensureSession();
    const [staticShop, dailyShop] = await Promise.all([
      this.authenticated('/api/003004', {}),
      this.authenticated('/api/003005', {}),
    ]);
    if (!shop(staticShop, false) || !shop(dailyShop, true))
      throw invalidResponse();
    return { static: staticShop, daily: dailyShop } as ShopData;
  }

  async loadBattlePass(): Promise<BattlePassState> {
    await this.ensureSession();
    const value = await this.authenticated('/api/004001', {});
    if (!isBattlePassState(value)) throw invalidResponse();
    return value;
  }

  battlePassAction(
    action: BattlePassAction,
    passId: string,
    targetId = '',
  ): Promise<BattlePassReceipt> {
    const key = JSON.stringify([action, passId, targetId]);
    if (this.purchasing)
      return Promise.reject(
        new GameError(
          'PURCHASE_PENDING',
          'Check the pending shop purchase before continuing.',
        ),
      );
    if (this.battleOperation) {
      if (this.battleOperation.key === key) return this.battleOperation.promise;
      return Promise.reject(
        new GameError(
          'PURCHASE_PENDING',
          'Check the pending Battle Pass action before continuing.',
        ),
      );
    }
    const promise = this.performBattlePassAction(
      action,
      passId,
      targetId,
    ).finally(() => {
      this.battleOperation = undefined;
    });
    this.battleOperation = { key, promise };
    return promise;
  }

  async retryBattlePass(): Promise<BattlePassReceipt> {
    await this.loadState();
    const pending = this.state?.passOperation;
    if (!pending)
      throw new GameError(
        'NO_PENDING_PURCHASE',
        'There is no Battle Pass action to check.',
      );
    return this.battlePassAction(
      pending.action,
      pending.passId,
      pending.targetId,
    );
  }

  private async performBattlePassAction(
    action: BattlePassAction,
    passId: string,
    targetId: string,
  ): Promise<BattlePassReceipt> {
    await this.ensureSession();
    if (
      !['claim', 'premium', 'quest'].includes(action) ||
      !passId ||
      passId.length > 128 ||
      targetId.length > 128 ||
      (action !== 'premium' && !targetId) ||
      (action === 'premium' && targetId)
    ) {
      throw new GameError(
        'INVALID_REQUEST',
        'Choose a current Battle Pass action.',
      );
    }
    if (this.state!.purchase)
      throw new GameError(
        'PURCHASE_PENDING',
        'Check the pending shop purchase before continuing.',
      );
    const previous = this.state!.passOperation;
    if (
      previous &&
      (previous.action !== action ||
        previous.passId !== passId ||
        previous.targetId !== targetId)
    ) {
      throw new GameError(
        'PURCHASE_PENDING',
        'Check the pending Battle Pass action before continuing.',
      );
    }
    if (!previous)
      await this.save({
        passOperation: {
          action,
          passId,
          targetId,
          requestId: this.options.requestId(),
        },
      });
    const pending = this.state!.passOperation!;
    const path = {
      claim: '/api/004002',
      premium: '/api/004003',
      quest: '/api/004004',
    }[action];
    const body = {
      pass_id: passId,
      ...(action === 'claim' ? { node_id: targetId } : {}),
      ...(action === 'quest' ? { quest_id: targetId } : {}),
    };
    try {
      const value = await this.authenticated(path, body, pending.requestId);
      if (
        !record(value) ||
        !isBattlePassState(value.pass) ||
        value.pass.pass_id !== passId ||
        !resources(value.items) ||
        !resources(value.resources)
      )
        throw invalidResponse();
      await this.save({ passOperation: undefined });
      return value as BattlePassReceipt;
    } catch (error) {
      if (error instanceof GameError && !error.retryable)
        await this.save({ passOperation: undefined });
      throw error;
    }
  }

  purchase(offerId: string): Promise<PurchaseReceipt> {
    if (this.battleOperation)
      return Promise.reject(
        new GameError(
          'PURCHASE_PENDING',
          'Check the pending Battle Pass action before buying another offer.',
        ),
      );
    if (this.purchasing) {
      if (offerId === this.activeOffer) return this.purchasing;
      return Promise.reject(
        new GameError(
          'PURCHASE_PENDING',
          'Finish the current purchase before choosing another offer.',
        ),
      );
    }
    this.activeOffer = offerId;
    this.purchasing = this.performPurchase(offerId).finally(() => {
      this.purchasing = undefined;
      this.activeOffer = undefined;
    });
    return this.purchasing;
  }

  async retryPurchase(): Promise<PurchaseReceipt> {
    await this.loadState();
    if (!this.state?.purchase)
      throw new GameError(
        'NO_PENDING_PURCHASE',
        'There is no purchase to retry.',
      );
    return this.purchase(this.state.purchase.offerId);
  }

  private async performPurchase(offerId: string): Promise<PurchaseReceipt> {
    await this.ensureSession();
    if (this.state!.passOperation)
      throw new GameError(
        'PURCHASE_PENDING',
        'Check the pending Battle Pass action before buying another offer.',
      );
    if (!offerId || offerId.length > 256)
      throw new GameError('INVALID_PURCHASE', 'Choose an available offer.');
    if (this.state!.purchase && this.state!.purchase.offerId !== offerId) {
      throw new GameError(
        'PURCHASE_PENDING',
        'The previous purchase is awaiting confirmation. Retry it before buying another offer.',
      );
    }
    if (!this.state!.purchase) {
      await this.save({
        purchase: { offerId, requestId: this.options.requestId() },
      });
    }
    try {
      const value = await this.authenticated(
        '/api/003002',
        { id: offerId, amount: 1 },
        this.state!.purchase!.requestId,
      );
      if (
        !record(value) ||
        value.offer_id !== offerId ||
        !resources(value.items) ||
        !resources(value.resources)
      )
        throw invalidResponse();
      await this.save({ purchase: undefined });
      return value as PurchaseReceipt;
    } catch (error) {
      if (error instanceof GameError && !error.retryable)
        await this.save({ purchase: undefined });
      throw error;
    }
  }

  private async loadState(): Promise<void> {
    if (this.state) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        const stored = await this.options.storage.getItem(this.storageKey);
        if (stored) {
          const value = JSON.parse(stored);
          if (
            !record(value) ||
            typeof value.deviceId !== 'string' ||
            !/^[A-Za-z0-9_-]{1,128}$/.test(value.deviceId)
          )
            throw new Error();
          if (
            value.purchase &&
            (!record(value.purchase) ||
              typeof value.purchase.offerId !== 'string' ||
              typeof value.purchase.requestId !== 'string')
          )
            throw new Error();
          if (
            value.passOperation &&
            (!record(value.passOperation) ||
              !['claim', 'premium', 'quest'].includes(
                String(value.passOperation.action),
              ) ||
              typeof value.passOperation.passId !== 'string' ||
              typeof value.passOperation.targetId !== 'string' ||
              typeof value.passOperation.requestId !== 'string')
          )
            throw new Error();
          if (
            value.login &&
            (!record(value.login) ||
              typeof value.login.requestId !== 'string' ||
              !record(value.login.body) ||
              value.login.body.device_id !== value.deviceId)
          )
            throw new Error();
          this.state = value as Credentials;
        } else {
          await this.save({ deviceId: this.options.requestId() });
        }
      } catch (error) {
        if (error instanceof GameError) throw error;
        throw new GameError(
          'STORAGE_ERROR',
          'Your saved game could not be loaded. Check device storage and try again.',
          0,
          true,
        );
      }
    })().finally(() => {
      this.loading = undefined;
    });
    return this.loading;
  }

  private save(patch: Partial<Credentials>): Promise<void> {
    // Session recovery and a purchase can both update the saved credentials.
    this.writing = this.writing
      .catch(() => {})
      .then(async () => {
        const state = { ...this.state, ...patch } as Credentials;
        try {
          await this.options.storage.setItem(
            this.storageKey,
            JSON.stringify(state),
          );
          this.state = state;
        } catch {
          throw new GameError(
            'STORAGE_ERROR',
            'Your game could not be saved on this device. Free some storage and try again.',
            0,
            true,
          );
        }
      });
    return this.writing;
  }

  private async ensureSession(): Promise<void> {
    await this.loadState();
    if (this.token) return;
    if (this.loggingIn) return this.loggingIn;
    this.loggingIn = this.login().finally(() => {
      this.loggingIn = undefined;
    });
    return this.loggingIn;
  }

  private async login(): Promise<void> {
    if (!this.state!.login) {
      await this.save({
        login: {
          requestId: this.options.requestId(),
          body: {
            device_id: this.state!.deviceId,
            client: {
              platform: this.options.platform ?? 'ios',
              identifier: 'fantasy-mobile-demo',
              version: '1.0.0',
            },
          },
        },
      });
    }
    const pending = this.state!.login!;
    try {
      const value = await this.request(
        '/api/001002',
        pending.body,
        pending.requestId,
      );
      if (
        !record(value) ||
        value.device_id !== this.state!.deviceId ||
        typeof value.access_token !== 'string' ||
        !value.access_token ||
        typeof value.account_id !== 'string' ||
        typeof value.player_id !== 'string'
      )
        throw invalidResponse();
      await this.save({ login: undefined });
      this.token = value.access_token;
    } catch (error) {
      if (error instanceof GameError && !error.retryable)
        await this.save({ login: undefined });
      throw error;
    }
  }

  private async authenticated(
    path: string,
    body: unknown,
    requestId?: string,
  ): Promise<unknown> {
    const originalToken = this.token;
    try {
      return await this.request(path, body, requestId, originalToken);
    } catch (error) {
      if (
        !(error instanceof GameError) ||
        error.code !== 'AUTH_INVALID' ||
        error.status !== 401
      )
        throw error;
      if (this.token === originalToken) this.token = undefined;
      await this.ensureSession();
      return this.request(path, body, requestId, this.token);
    }
  }

  private async request(
    path: string,
    body: unknown,
    requestId?: string,
    token?: string,
  ): Promise<unknown> {
    const abort = new AbortController();
    const timeout = setTimeout(
      () => abort.abort(),
      this.options.timeoutMs ?? 12000,
    );
    try {
      const response = await (this.options.fetch ?? fetch)(
        `${this.baseUrl}${path}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(requestId ? { 'X-Request-Id': requestId } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
          signal: abort.signal,
        },
      );
      let value: unknown;
      try {
        value = await response.json();
      } catch {
        throw invalidResponse();
      }
      if (!response.ok) {
        if (
          !record(value) ||
          typeof value.code !== 'string' ||
          typeof value.message !== 'string'
        )
          throw invalidResponse();
        throw new GameError(
          value.code,
          value.message,
          response.status,
          ['RETRY', 'AUTH_INVALID'].includes(value.code) ||
            response.status >= 500 ||
            [408, 429].includes(response.status),
        );
      }
      return value;
    } catch (error) {
      if (error instanceof GameError) throw error;
      throw new GameError(
        'CONNECTION_FAILED',
        'Could not reach your game server. Check the address and connect your phone and Mac to the same Wi-Fi.',
        0,
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
