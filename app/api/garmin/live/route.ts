import { NextRequest } from "next/server";
import { garminLive } from "@/lib/garminFn";
import { handleGarminData } from "@/lib/garminRoute";

export async function GET(req: NextRequest) {
  return handleGarminData(req, garminLive);
}
