// middleware.ts
export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/app/:path*",
    "/api/estates/:path*"
  ]
};