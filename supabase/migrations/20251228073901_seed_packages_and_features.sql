/*
  # Seed Packages and Features Data
  
  1. Platform Packages
    - free_trader (active, public)
    - pro_trader (active, coming soon)
    - analyzer_pro (active, coming soon)
    - analyzer_elite (active, invitation only)
  
  2. Package Features
    - All entitlement flags and limits
  
  3. Feature Mappings
    - Map features to each package with appropriate values
*/

-- =====================================================
-- 1. INSERT PLATFORM PACKAGES
-- =====================================================

INSERT INTO public.platform_packages (key, name, description, is_active, is_public)
VALUES
  ('free_trader', 'Free Trader', 'Free access to browse analyses and follow up to 50 analyzers', true, true),
  ('pro_trader', 'Pro Trader', 'Unlimited follows, symbol watchlist, live index updates, advanced alerts, and export features', true, true),
  ('analyzer_pro', 'Analyzer Pro', 'All Pro Trader features plus ability to publish analyses, edit window, extended targets, and live analysis mode', true, true),
  ('analyzer_elite', 'Analyzer Elite', 'All Analyzer Pro features plus unlimited publishing, elite badge, private support, and up to 4 Telegram channels', true, true)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  is_public = EXCLUDED.is_public,
  updated_at = now();

-- =====================================================
-- 2. INSERT PACKAGE FEATURES
-- =====================================================

INSERT INTO public.package_features (key, label, description)
VALUES
  ('follow_analyzers_limit', 'Follow Analyzers Limit', 'Maximum number of analyzers a user can follow'),
  ('telegram_channels_limit', 'Telegram Channels Limit', 'Maximum number of Telegram channels an analyzer can manage'),
  ('publish_limit_per_day', 'Daily Publish Limit', 'Maximum number of analyses that can be published per day'),
  ('can_follow_symbols', 'Follow Symbols', 'Ability to add symbols to watchlist'),
  ('can_export', 'Export Data', 'Ability to export analysis history as PDF/CSV'),
  ('can_telegram_alerts', 'Telegram Alerts', 'Receive notifications via Telegram'),
  ('can_live_index_read', 'Live Index Updates', 'Access to SPX/NDX live index updates'),
  ('can_publish_analyses', 'Publish Analyses', 'Ability to publish market analyses'),
  ('can_live_analysis_mode', 'Live Analysis Mode', 'Post follow-up updates tied to analyses'),
  ('can_extended_targets', 'Extended Targets', 'Add additional targets after publishing'),
  ('can_edit_5min', '5-Minute Edit Window', 'Edit analysis within 5 minutes of publishing'),
  ('has_elite_badge', 'Elite Badge', 'Display Elite badge on profile'),
  ('has_private_support', 'Private Support', 'Access to dedicated support channel')
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description;

-- =====================================================
-- 3. MAP FEATURES TO PACKAGES
-- =====================================================

-- Free Trader mappings
INSERT INTO public.package_feature_map (package_key, feature_key, value_json)
VALUES
  ('free_trader', 'follow_analyzers_limit', '{"value": 50}'),
  ('free_trader', 'telegram_channels_limit', '{"value": 0}'),
  ('free_trader', 'publish_limit_per_day', '{"value": null}'),
  ('free_trader', 'can_follow_symbols', '{"enabled": false}'),
  ('free_trader', 'can_export', '{"enabled": false}'),
  ('free_trader', 'can_telegram_alerts', '{"enabled": false}'),
  ('free_trader', 'can_live_index_read', '{"enabled": false}'),
  ('free_trader', 'can_publish_analyses', '{"enabled": false}'),
  ('free_trader', 'can_live_analysis_mode', '{"enabled": false}'),
  ('free_trader', 'can_extended_targets', '{"enabled": false}'),
  ('free_trader', 'can_edit_5min', '{"enabled": false}'),
  ('free_trader', 'has_elite_badge', '{"enabled": false}'),
  ('free_trader', 'has_private_support', '{"enabled": false}')
