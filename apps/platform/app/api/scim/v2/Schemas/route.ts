import { schemas } from "@/lib/scim/discovery";
import { discoveryRoute } from "../discovery-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = discoveryRoute(() => schemas(), true);
