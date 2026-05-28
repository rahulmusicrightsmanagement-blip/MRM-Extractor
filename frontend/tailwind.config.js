/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        mrm: {
          bg: "#0b0f1a",
          card: "#151b2c",
          accent: "#6366f1",
          accent2: "#ec4899",
        },
      },
    },
  },
  plugins: [],
};
