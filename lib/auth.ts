import type { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

// Single-owner app: only the email in OWNER_EMAIL may ever hold a session,
// regardless of which provider it came in through.
const OWNER_EMAIL = process.env.OWNER_EMAIL?.toLowerCase();

export const authOptions: AuthOptions = {
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase().trim();
        const password = credentials?.password ?? "";
        const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
        const adminHash = process.env.ADMIN_PASSWORD_HASH;

        if (!email || !adminEmail || !adminHash) return null;
        if (email !== adminEmail) return null;

        const valid = await bcrypt.compare(password, adminHash);
        if (!valid) return null;

        return { id: adminEmail, email: adminEmail, name: "Coach" };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ user }) {
      if (!OWNER_EMAIL) return true;
      return user.email?.toLowerCase() === OWNER_EMAIL;
    },
  },
};
