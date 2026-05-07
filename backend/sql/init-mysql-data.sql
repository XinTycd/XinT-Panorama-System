-- XinT-Panorama-System MySQL initial data.
-- If you changed database.mysql.table in config.json, replace `panoramas`
-- with your configured table name before importing this file manually.

INSERT INTO `panoramas`
  (
    `id`,
    `panorama_no`,
    `name`,
    `description`,
    `source_type`,
    `original_url`,
    `viewer_path`,
    `thumbnail_path`,
    `size`,
    `width`,
    `height`,
    `created_at`
  )
VALUES
  (
    'demo-panorama',
    1000,
    'XinTycd Demo Panorama',
    '内置演示全景图',
    'backend-demo',
    NULL,
    '/assets/demo-panorama.svg',
    '/assets/demo-panorama.svg',
    NULL,
    4096,
    2048,
    '2026-04-09T12:00:00.000Z'
  )
ON DUPLICATE KEY UPDATE
  `panorama_no` = VALUES(`panorama_no`),
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `source_type` = VALUES(`source_type`),
  `original_url` = VALUES(`original_url`),
  `viewer_path` = VALUES(`viewer_path`),
  `thumbnail_path` = VALUES(`thumbnail_path`),
  `size` = VALUES(`size`),
  `width` = VALUES(`width`),
  `height` = VALUES(`height`),
  `created_at` = VALUES(`created_at`);
