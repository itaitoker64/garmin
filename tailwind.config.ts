import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        plane: "#0d0d0d",
        surface: {
          DEFAULT: "#161615",
          raised: "#1a1a19",
          border: "#2c2c2a",
          baseline: "#383835",
        },
        ink: {
          primary: "#ffffff",
          secondary: "#c3c2b7",
          muted: "#898781",
        },
        series: {
          blue: "#3987e5",
          aqua: "#199e70",
          yellow: "#c98500",
          green: "#008300",
          violet: "#9085e9",
          red: "#e66767",
          magenta: "#d55181",
          orange: "#d95926",
        },
        status: {
          good: "#0ca30c",
          warning: "#fab219",
          serious: "#ec835a",
          critical: "#d03b3b",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
