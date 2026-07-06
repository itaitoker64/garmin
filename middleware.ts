import { withAuth } from "next-auth/middleware";
import { NEXTAUTH_SECRET } from "@/lib/defaults";

export default withAuth({
  pages: { signIn: "/login" },
  secret: NEXTAUTH_SECRET,
});

export const config = {
  matcher: ["/dashboard/:path*", "/connect/:path*"],
};
