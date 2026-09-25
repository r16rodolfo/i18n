import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";

import type { UsageService } from "@/lib/usage-pricing";

import { db } from "@/db";
import { rooms, usageEvents } from "@/db/schema";

// Saves and adds up what meetings used of the paid services (see
// usage-pricing.ts for the prices). Saving never throws: a failed row only
// makes the estimate a little low, it must not break the call.

export interface UsageRecord {
  // The room as it appears in the URL (Daily room name)
  roomName: string;
  // Known by most callers already; looked up by name otherwise
  roomId?: string | null;
  service: UsageService;
  quantity: number;
  costUsd: number | null;
  visitorId?: string | null;
  detail?: Record<string, unknown>;
}

export async function recordUsage(records: UsageRecord[]) {
  const rows = records.filter((record) => record.quantity > 0);
  if (rows.length === 0) return;
  try {
    const missing = [
      ...new Set(rows.filter((r) => !r.roomId).map((r) => r.roomName)),
    ];
    const ids = new Map<string, string>();
    if (missing.length > 0) {
      const found = await db
        .select({ id: rooms.id, name: rooms.dailyRoomName })
        .from(rooms)
        .where(inArray(rooms.dailyRoomName, missing));
      for (const room of found) ids.set(String(room.name), String(room.id));
    }

    await db.insert(usageEvents).values(
      rows.map((record) => ({
        roomId: record.roomId ?? ids.get(record.roomName) ?? null,
        roomName: record.roomName,
        service: record.service,
        quantity: record.quantity,
        costUsd: record.costUsd,
        visitorId: record.visitorId ?? null,
        detail: record.detail ?? null,
      })),
    );
  } catch (error) {
    console.error("[usage] failed to save:", error);
  }
}

export interface ServiceTotal {
  service: UsageService;
  quantity: number;
  costUsd: number;
}

// Totals by service for one room
export async function getRoomUsage(roomId: string) {
  const rows = await db
    .select({
      service: usageEvents.service,
      quantity: sql<number>`coalesce(sum(${usageEvents.quantity}), 0)`,
      costUsd: sql<number>`coalesce(sum(${usageEvents.costUsd}), 0)`,
    })
    .from(usageEvents)
    .where(eq(usageEvents.roomId, roomId))
    .groupBy(usageEvents.service);
  return summarize(rows);
}

// Estimated total cost of each of these rooms (room id -> dollars)
export async function getRoomsCost(roomIds: string[]) {
  const costs = new Map<string, number>();
  if (roomIds.length === 0) return costs;
  const rows = await db
    .select({
      roomId: usageEvents.roomId,
      costUsd: sql<number>`coalesce(sum(${usageEvents.costUsd}), 0)`,
    })
    .from(usageEvents)
    .where(inArray(usageEvents.roomId, roomIds))
    .groupBy(usageEvents.roomId);
  for (const row of rows) {
    costs.set(String(row.roomId), Number(row.costUsd));
  }
  return costs;
}

// Months are counted in Brazil's time (UTC-3, no daylight saving)
export function monthRange(month: string) {
  const [year, index] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, index - 1, 1, 3));
  const end = new Date(Date.UTC(year, index, 1, 3));
  return { start, end };
}

export function currentMonth(now = new Date()) {
  const brazil = new Date(now.getTime() - 3 * 3600 * 1000);
  return `${brazil.getUTCFullYear()}-${String(brazil.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Video seconds used so far this month (Daily's free allowance is monthly)
export async function getMonthVideoSeconds(now = new Date()) {
  const { start } = monthRange(currentMonth(now));
  const [row] = await db
    .select({
      seconds: sql<number>`coalesce(sum(${usageEvents.quantity}), 0)`,
    })
    .from(usageEvents)
    .where(
      and(eq(usageEvents.service, "video"), gte(usageEvents.createdAt, start)),
    );
  return Number(row?.seconds ?? 0);
}

// Totals by service for a month ("2026-09")
export async function getMonthUsage(month: string) {
  const { start, end } = monthRange(month);
  const rows = await db
    .select({
      service: usageEvents.service,
      quantity: sql<number>`coalesce(sum(${usageEvents.quantity}), 0)`,
      costUsd: sql<number>`coalesce(sum(${usageEvents.costUsd}), 0)`,
    })
    .from(usageEvents)
    .where(
      and(gte(usageEvents.createdAt, start), lt(usageEvents.createdAt, end)),
    )
    .groupBy(usageEvents.service);
  return summarize(rows);
}

export interface RoomMonthUsage {
  roomName: string;
  roomId: string | null;
  firstUse: Date;
  lastUse: Date;
  services: Partial<Record<UsageService, ServiceTotal>>;
  totalUsd: number;
}

// Each meeting of a month with its totals by service, newest first
export async function getMonthRooms(month: string) {
  const { start, end } = monthRange(month);
  const rows = await db
    .select({
      roomName: usageEvents.roomName,
      roomId: usageEvents.roomId,
      service: usageEvents.service,
      quantity: sql<number>`coalesce(sum(${usageEvents.quantity}), 0)`,
      costUsd: sql<number>`coalesce(sum(${usageEvents.costUsd}), 0)`,
      firstUse: sql<string>`min(${usageEvents.createdAt})`,
      lastUse: sql<string>`max(${usageEvents.createdAt})`,
    })
    .from(usageEvents)
    .where(
      and(gte(usageEvents.createdAt, start), lt(usageEvents.createdAt, end)),
    )
    .groupBy(usageEvents.roomName, usageEvents.roomId, usageEvents.service);

  const byRoom = new Map<string, RoomMonthUsage>();
  for (const row of rows) {
    const key = `${row.roomName}|${row.roomId ?? ""}`;
    const firstUse = asUtcDate(row.firstUse);
    const lastUse = asUtcDate(row.lastUse);
    let room = byRoom.get(key);
    if (!room) {
      room = {
        roomName: String(row.roomName),
        roomId: row.roomId ? String(row.roomId) : null,
        firstUse,
        lastUse,
        services: {},
        totalUsd: 0,
      };
      byRoom.set(key, room);
    }
    const service = row.service as UsageService;
    const costUsd = Number(row.costUsd);
    room.services[service] = {
      service,
      quantity: Number(row.quantity),
      costUsd,
    };
    room.totalUsd += costUsd;
    if (firstUse < room.firstUse) room.firstUse = firstUse;
    if (lastUse > room.lastUse) room.lastUse = lastUse;
  }
  return [...byRoom.values()].sort(
    (a, b) => b.firstUse.getTime() - a.firstUse.getTime(),
  );
}

// Raw SQL aggregates of a "timestamp" column come back as text in UTC
function asUtcDate(value: unknown) {
  if (value instanceof Date) return value;
  return new Date(`${String(value).replace(" ", "T")}Z`);
}

// (the lazy db client types query rows loosely)
function summarize(rows: Record<string, unknown>[]) {
  const services: ServiceTotal[] = rows.map((row) => ({
    service: row.service as UsageService,
    quantity: Number(row.quantity),
    costUsd: Number(row.costUsd),
  }));
  const totalUsd = services.reduce((sum, s) => sum + s.costUsd, 0);
  return { services, totalUsd };
}
