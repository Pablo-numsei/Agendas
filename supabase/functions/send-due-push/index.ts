import { createClient } from "npm:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

// This endpoint is called only by Supabase Cron. Keep its shared secret in
// Supabase Vault/Edge Function secrets, never in the website.
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const cronSecret = Deno.env.get("PUSH_CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serverKey = Deno.env.get("PUSH_SUPABASE_SECRET_KEY");
  const keysJson = Deno.env.get("PUSH_VAPID_KEYS_JSON");
  const contactInformation = Deno.env.get("PUSH_VAPID_SUBJECT");
  if (!supabaseUrl || !serverKey || !keysJson || !contactInformation) {
    return new Response("Push server is not configured", { status: 503 });
  }

  const supabase = createClient(supabaseUrl, serverKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const exportedKeys = JSON.parse(keysJson);
    const vapidKeys = await webpush.importVapidKeys(exportedKeys, { extractable: false });
    const appServer = await webpush.ApplicationServer.new({ contactInformation, vapidKeys });
    const [careResult, subscriptionResult] = await Promise.all([
      supabase.from("care_profiles").select("user_id,state"),
      supabase.from("push_subscriptions").select("user_id,endpoint,subscription,timezone"),
    ]);
    if (careResult.error || subscriptionResult.error) throw new Error("Could not read reminder settings.");

    const profiles = new Map((careResult.data || []).map((row) => [row.user_id, row.state]));
    const now = new Date();
    let sent = 0;
    for (const row of subscriptionResult.data || []) {
      const reminder = profiles.get(row.user_id)?.reminder;
      if (!reminder?.enabled || reminder.paused) continue;
      const timezone = validTimezone(row.timezone);
      const local = localClock(now, timezone);
      const selectedDays = Array.isArray(reminder.days) ? reminder.days : [1, 2, 3, 4, 5];
      if (local.time !== reminder.time || !selectedDays.includes(local.weekday)) continue;

      // Do not remind someone who has already checked in today.
      const checkins = profiles.get(row.user_id)?.checkins || [];
      if (checkins.some((checkin: { date?: string }) => checkin.date === local.date)) continue;

      const { error: claimError } = await supabase.from("push_delivery_log").insert({
        user_id: row.user_id,
        endpoint: row.endpoint,
        local_date: local.date,
        scheduled_time: local.time,
      });
      if (claimError) {
        if (claimError.code === "23505") continue; // Already sent for this user's local minute.
        throw claimError;
      }

      try {
        const subscriber = appServer.subscribe(row.subscription);
        await subscriber.pushTextMessage(JSON.stringify({
          title: "Um momento para você 🌿",
          body: "Como você está hoje? Se quiser, faça seu check-in.",
        }), { ttl: 300 });
        sent++;
      } catch (error) {
        if (error instanceof webpush.PushMessageError && error.isGone()) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", row.endpoint);
        } else {
          // Allow a later retry if the push provider is temporarily unavailable.
          await supabase.from("push_delivery_log").delete()
          .eq("user_id", row.user_id).eq("endpoint", row.endpoint)
          .eq("local_date", local.date).eq("scheduled_time", local.time);
          console.error("Push delivery failed:", error);
        }
      }
    }
    return Response.json({ sent });
  } catch (error) {
    console.error("Reminder dispatch failed:", error);
    return new Response("Reminder dispatch failed", { status: 500 });
  }
});

function validTimezone(value: string | null): string {
  try {
    const timezone = value || "UTC";
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return timezone;
  } catch {
    return "UTC";
  }
}

function localClock(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "00";
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(date);
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
    weekday: weekdays[weekday] ?? date.getUTCDay(),
  };
}
