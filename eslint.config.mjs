import next from "eslint-config-next";

const config = [
  ...next,
  { ignores: [".next/**", ".data/**", "node_modules/**", "admin-os/**"] },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/set-state-in-effect": "off",
      "react/no-unescaped-entities": "off",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
export default config;
