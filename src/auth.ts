import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { logger } from "@/lib/logger";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = typeof credentials?.username === "string" ? credentials.username : undefined;
        if (
          credentials?.username === process.env.AUTH_USERNAME &&
          credentials?.password === process.env.AUTH_PASSWORD
        ) {
          logger.info("Auth credentials attempt succeeded", { username });
          return { id: "1", name: username };
        }
        logger.warn("Auth credentials attempt failed", { username });
        return null;
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized: ({ auth }) => {
      const isAuthorized = !!auth;
      logger.info("Auth check evaluated", {
        authorized: isAuthorized,
        user: auth?.user?.name ?? auth?.user?.email ?? undefined,
      });
      return isAuthorized;
    },
  },
});
