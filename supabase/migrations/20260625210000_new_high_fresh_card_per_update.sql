/*
  # New-high Telegram alerts: a FRESH card per new high (no edit-in-place)

  By request: every new contract high should post a brand-new Telegram card
  instead of editing the previous one in place. This reverts the edit-in-place
  behaviour from 20260625180000 — the trigger no longer passes editMessageId /
  editChatId, so the outbox processor always sends a fresh card (and still
  records peak_alert_message_id, harmlessly).

  The 3-second cooldown is kept so a fast run-up still can't post more than one
  card every few seconds.
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
  v_min_gain numeric  := 0.05;
  v_cooldown interval := interval '3 seconds';
begin
  if NEW.contract_high_since is null then return NEW; end if;
  if NEW.contract_high_since <= coalesce(OLD.contract_high_since, 0) then return NEW; end if;
  if NEW.status <> 'active' then return NEW; end if;
  if coalesce(NEW.telegram_send_enabled, true) = false then return NEW; end if;
  if coalesce(NEW.is_using_manual_price, false) then return NEW; end if;

  v_entry := coalesce(
    (NEW.entry_contract_snapshot->>'mid')::numeric,
    (NEW.entry_contract_snapshot->>'price')::numeric,
    (NEW.entry_contract_snapshot->>'last')::numeric, 0);
  if v_entry <= 0 then return NEW; end if;
  v_gain := (NEW.contract_high_since - v_entry) / v_entry;
  if v_gain < v_min_gain then return NEW; end if;

  -- Only a genuine NEW high (strictly above the last alerted value)...
  if coalesce(OLD.last_peak_alert_price, 0) > 0
     and NEW.contract_high_since <= OLD.last_peak_alert_price then
    return NEW;
  end if;
  -- ...and respect a short cooldown so we never spam more than ~1 card / 3s.
  if OLD.last_peak_alert_at is not null and (now() - OLD.last_peak_alert_at) < v_cooldown then
    return NEW;
  end if;

  -- Resolve the destination chat id.
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

  -- FRESH CARD per new high — no editMessageId/editChatId, so the outbox
  -- processor posts a new message every time.
  insert into telegram_outbox(message_type, payload, channel_id, status, priority, next_retry_at)
  values(
    'new_high',
    jsonb_build_object(
      'trade',         to_jsonb(NEW),
      'highPrice',     NEW.contract_high_since,
      'isTestingMode', coalesce(NEW.is_testing, false)
    ),
    v_chat, 'pending', 8, now()
  );

  NEW.last_peak_alert_at    := now();
  NEW.last_peak_alert_price := NEW.contract_high_since;

  -- Best-effort immediate processor kick (also runs on a 1-min cron).
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
    null;
  end;

  return NEW;
exception when others then
  return NEW;
end;
$function$;
