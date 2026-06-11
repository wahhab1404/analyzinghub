/*
  # New-high peak alert: post a fresh message per peak (not edit-in-place)

  Reverts the in-place editing behaviour: the analyst wants every new contract
  high to arrive as a NEW Telegram message (a fresh card / notification) rather
  than silently editing the existing peak card. We therefore stop sending
  editMessageId/editChatId in the payload, so the outbox processor always does a
  fresh send.

  Cadence stays at the 3s cooldown (per the analyst's choice). Note Telegram
  rate-limits a group to ~20 messages/min, so a very fast rally is naturally
  throttled by the outbox retry/backoff — messages are delayed, never lost.

  All gates unchanged: >=5% gain, exceeds-last-alerted-price, 3s cooldown,
  dispatcher de-dup via last_peak_alert_at/price.
*/

CREATE OR REPLACE FUNCTION public.enqueue_new_high_alert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_entry    numeric;
  v_gain     numeric;
  v_chat     text;
  v_auth     text;
  v_min_gain numeric  := 0.05;                -- require >= +5% from entry
  v_cooldown interval := interval '3 seconds'; -- spacing between fresh peak messages
begin
  -- React only to a genuine increase in the contract high.
  if NEW.contract_high_since is null then return NEW; end if;
  if NEW.contract_high_since <= coalesce(OLD.contract_high_since, 0) then return NEW; end if;
  if NEW.status <> 'active' then return NEW; end if;
  if coalesce(NEW.telegram_send_enabled, true) = false then return NEW; end if;
  if coalesce(NEW.is_using_manual_price, false) then return NEW; end if;

  -- Minimum gain from entry.
  v_entry := coalesce(
    (NEW.entry_contract_snapshot->>'mid')::numeric,
    (NEW.entry_contract_snapshot->>'price')::numeric,
    (NEW.entry_contract_snapshot->>'last')::numeric, 0);
  if v_entry <= 0 then return NEW; end if;
  v_gain := (NEW.contract_high_since - v_entry) / v_entry;
  if v_gain < v_min_gain then return NEW; end if;

  -- Must exceed the last alerted price, and respect the cooldown.
  if coalesce(OLD.last_peak_alert_price, 0) > 0
     and NEW.contract_high_since <= OLD.last_peak_alert_price then
    return NEW;
  end if;
  if OLD.last_peak_alert_at is not null and (now() - OLD.last_peak_alert_at) < v_cooldown then
    return NEW;
  end if;

  -- Resolve the Telegram chat id (direct channel, else the analysis channel).
  if NEW.telegram_channel_id is not null then
    select channel_id into v_chat from telegram_channels where id::text = NEW.telegram_channel_id::text;
    if v_chat is null then v_chat := NEW.telegram_channel_id::text; end if;
  end if;
  if v_chat is null and NEW.analysis_id is not null then
    select coalesce(tc.channel_id, a.telegram_channel_id::text) into v_chat
    from index_analyses a
    left join telegram_channels tc on tc.id::text = a.telegram_channel_id::text
    where a.id = NEW.analysis_id;
  end if;
  if v_chat is null then return NEW; end if;

  -- Queue a FRESH new_high message (no editMessageId → outbox posts a new card).
  insert into telegram_outbox(message_type, payload, channel_id, status, priority, next_retry_at)
  values(
    'new_high',
    jsonb_build_object(
      'trade', to_jsonb(NEW),
      'highPrice', NEW.contract_high_since,
      'isTestingMode', coalesce(NEW.is_testing, false)
    ),
    v_chat, 'pending', 8, now()
  );

  -- Record the alert on this same row so the slower edge dispatcher does not duplicate it.
  NEW.last_peak_alert_at    := now();
  NEW.last_peak_alert_price := NEW.contract_high_since;

  -- Best-effort immediate flush via the outbox processor (auth reused from cron job).
  begin
    select (regexp_matches(command, 'Bearer ([A-Za-z0-9._-]+)'))[1] into v_auth
    from cron.job
    where command like '%/telegram-outbox-processor%' and command like '%Bearer %'
    limit 1;
    if v_auth is not null then
      perform net.http_post(
        url := 'https://gbdzhdlpbwrnhykmstic.supabase.co/functions/v1/telegram-outbox-processor',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_auth),
        body := '{}'::jsonb,
        timeout_milliseconds := 5000
      );
    end if;
  exception when others then
    null; -- cron will deliver within the next cycle
  end;

  return NEW;
exception when others then
  return NEW;  -- never block a price update
end;
$function$;
