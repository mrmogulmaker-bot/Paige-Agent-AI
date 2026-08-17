import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Faithful-ported Claude Design packs (§63): the Solo shell (src/solo) and the
    // Agency + Sub-account shell (src/agency) are untyped JS→TSX fixture screens that
    // intentionally carry `// @ts-nocheck` (the source is a React-UMD SPA, ported
    // byte-faithfully — retyping it would drift the owner-locked design). Scope the
    // ban-ts-comment rule OFF for these directories only so the ports pass lint without
    // being rewritten. All other rules still apply.
    files: ["src/solo/**/*.{ts,tsx}", "src/agency/**/*.{ts,tsx}"],
    rules: {
      // `@ts-nocheck` header (untyped ported source).
      "@typescript-eslint/ban-ts-comment": "off",
      // Faithful port keeps the source's `let` and canvas draw-expression style verbatim
      // (e.g. `let rng`, particle `x;y;` statements). Rewriting them would drift the design.
      "prefer-const": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      // Source screens open with an early `if(!x)return null;` guard before their
      // `React.useState` calls (e.g. calendar-book `PublicPage`). Reordering the hook
      // above the guard would rewrite the ported source and drift the approved design.
      "react-hooks/rules-of-hooks": "off",
    },
  },
);