ON CONFLICT (package_key, feature_key) DO UPDATE SET
  value_json = EXCLUDED.value_json;

-- Pro Trader mappings
INSERT INTO public.package_feature_map (package_key, feature_key, value_json)
VALUES
  ('pro_trader', 'follow_analyzers_limit', '{"value": null, "unlimited": true}'),
  ('pro_trader', 'telegram_channels_limit', '{"value": 0}'),
  ('pro_trader', 'publish_limit_per_day', '{"value": null}'),
  ('pro_trader', 'can_follow_symbols', '{"enabled": true}'),
  ('pro_trader', 'can_export', '{"enabled": true}'),
  ('pro_trader', 'can_telegram_alerts', '{"enabled": true}'),
  ('pro_trader', 'can_live_index_read', '{"enabled": true}'),
  ('pro_trader', 'can_publish_analyses', '{"enabled": false}'),
  ('pro_trader', 'can_live_analysis_mode', '{"enabled": false}'),
  ('pro_trader', 'can_extended_targets', '{"enabled": false}'),
  ('pro_trader', 'can_edit_5min', '{"enabled": false}'),
  ('pro_trader', 'has_elite_badge', '{"enabled": false}'),
  ('pro_trader', 'has_private_support', '{"enabled": false}')
ON CONFLICT (package_key, feature_key) DO UPDATE SET
  value_json = EXCLUDED.value_json;

-- Analyzer Pro mappings
INSERT INTO public.package_feature_map (package_key, feature_key, value_json)
VALUES
  ('analyzer_pro', 'follow_analyzers_limit', '{"value": null, "unlimited": true}'),
  ('analyzer_pro', 'telegram_channels_limit', '{"value": 2}'),
  ('analyzer_pro', 'publish_limit_per_day', '{"value": 20}'),
  ('analyzer_pro', 'can_follow_symbols', '{"enabled": true}'),
  ('analyzer_pro', 'can_export', '{"enabled": true}'),
  ('analyzer_pro', 'can_telegram_alerts', '{"enabled": true}'),
  ('analyzer_pro', 'can_live_index_read', '{"enabled": true}'),
  ('analyzer_pro', 'can_publish_analyses', '{"enabled": true}'),
  ('analyzer_pro', 'can_live_analysis_mode', '{"enabled": true}'),
  ('analyzer_pro', 'can_extended_targets', '{"enabled": true}'),
  ('analyzer_pro', 'can_edit_5min', '{"enabled": true}'),
  ('analyzer_pro', 'has_elite_badge', '{"enabled": false}'),
  ('analyzer_pro', 'has_private_support', '{"enabled": false}')
ON CONFLICT (package_key, feature_key) DO UPDATE SET
  value_json = EXCLUDED.value_json;

-- Analyzer Elite mappings
INSERT INTO public.package_feature_map (package_key, feature_key, value_json)
VALUES
  ('analyzer_elite', 'follow_analyzers_limit', '{"value": null, "unlimited": true}'),
  ('analyzer_elite', 'telegram_channels_limit', '{"value": 4}'),
  ('analyzer_elite', 'publish_limit_per_day', '{"value": null, "unlimited": true}'),
  ('analyzer_elite', 'can_follow_symbols', '{"enabled": true}'),
  ('analyzer_elite', 'can_export', '{"enabled": true}'),
  ('analyzer_elite', 'can_telegram_alerts', '{"enabled": true}'),
  ('analyzer_elite', 'can_live_index_read', '{"enabled": true}'),
  ('analyzer_elite', 'can_publish_analyses', '{"enabled": true}'),
  ('analyzer_elite', 'can_live_analysis_mode', '{"enabled": true}'),
  ('analyzer_elite', 'can_extended_targets', '{"enabled": true}'),
  ('analyzer_elite', 'can_edit_5min', '{"enabled": true}'),
  ('analyzer_elite', 'has_elite_badge', '{"enabled": true}'),
  ('analyzer_elite', 'has_private_support', '{"enabled": true}')
ON CONFLICT (package_key, feature_key) DO UPDATE SET
  value_json = EXCLUDED.value_json;
