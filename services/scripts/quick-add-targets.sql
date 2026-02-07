-- Add targets to PFG analysis (adjust prices as needed)
INSERT INTO analysis_targets (analysis_id, price, expected_time)
VALUES
  ('bfe0cd25-39f7-4beb-a289-06d4ce700c71', 92.00, NULL),  -- TP1
  ('bfe0cd25-39f7-4beb-a289-06d4ce700c71', 95.00, NULL),  -- TP2
  ('bfe0cd25-39f7-4beb-a289-06d4ce700c71', 98.00, NULL);  -- TP3

-- Add targets to NVDA analysis (adjust prices as needed)
INSERT INTO analysis_targets (analysis_id, price, expected_time)
VALUES
  ('206c6e69-3f4f-4f32-9c96-98465999eeb5', 195.00, NULL),  -- TP1
  ('206c6e69-3f4f-4f32-9c96-98465999eeb5', 200.00, NULL),  -- TP2
  ('206c6e69-3f4f-4f32-9c96-98465999eeb5', 205.00, NULL);  -- TP3

-- Verify the targets were added
SELECT
  s.symbol,
  a.direction,
  a.stop_loss,
  at.price as target_price,
  at.expected_time
FROM analyses a
JOIN symbols s ON a.symbol_id = s.id
LEFT JOIN analysis_targets at ON at.analysis_id = a.id
WHERE a.id IN ('bfe0cd25-39f7-4beb-a289-06d4ce700c71', '206c6e69-3f4f-4f32-9c96-98465999eeb5')
ORDER BY a.created_at DESC, at.price ASC;
