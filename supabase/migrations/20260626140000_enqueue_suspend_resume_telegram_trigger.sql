/*
  # Reliable Telegram notice on contract suspend / resume (DB trigger)

  BUG: /api/indices/trades/[id]/suspend resolved the Telegram channel with the
  USER's client (createServerClient → anon + RLS). RLS on telegram_channels
  blocks that read for normal users, so `channel` came back null and NO
  telegram_outbox row was ever inserted — the contract was suspended but no
  alert was sent. (The new-high alert works because it fires from a
  SECURITY DEFINER trigger that bypasses RLS.)

  FIX: enqueue the suspend/resume notice from a SECURITY DEFINER trigger on
  index_trades, mirroring enqueue_new_high_alert. It bypasses RLS, resolves the
  channel reliably, posts at high priority (so a busy new-high queue can't
  starve it), and kicks the outbox processor immediately. A 2-minute
  same-type dedupe guard prevents duplicates if the API path is later fixed to
  also enqueue.
*/

CREATE OR REPLACE FUNCTION public.enqueue_suspend_alert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_type  text;
  v_chat  text;
  v_auth  text;
  v_label text;
  v_msg   text;
begin
  -- Only on a real status transition into/out of 'suspended'.
  if NEW.status = OLD.status then return NEW; end if;
  if NEW.status = 'suspended' and coalesce(OLD.status,'') <> 'suspended' then
    v_type := 'trade_suspended';
  elsif OLD.status = 'suspended' and NEW.status = 'active' then
    v_type := 'trade_resumed';
  else
    return NEW;
  end if;

  if coalesce(NEW.telegram_send_enabled, true) = false then return NEW; end if;

  -- Resolve the destination chat (definer → bypasses RLS).
  if NEW.telegram_channel_id is not null then
    select channel_id into v_chat from telegram_channels where id = NEW.telegram_channel_id;
    if v_chat is null then v_chat := NEW.telegram_channel_id::text; end if;
  end if;
  if v_chat is null and NEW.analysis_id is not null then
    select coalesce(tc.channel_id, a.telegram_channel_id::text) into v_chat
    from index_analyses a
    left join telegram_channels tc on tc.id = a.telegram_channel_id
    where a.id = NEW.analysis_id;
  end if;
  if v_chat is null then return NEW; end if;

  -- Dedupe: skip if the same notice for this trade was queued in the last 2 min.
  if exists (
    select 1 from telegram_outbox o
    where o.message_type = v_type
      and (o.payload->'trade'->>'id') = NEW.id::text
      and o.created_at > now() - interval '2 minutes'
  ) then
    return NEW;
  end if;

  v_label := case
    when NEW.option_type is not null
      then NEW.underlying_index_symbol || ' $' || NEW.strike || ' ' || upper(NEW.option_type)
    else NEW.underlying_index_symbol || ' ' || upper(coalesce(NEW.direction, ''))
  end;

  if v_type = 'trade_suspended' then
    v_msg := '⛔️ <b>وقف متابعة العقد | CONTRACT SUSPENDED</b>' || E'\n\n'
      || '<b>' || v_label || '</b>' || E'\n'
      || coalesce('<code>' || NEW.polygon_option_ticker || '</code>' || E'\n', '')
      || E'\n'
      || 'تم إيقاف متابعة هذا العقد ولن يصدر تحديثات بعد الآن.' || E'\n'
      || 'Tracking for this contract has been stopped — no further updates will be sent.';
  else
    v_msg := '✅ <b>استئناف متابعة العقد | CONTRACT RESUMED</b>' || E'\n\n'
      || '<b>' || v_label || '</b>' || E'\n'
      || coalesce('<code>' || NEW.polygon_option_ticker || '</code>' || E'\n', '')
      || E'\n'
      || 'تمت إعادة تفعيل متابعة هذا العقد.' || E'\n'
      || 'Tracking for this contract has been re-enabled.';
  end if;

  insert into telegram_outbox(message_type, payload, channel_id, status, priority, next_retry_at)
  values(
    v_type,
    jsonb_build_object('trade', to_jsonb(NEW), 'message', v_msg),
    v_chat, 'pending', 8, now()
  );

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

DROP TRIGGER IF EXISTS trg_enqueue_suspend_alert ON public.index_trades;
CREATE TRIGGER trg_enqueue_suspend_alert
  AFTER UPDATE OF status ON public.index_trades
  FOR EACH ROW
  EXECUTE FUNCTION enqueue_suspend_alert();
