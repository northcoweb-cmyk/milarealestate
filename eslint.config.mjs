import next from "eslint-config-next";

export default [
  ...next,
  { ignores: [".next/**", ".data/**", "node_modules/**"] },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];
