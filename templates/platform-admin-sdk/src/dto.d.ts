export type HealthStatus = 'ok' | 'degraded' | 'down'
export interface HealthDto { status: HealthStatus; version: string; checks: Array<{ name: string; ok: boolean; detail: string }>; ts: string }
export interface ReleaseDto { id: string; version: string; commit: string; deployedAt: string; deployer: string; status: 'live' | 'previous' | 'failed'; notes?: string }
export interface ErrorDto { fingerprint: string; message: string; count: number; firstSeen: string; lastSeen: string; level: string; sample: { route: string; stack?: string } }
export interface UsageDto { activeUsers: number; newUsers: number; events: Array<{ name: string; count: number }> }
export interface RevenueDto { currency: string; mrr: number; newMrr: number; churnedMrr: number; failedPayments: number; trials: { started: number; converted: number } }
