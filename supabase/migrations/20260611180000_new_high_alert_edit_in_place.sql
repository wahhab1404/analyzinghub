/*
  # New-high peak alert: edit the existing card in place

  ## Problem
  `enqueue_new_high_alert` (the BEFORE-UPDATE trigger on `index_trades` that
  fires on every genuine increase of `contract_high_since`) queued each peak
  alert as a BRAND-NEW Telegram message — it never passed `editMessageId`.
  Every new high therefore posted another card to the channel, so subscribers
  saw a pile of separate peak cards each frozen at its own value (4.00, 4.05,
  4.80 …) instead of a single card that updates live. It also competed with the
  `indices-trade-tracker` edge dispatcher, which DID edit in place, producing
  duplicate/“stuck” cards.

  ## Fix
  When the trade already has a peak card on the channel
  (`peak_alert_message_id` was stored by the outbox processor after the first
  fresh send), include `editMessageId` + `editChatId` in the payload. The
  telegram-outbox-processor then edits that same message in place
  (editMessageMedia → editMessageCaption), so each trade shows ONE live-updating
  peak card. The first peak (no stored message id yet) still posts fresh, and on
  any edit failure the processor falls back to a fresh send and re-stores the id.

  Behaviour is otherwise unchanged: same ≥5% gain gate, same
  exceeds-last-alerted-price gate, same 20s cooldown, same suppression of the
  slower edge dispatcher via last_peak_alert_at/price.
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
  v_payload  jsonb;
  v_edit_msg  text;
  v_edit_chat text;
  v_min_gain numeric  := 0.05;                 -- require >= +5% from entry
  v_cooldown interval := interval '20 seconds'; -- min spacing (Telegram rate-limit safety)
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

  -- Base payload; image is rendered by the outbox processor.
  v_payload := jsonb_build_object(
    'trade', to_jsonb(NEW),
    'highPrice', NEW.contract_high_since,
    'isTestingMode', coalesce(NEW.is_testing, false)
  );

  -- If this trade already has a live peak card on the channel, EDIT it in place
  -- instead of posting a new one. The outbox processor reads editMessageId /
  -- editChatId, re-renders the card, and falls back to a fresh send if the edit
  -- fails (then re-stores peak_alert_message_id).
  v_edit_msg  := OLD.peak_alert_message_id;
  v_edit_chat := coalesce(OLD.peak_alert_chat_id, v_chat);
  if v_edit_msg is not null and v_edit_chat is not null then
    v_payload := v_payload || jsonb_build_object(
      'editMessageId', v_edit_msg,
      'editChatId',    v_edit_chat
    );
  end if;

  insert into telegram_outbox(message_type, payload, channel_id, status, priority, next_retry_at)
  values('new_high', v_payload, v_chat, 'pending', 8, now());

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
