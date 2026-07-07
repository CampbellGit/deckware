/**
 * Theme access for the core renderer. Themes themselves now live as individual
 * files under src/themes/; this module just re-exports the registry so existing
 * imports (`./theme`) keep working.
 */
export type { Theme, ThemeFlat } from "../themes";
export {
  resolveTheme,
  themeVars,
  listThemes,
  googleFontsHref,
  flattenTheme,
} from "../themes";
