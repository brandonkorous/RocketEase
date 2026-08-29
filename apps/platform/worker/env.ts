// Imported first so the process name is set before lib/log initialises.
process.env.RKE_PROCESS = "worker";
import "dotenv/config";
import { startOtel } from "@/lib/otel";

void startOtel("rke-worker");
