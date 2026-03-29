/// <reference types="vite/client" />

declare module '*.html?solely' {
  const content: string;
  export default content;
}