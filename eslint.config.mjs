import next from "eslint-config-next";

/** Flat ESLint config (ESLint 9 / Next 16). eslint-config-next ships a ready
 *  flat-config array, so we just spread it and add our ignores. */
const eslintConfig = [
  ...next,
  {
    ignores: [".next/**", "node_modules/**", "out/**"],
  },
];

export default eslintConfig;
