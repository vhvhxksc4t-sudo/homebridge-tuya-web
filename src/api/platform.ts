// Legacy file — retained for compatibility. Region selection is now handled in service.ts.
export const TuyaPlatforms = ["tuya", "smart_life", "jinvoo_smart"] as const;
export type TuyaPlatform = (typeof TuyaPlatforms)[number];
