// Server-only: cloud recordings of meetings, kept by Daily (the API key
// never leaves the server). Only the team starts, stops and downloads them.

const DAILY_API = "https://api.daily.co/v1";

function headers() {
  return {
    Authorization: `Bearer ${process.env.DAILY_API_KEY?.trim() ?? ""}`,
    "Content-Type": "application/json",
  };
}

async function dailyError(res: Response) {
  const body = await res.json().catch(() => null);
  return new Error(
    `Daily ${res.status}: ${body?.info ?? body?.error ?? "erro desconhecido"}`,
  );
}

export interface CloudRecording {
  id: string;
  roomName: string;
  // When it started (ms since epoch)
  startedAt: number;
  // Seconds; 0 while still recording
  duration: number;
  status: string;
}

interface DailyRecording {
  id: string;
  room_name: string;
  start_ts: number;
  duration?: number;
  status: string;
}

function toRecording(r: DailyRecording): CloudRecording {
  return {
    id: r.id,
    roomName: r.room_name,
    startedAt: r.start_ts * 1000,
    duration: r.duration ?? 0,
    status: r.status,
  };
}

// Rooms made before recording existed don't allow it yet: turn it on
async function enableCloudRecording(roomName: string) {
  const res = await fetch(
    `${DAILY_API}/rooms/${encodeURIComponent(roomName)}`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ properties: { enable_recording: "cloud" } }),
    },
  );
  if (!res.ok) throw await dailyError(res);
}

export async function startCloudRecording(roomName: string) {
  await enableCloudRecording(roomName);
  const res = await fetch(
    `${DAILY_API}/rooms/${encodeURIComponent(roomName)}/recordings/start`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ type: "cloud" }),
    },
  );
  if (!res.ok) throw await dailyError(res);
}

export async function stopCloudRecording(roomName: string) {
  const res = await fetch(
    `${DAILY_API}/rooms/${encodeURIComponent(roomName)}/recordings/stop`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ type: "cloud" }),
    },
  );
  if (!res.ok) throw await dailyError(res);
}

// Recordings of a room (newest first), or the most recent ones of all rooms
export async function listCloudRecordings(roomName?: string) {
  const query = new URLSearchParams({ limit: "100" });
  if (roomName) query.set("room_name", roomName);
  const res = await fetch(`${DAILY_API}/recordings?${query}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw await dailyError(res);
  const body = (await res.json()) as { data?: DailyRecording[] };
  return (body.data ?? []).map(toRecording);
}

// A link to download one recording (valid for a few hours)
export async function recordingDownloadLink(id: string) {
  const res = await fetch(
    `${DAILY_API}/recordings/${encodeURIComponent(id)}/access-link`,
    { headers: headers(), cache: "no-store" },
  );
  if (!res.ok) throw await dailyError(res);
  const body = (await res.json()) as { download_link?: string };
  return body.download_link ?? null;
}
