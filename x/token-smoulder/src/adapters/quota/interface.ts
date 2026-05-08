export type QuotaScope = 'session' | 'week';

export type QuotaSnapshot = {
  session: number;
  week: number;
  sampledAt: string;
  source: string;
};

export type QuotaSource = {
  read(): Promise<QuotaSnapshot>;
};
