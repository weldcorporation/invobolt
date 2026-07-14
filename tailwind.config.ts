import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand — see Brand Kit
        bolt: {
          amber: "#F5A524",
          amberDark: "#D98A0B",
        },
        ink: "#0B0B0F",
        paid: "#16A34A",
        overdue: "#DC2626",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      fontFeatureSettings: {
        tabular: '"tnum" 1',
      },
    },
  },
  plugins: [],
};

export default config;
